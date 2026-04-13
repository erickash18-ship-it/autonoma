import { query } from '@anthropic-ai/claude-agent-sdk';
import { PROJECT_ROOT, MAX_CONCURRENT_AGENTS, TIMEZONE } from './config.js';
import { logger } from './logger.js';
import fs from 'node:fs';
import path from 'node:path';

// ========== Persona Loading ==========

let _soulCache: string | null = null;

function loadSoul(): string {
  if (_soulCache !== null) return _soulCache;
  const soulPath = path.join(PROJECT_ROOT, 'SOUL.md');
  _soulCache = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf-8').trim() : '';
  return _soulCache;
}

export function clearSoulCache(): void {
  _soulCache = null;
}

function loadHeartbeat(): string {
  const hbPath = path.join(PROJECT_ROOT, 'HEARTBEAT.md');
  if (fs.existsSync(hbPath)) {
    const content = fs.readFileSync(hbPath, 'utf-8').trim();
    if (content) return `## System State (HEARTBEAT.md)\n${content}`;
  }
  return '';
}

function getCurrentTimestamp(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function buildFullPersona(): string {
  const soul = loadSoul();
  const heartbeat = loadHeartbeat();
  const timestamp = `Current time: ${getCurrentTimestamp()}`;
  const parts: string[] = [timestamp];
  if (soul) parts.push(soul);
  if (heartbeat) parts.push(heartbeat);
  return parts.join('\n\n---\n\n');
}

// ========== Concurrency Tracking ==========

interface ActiveAgent {
  taskId: string;
  name: string;
  startedAt: number;
}

const activeAgents = new Map<string, ActiveAgent>();

export function canStartAgent(): boolean {
  return activeAgents.size < MAX_CONCURRENT_AGENTS;
}

export function registerAgent(taskId: string, name: string): void {
  activeAgents.set(taskId, { taskId, name, startedAt: Date.now() });
}

export function unregisterAgent(taskId: string): void {
  activeAgents.delete(taskId);
}

export function getActiveAgents(): ActiveAgent[] {
  return [...activeAgents.values()];
}

// ========== Running Agent Abort Tracking ==========

interface RunningAgent {
  chatId: string;
  abortController: AbortController;
  startedAt: number;
}

const runningAgents = new Map<string, RunningAgent>();

export function trackRunningAgent(chatId: string, ac: AbortController): void {
  runningAgents.set(chatId, { chatId, abortController: ac, startedAt: Date.now() });
}

export function untrackRunningAgent(chatId: string): void {
  runningAgents.delete(chatId);
}

export function isAgentRunning(chatId: string): boolean {
  return runningAgents.has(chatId);
}

export function abortAgent(chatId: string): boolean {
  const agent = runningAgents.get(chatId);
  if (!agent) return false;
  agent.abortController.abort();
  runningAgents.delete(chatId);
  return true;
}

export function abortAllAgents(): number {
  let count = 0;
  for (const [, agent] of runningAgents) {
    agent.abortController.abort();
    count++;
  }
  runningAgents.clear();
  return count;
}

// ========== Agent Timeout (Activity-Based Watchdog) ==========

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

// ========== Global Kill Switch ==========

const KILL_SWITCH_PATH = path.join(PROJECT_ROOT, 'store', 'KILL_SWITCH');

export function isKillSwitchActive(): boolean {
  return fs.existsSync(KILL_SWITCH_PATH);
}

export function activateKillSwitch(): void {
  fs.writeFileSync(KILL_SWITCH_PATH, `Activated at ${new Date().toISOString()}\n`, 'utf-8');
  abortAllAgents();
  logger.warn('KILL SWITCH ACTIVATED -- all agents aborted');
}

export function deactivateKillSwitch(): void {
  try { fs.unlinkSync(KILL_SWITCH_PATH); } catch {}
  logger.info('Kill switch deactivated');
}

// ========== Claude Agent (SDK) ==========

async function runClaudeAgent(
  message: string,
  sessionId?: string,
  modelId?: string,
  effort?: string,
  onProgress?: (p: any) => void,
  abortController?: AbortController,
  timeoutMs?: number,
): Promise<{ text: string | null; newSessionId?: string }> {
  if (isKillSwitchActive()) {
    throw new Error('Kill switch is active -- agent execution blocked');
  }

  let newSessionId: string | undefined;
  let resultText: string | null = null;

  const ac = abortController ?? new AbortController();
  const inactivityLimit = timeoutMs ?? INACTIVITY_TIMEOUT_MS;
  let watchdogTimer: ReturnType<typeof setTimeout>;

  const resetWatchdog = () => {
    clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      logger.warn(`Agent inactive for ${inactivityLimit / 1000}s, aborting`);
      ac.abort();
    }, inactivityLimit);
  };

  resetWatchdog();

  try {
    const queryOpts: Parameters<typeof query>[0] = {
      prompt: message,
      options: {
        cwd: PROJECT_ROOT,
        permissionMode: 'bypassPermissions',
        settingSources: ['project', 'user'],
        ...(sessionId ? { resume: sessionId } : {}),
        ...(modelId ? { model: modelId } : {}),
        abortController: ac,
      },
    };

    for await (const event of query(queryOpts)) {
      resetWatchdog();

      if (isKillSwitchActive()) {
        ac.abort();
        throw new Error('Kill switch activated during agent execution');
      }

      if (event.type === 'system' && 'subtype' in event && event.subtype === 'init') {
        newSessionId = (event as any).sessionId;
      }
      if (event.type === 'result') {
        resultText = (event as any).result ?? null;
      }
      if (onProgress) {
        const e = event as any;
        if (e.type === 'assistant' && e.message?.content) {
          for (const block of e.message.content) {
            if (block.type === 'tool_use') {
              onProgress({ type: 'tool_use', tool: block.name, input: block.input });
            } else if (block.type === 'thinking') {
              onProgress({ type: 'thinking', content: block.thinking });
            } else if (block.type === 'text') {
              onProgress({ type: 'text', content: block.text });
            }
          }
        }
      }
    }
  } finally {
    clearTimeout(watchdogTimer!);
  }

  return { text: resultText, newSessionId };
}

// ========== Stale Session Detection ==========

function isStaleSessionError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as any)?.message ?? err).toLowerCase();
  return (
    msg.includes('session') && (msg.includes('not found') || msg.includes('expired') || msg.includes('invalid')) ||
    msg.includes('resume') && (msg.includes('fail') || msg.includes('error')) ||
    msg.includes('could not find session') ||
    msg.includes('no such session')
  );
}

// ========== Unified Agent Runner ==========

export interface AgentOpts {
  message: string;
  sessionId?: string;
  modelId?: string;
  effort?: string;
  abortController?: AbortController;
  noResume?: boolean;
  onTyping?: () => void;
  onProgress?: (progress: any) => void;
}

export async function runAgent(opts: AgentOpts): Promise<{
  text: string | null;
  tokensIn: number;
  tokensOut: number;
  newSessionId?: string;
}> {
  const persona = buildFullPersona();

  let typingTimer: ReturnType<typeof setInterval> | undefined;
  if (opts.onTyping) {
    opts.onTyping();
    typingTimer = setInterval(opts.onTyping, 4000);
  }

  try {
    const sessionId = opts.noResume ? undefined : opts.sessionId;
    let fullMessage: string;
    if (!sessionId) {
      fullMessage = persona ? `${persona}\n\n---\n\n${opts.message}` : opts.message;
    } else {
      const heartbeat = loadHeartbeat();
      fullMessage = heartbeat ? `${heartbeat}\n\n---\n\n${opts.message}` : opts.message;
    }

    try {
      const result = await runClaudeAgent(fullMessage, sessionId, opts.modelId, opts.effort, opts.onProgress, opts.abortController);
      return { text: result.text, tokensIn: 0, tokensOut: 0, newSessionId: result.newSessionId };
    } catch (err) {
      if (sessionId && isStaleSessionError(err)) {
        logger.warn({ sessionId }, 'Stale session detected, retrying without resume');
        const freshMessage = persona ? `${persona}\n\n---\n\n${opts.message}` : opts.message;
        const result = await runClaudeAgent(freshMessage, undefined, opts.modelId, opts.effort, opts.onProgress, opts.abortController);
        return { text: result.text, tokensIn: 0, tokensOut: 0, newSessionId: result.newSessionId };
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, 'Agent query error');
    throw error;
  } finally {
    if (typingTimer) clearInterval(typingTimer);
  }
}
