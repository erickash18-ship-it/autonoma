import { CronExpressionParser } from 'cron-parser';
import { getDueTasks, updateTaskAfterRun } from './db.js';
import { runAgent, isKillSwitchActive } from './agent.js';
import { buildTaskMemoryPrompt } from './task-memory.js';
import { logger } from './logger.js';

type Sender = (chatId: string, text: string) => Promise<void>;
let sender: Sender | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let schedulerReady = false;

const runningScheduledTasks = new Map<string, AbortController>();

export function computeNextRun(cronExpression: string): number {
  return Math.floor(CronExpressionParser.parse(cronExpression).next().getTime() / 1000);
}

export function abortAllScheduledTasks(): number {
  let count = 0;
  for (const [, ac] of runningScheduledTasks) {
    ac.abort();
    count++;
  }
  runningScheduledTasks.clear();
  return count;
}

export async function runDueTasks(): Promise<void> {
  if (!sender || !schedulerReady) return;
  if (isKillSwitchActive()) {
    logger.warn('Scheduler: kill switch active, skipping all tasks');
    return;
  }

  const tasks = getDueTasks();
  for (const task of tasks) {
    if (isKillSwitchActive()) break;

    // Guard: skip if already running
    if (runningScheduledTasks.has(task.id)) {
      logger.debug(`Scheduler: ${task.id} already running, skipping`);
      continue;
    }

    // Guard: fast-forward tasks >2 hours overdue
    const overdueMs = Date.now() - (task.next_run ?? 0) * 1000;
    if (overdueMs > 2 * 60 * 60 * 1000) {
      logger.warn(`Scheduler: ${task.id} is ${Math.round(overdueMs / 3600000)}h overdue, fast-forwarding`);
      updateTaskAfterRun(task.id, computeNextRun(task.schedule), '(Skipped -- was overdue, fast-forwarded)');
      continue;
    }

    logger.info(`Running scheduled task ${task.id}: ${task.prompt.slice(0, 60)}`);
    const ac = new AbortController();
    runningScheduledTasks.set(task.id, ac);

    try {
      // Inject persistent task memory
      const taskMemory = buildTaskMemoryPrompt(task.id, task.prompt);
      const enrichedPrompt = `${taskMemory}\n\n---\n\n${task.prompt}`;
      const result = await runAgent({ message: enrichedPrompt, abortController: ac });
      const resultText = result.text || '(No output)';

      updateTaskAfterRun(task.id, computeNextRun(task.schedule), resultText);

      // Send result to user (skip internal skip messages)
      if (!resultText.startsWith('(Skipped')) {
        await sender(task.chat_id, resultText);
      }
    } catch (error) {
      logger.error({ err: error }, `Scheduled task ${task.id} failed`);
      updateTaskAfterRun(task.id, computeNextRun(task.schedule), `Error: ${error}`);
      if (!ac.signal.aborted) {
        await sender(task.chat_id, `Scheduled task failed: ${error}`);
      }
    } finally {
      runningScheduledTasks.delete(task.id);
    }
  }
}

const BOOT_DELAY_MS = 30_000;

export function initScheduler(send: Sender): void {
  sender = send;
  logger.info(`Scheduler initialized (waiting ${BOOT_DELAY_MS / 1000}s before first run)`);
  setTimeout(() => {
    schedulerReady = true;
    logger.info('Scheduler ready, starting 60s poll');
    runDueTasks().catch(err => logger.error({ err }, 'Scheduler initial tick error'));
    timer = setInterval(() => { runDueTasks().catch(err => logger.error({ err }, 'Scheduler tick error')); }, 60_000);
  }, BOOT_DELAY_MS);
}

export function stopScheduler(): void {
  schedulerReady = false;
  if (timer) { clearInterval(timer); timer = null; }
  abortAllScheduledTasks();
}
