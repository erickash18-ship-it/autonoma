import { logger } from './logger.js';
import {
  PROJECT_ROOT, STORE_DIR, WORKSPACE_DIR,
  TELEGRAM_BOT_TOKEN, MEMORY_MODE, ENABLE_SCHEDULER, GATEWAY_PORT,
  ENABLE_DASHBOARD, BOT_NAME,
} from './config.js';
import { initDatabase } from './db.js';
import { runDecaySweep } from './memory.js';
import { createBot, sendNotification } from './bot.js';
import fs from 'node:fs';
import path from 'node:path';

const BANNER = `
 █████╗ ██╗   ██╗████████╗ ██████╗ ███╗   ██╗ ██████╗ ███╗   ███╗ █████╗
██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗████╗  ██║██╔═══██╗████╗ ████║██╔══██╗
███████║██║   ██║   ██║   ██║   ██║██╔██╗ ██║██║   ██║██╔████╔██║███████║
██╔══██║██║   ██║   ██║   ██║   ██║██║╚██╗██║██║   ██║██║╚██╔╝██║██╔══██║
██║  ██║╚██████╔╝   ██║   ╚██████╔╝██║ ╚████║╚██████╔╝██║ ╚═╝ ██║██║  ██║
╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝
                    Your AI. Your machine. Your rules.
`;

const PID_FILE = path.join(STORE_DIR, 'autonoma.pid');

function acquireLock(): boolean {
  try {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
    if (fs.existsSync(PID_FILE)) {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
      if (!isNaN(oldPid)) {
        try {
          process.kill(oldPid, 0);
          logger.warn(`Another instance (PID ${oldPid}), killing it`);
          process.kill(oldPid, 'SIGTERM');
          const start = Date.now();
          while (Date.now() - start < 2000) { try { process.kill(oldPid, 0); } catch { break; } }
        } catch { /* stale PID */ }
      }
    }
    fs.writeFileSync(PID_FILE, process.pid.toString(), 'utf-8');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Failed to acquire lock');
    return false;
  }
}

function releaseLock(): void {
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
}

async function main() {
  // Ensure bins are in PATH
  const extraPaths = [`${process.env.HOME}/.local/bin`, '/usr/local/bin'];
  const currentPath = process.env.PATH ?? '';
  for (const p of extraPaths) {
    if (!currentPath.includes(p)) process.env.PATH = `${p}:${currentPath}`;
  }

  console.log(BANNER);
  logger.info(`${BOT_NAME} initializing`);

  // First-run check
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('\n  No TELEGRAM_BOT_TOKEN found.');
    console.log('  Run: npm run setup\n');
    process.exit(1);
  }

  if (!acquireLock()) {
    logger.error('Failed to acquire lock. Is another instance running?');
    process.exit(1);
  }

  try {
    // Create directories
    for (const dir of [STORE_DIR, WORKSPACE_DIR]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    // Initialize database
    initDatabase();

    // Clear stale SDK sessions on boot
    try {
      const { clearAllSessions } = await import('./db.js');
      const cleared = clearAllSessions();
      if (cleared > 0) logger.info(`Cleared ${cleared} stale session(s) on boot`);
    } catch (e) { logger.error({ err: e }, 'Session clear error'); }

    // Prune old session history
    try {
      const { pruneOldSessions } = await import('./db.js');
      const pruned = pruneOldSessions(30);
      if (pruned > 0) logger.info(`Pruned ${pruned} old session(s)`);
    } catch (e) { logger.error({ err: e }, 'Session prune error'); }

    // Memory decay sweep
    if (MEMORY_MODE === 'full') {
      runDecaySweep();
      setInterval(() => { try { runDecaySweep(); } catch (e) { logger.error({ err: e }, 'Decay sweep error'); } }, 24 * 60 * 60 * 1000);
    }

    // Start dashboard (optional)
    let gateway: any = null;
    if (ENABLE_DASHBOARD) {
      try {
        const { startGateway } = await import('./gateway.js');
        gateway = startGateway(GATEWAY_PORT);
      } catch (e) { logger.warn({ err: e }, 'Dashboard disabled (gateway.ts not found)'); }
    }

    // Create bot
    const bot = createBot();
    bot.catch((err: unknown) => logger.error({ err }, 'Bot middleware error'));
    await bot.init();
    logger.info(`Telegram bot connected as @${bot.botInfo.username}`);

    // Initialize scheduler
    if (ENABLE_SCHEDULER) {
      const { initScheduler } = await import('./scheduler.js');
      initScheduler(sendNotification);
    }

    // Manual polling loop
    let pollingOffset = -1;
    try {
      const flushUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=-1&limit=1&timeout=0`;
      const flushRes = await fetch(flushUrl);
      const flushData = (await flushRes.json()) as { ok: boolean; result?: any[] };
      if (flushData.ok && flushData.result && flushData.result.length > 0) {
        pollingOffset = flushData.result[flushData.result.length - 1].update_id + 1;
        logger.info(`Flushed stale updates, polling from offset ${pollingOffset}`);
      } else {
        pollingOffset = 0;
      }
    } catch (e) {
      logger.error({ err: e }, 'Failed to flush stale updates');
      pollingOffset = 0;
    }
    let pollingActive = true;

    async function pollLoop() {
      while (pollingActive) {
        try {
          const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${pollingOffset}&timeout=30&limit=100&allowed_updates=${encodeURIComponent(JSON.stringify(['message', 'callback_query']))}`;
          const res = await fetch(url);
          const data = (await res.json()) as { ok: boolean; result?: any[] };
          if (data.ok && data.result && data.result.length > 0) {
            for (const update of data.result) {
              pollingOffset = update.update_id + 1;
              try { await bot.handleUpdate(update); }
              catch (e) { logger.error({ err: e }, '[POLL] Handler error'); }
            }
          }
        } catch (e) {
          logger.error({ err: e }, '[POLL] Fetch error');
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    pollLoop().catch(err => logger.error({ err }, '[POLL] Loop crashed'));
    logger.info('Manual polling loop started');

    // Graceful shutdown
    const shutdown = (signal: string) => {
      logger.info(`Received ${signal}, shutting down`);
      pollingActive = false;
      if (gateway) gateway.close(() => logger.info('Gateway closed'));
      releaseLock();
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    logger.info(`${BOT_NAME} is running`);
  } catch (error) {
    logger.error({ err: error }, 'Fatal error during startup');
    releaseLock();
    process.exit(1);
  }
}

main().catch(error => {
  logger.error({ err: error }, 'Unhandled error in main');
  releaseLock();
  process.exit(1);
});
