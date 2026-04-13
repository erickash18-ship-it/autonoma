import { Bot, Context, Api } from 'grammy';
import {
  TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID, MAX_MESSAGE_LENGTH,
  TYPING_REFRESH_MS, ENABLE_VOICE, ENABLE_TTS, BOT_NAME,
  ENABLE_SCHEDULER, ENABLE_CALENDAR,
} from './config.js';
import {
  getSession, setSession, clearSession, getCliSession, setCliSession,
  clearCliSession, clearAllCliSessions, listSessionHistory, setSessionName,
  deleteSessionHistory, getActiveModel, setActiveModel, clearActiveModel,
  getActiveEffort, setActiveEffort, clearActiveEffort, getVerbosity,
  setVerbosity, getMemoryCount, getAllScheduledTasks, createScheduledTask,
  deleteScheduledTask, setScheduledTaskStatus, getKvState, setKvState,
} from './db.js';
import { runAgent, isAgentRunning, abortAgent, trackRunningAgent, untrackRunningAgent,
  isKillSwitchActive, activateKillSwitch, deactivateKillSwitch } from './agent.js';
import { buildMemoryContext, saveConversationTurn } from './memory.js';
import { detectIntent } from './intent.js';
import {
  resolveModelAlias, getModelDisplayName, getModelsForPicker,
  getEffortLevels, EFFORT_EMOJI,
} from './models.js';
import { logger } from './logger.js';
import { computeNextRun } from './scheduler.js';

// ========== Telegram Helpers ==========

function isAuthorised(chatId: string): boolean {
  if (!ALLOWED_CHAT_ID) return true; // no restriction
  return chatId === ALLOWED_CHAT_ID;
}

function splitMessage(text: string, maxLen = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitIdx = remaining.lastIndexOf('\n', maxLen);
    if (splitIdx === -1 || splitIdx < maxLen * 0.3) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, '');
  }
  return chunks;
}

// Format for Telegram: escape special chars for MarkdownV2 if needed, or just send as plain text
function formatForTelegram(text: string): string {
  // Just return plain text -- Telegram handles most formatting
  return text;
}

// Safe message sender with chunking
let botApi: Api | null = null;

export async function sendNotification(chatId: string, text: string): Promise<void> {
  if (!botApi) return;
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    try {
      await botApi.sendMessage(parseInt(chatId), chunk);
    } catch (e) {
      logger.error({ err: e }, 'Failed to send notification');
    }
  }
}

async function safeSendMessage(ctx: Context, text: string): Promise<void> {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk);
    } catch (e) {
      logger.error({ err: e }, 'Failed to send message');
    }
  }
}

// ========== Bot Creation ==========

const startTime = Date.now();

export function createBot(): Bot {
  const bot = new Bot(TELEGRAM_BOT_TOKEN);
  botApi = bot.api;

  // ---- Auth middleware ----
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId || !isAuthorised(chatId)) {
      if (ctx.message) await ctx.reply('Unauthorized.');
      return;
    }
    await next();
  });

  // ---- /start ----
  bot.command('start', async (ctx) => {
    await ctx.reply(`Welcome to ${BOT_NAME}!\n\nI'm your personal AI assistant powered by Claude. Send me any message and I'll help.\n\nType /help to see available commands.`);
  });

  // ---- /help ----
  bot.command('help', async (ctx) => {
    const lines = [
      `${BOT_NAME} Commands:`,
      '',
      'Session:',
      '  /clear -- Start fresh session',
      '  /newchat -- New chat session',
      '  /sessions -- Browse previous sessions',
      '  /stop -- Abort running agent',
      '',
      'Model:',
      '  /model -- Show/switch model',
      '  /models -- List available models',
      '  /effort -- Set thinking effort',
      '  /verbosity -- Set progress display',
      '',
      'Memory:',
      '  /memory -- Show memory stats',
      '  /remember <text> -- Save to memory',
      '',
      'System:',
      '  /status -- System health',
      '  /uptime -- Bot uptime',
      '  /killswitch -- Emergency stop',
      '  /chatid -- Show your chat ID',
    ];
    if (ENABLE_SCHEDULER) {
      lines.push('', 'Scheduling:',
        '  /schedule -- List tasks',
        '  /schedule add "<cron>" <prompt>',
        '  /schedule pause|resume|delete <id>',
      );
    }
    if (ENABLE_VOICE) {
      lines.push('', 'Voice:',
        '  /voice -- Toggle voice responses',
        '  Send voice message to chat',
      );
    }
    await ctx.reply(lines.join('\n'));
  });

  // ---- /status ----
  bot.command('status', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    const cli = 'claude';
    const model = getActiveModel(chatId, cli) ?? 'claude-sonnet-4-6';
    const effort = getActiveEffort(chatId, cli) ?? 'medium';
    const memCount = getMemoryCount(chatId);
    const tasks = ENABLE_SCHEDULER ? getAllScheduledTasks() : [];
    const activeTasks = tasks.filter((t: any) => t.status === 'active').length;

    const lines = [
      `System Status`,
      `Model: ${getModelDisplayName(model)}`,
      `Effort: ${effort}`,
      `Memories: ${memCount}`,
      `Kill switch: ${isKillSwitchActive() ? 'ACTIVE' : 'off'}`,
    ];
    if (ENABLE_SCHEDULER) lines.push(`Scheduled tasks: ${activeTasks} active / ${tasks.length} total`);
    await ctx.reply(lines.join('\n'));
  });

  // ---- /uptime ----
  bot.command('uptime', async (ctx) => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    await ctx.reply(`Uptime: ${hours}h ${mins}m`);
  });

  // ---- /chatid ----
  bot.command('chatid', async (ctx) => {
    await ctx.reply(`Chat ID: ${ctx.chat!.id}`);
  });

  // ---- /clear ----
  bot.command('clear', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    clearSession(chatId);
    clearCliSession(chatId, 'claude');
    await ctx.reply('Session cleared. Starting fresh.');
  });

  // ---- /newchat ----
  bot.command('newchat', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    clearCliSession(chatId, 'claude');
    await ctx.reply('New chat started.');
  });

  // ---- /sessions ----
  bot.command('sessions', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    const history = listSessionHistory(chatId, 'claude', 10);
    if (history.length === 0) {
      await ctx.reply('No session history yet.');
      return;
    }
    const lines = history.map((s: any, i: number) => {
      const date = new Date(s.last_used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const name = s.display_name || `Session ${i + 1}`;
      return `${i + 1}. ${name} (${date}) [${s.session_id.slice(0, 8)}]`;
    });
    await ctx.reply(`Recent sessions:\n${lines.join('\n')}\n\nReply with session number to resume, or "name <num> <name>" to rename.`);
  });

  // ---- /stop ----
  bot.command('stop', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    const aborted = abortAgent(chatId);
    await ctx.reply(aborted ? 'Agent aborted.' : 'No agent running.');
  });

  // ---- /killswitch ----
  bot.command('killswitch', async (ctx) => {
    if (isKillSwitchActive()) {
      deactivateKillSwitch();
      await ctx.reply('Kill switch deactivated. Agents can run again.');
    } else {
      activateKillSwitch();
      await ctx.reply('KILL SWITCH ACTIVATED. All agents stopped.');
    }
  });

  // ---- /model ----
  bot.command('model', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    const arg = ctx.match?.toString().trim();

    if (!arg) {
      const current = getActiveModel(chatId, 'claude') ?? 'claude-sonnet-4-6';
      await ctx.reply(`Current model: ${getModelDisplayName(current)}\n\nUse /model <name> to switch (opus, sonnet, haiku)`);
      return;
    }

    const resolved = resolveModelAlias(arg);
    if (!resolved) {
      await ctx.reply(`Unknown model: ${arg}\n\nAvailable: opus, sonnet, haiku`);
      return;
    }
    setActiveModel(chatId, 'claude', resolved.modelId);
    clearCliSession(chatId, 'claude'); // New model = new session
    await ctx.reply(`Switched to ${getModelDisplayName(resolved.modelId)}`);
  });

  // ---- /models ----
  bot.command('models', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    const current = getActiveModel(chatId, 'claude') ?? 'claude-sonnet-4-6';
    const models = getModelsForPicker();
    const lines = models.map(m => {
      const active = m.modelId === current ? ' <-- current' : '';
      return `  ${m.label} (${getModelDisplayName(m.modelId)})${active}`;
    });
    await ctx.reply(`Available models:\n${lines.join('\n')}\n\nUse /model <name> to switch.`);
  });

  // ---- /effort ----
  bot.command('effort', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    const arg = ctx.match?.toString().trim().toLowerCase();
    const currentModel = getActiveModel(chatId, 'claude') ?? 'claude-sonnet-4-6';
    const levels = getEffortLevels(currentModel);

    if (!arg) {
      const current = getActiveEffort(chatId, 'claude') ?? 'medium';
      const emoji = EFFORT_EMOJI[current] ?? '';
      await ctx.reply(`Current effort: ${emoji} ${current}\n\nUse /effort <level>: ${levels.map(l => l.value).join(', ')}`);
      return;
    }

    const valid = levels.find(l => l.value === arg);
    if (!valid) {
      await ctx.reply(`Invalid effort: ${arg}\n\nAvailable: ${levels.map(l => l.value).join(', ')}`);
      return;
    }
    setActiveEffort(chatId, 'claude', arg);
    const emoji = EFFORT_EMOJI[arg] ?? '';
    await ctx.reply(`Effort set to ${emoji} ${arg}`);
  });

  // ---- /verbosity ----
  bot.command('verbosity', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    const arg = ctx.match?.toString().trim().toLowerCase();

    if (!arg) {
      const current = getVerbosity(chatId);
      await ctx.reply(`Current verbosity: ${current}\n\nUse /verbosity <level>: silent, milestone, verbose, auto`);
      return;
    }

    if (!['silent', 'milestone', 'verbose', 'auto'].includes(arg)) {
      await ctx.reply('Invalid. Options: silent, milestone, verbose, auto');
      return;
    }
    setVerbosity(chatId, arg);
    await ctx.reply(`Verbosity set to ${arg}`);
  });

  // ---- /memory ----
  bot.command('memory', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    const count = getMemoryCount(chatId);
    await ctx.reply(`Memory stats:\nTotal memories: ${count}\n\nUse /remember <text> to save something.`);
  });

  // ---- /remember ----
  bot.command('remember', async (ctx) => {
    const text = ctx.match?.toString().trim();
    if (!text) {
      await ctx.reply('Usage: /remember <what to remember>');
      return;
    }
    const chatId = ctx.chat!.id.toString();
    const { insertMemory } = await import('./db.js');
    insertMemory(chatId, text, 'semantic', undefined, 3.0);
    await ctx.reply(`Remembered: ${text}`);
  });

  // ---- /schedule ----
  if (ENABLE_SCHEDULER) {
    bot.command('schedule', async (ctx) => {
      const chatId = ctx.chat!.id.toString();
      const args = ctx.match?.toString().trim() ?? '';

      if (!args) {
        const tasks = getAllScheduledTasks();
        if (tasks.length === 0) {
          await ctx.reply('No scheduled tasks.\n\nUse: /schedule add "0 9 * * *" Your prompt here');
          return;
        }
        const lines = tasks.map((t: any) => {
          const status = t.status === 'active' ? 'Active' : 'Paused';
          const next = t.next_run ? new Date(t.next_run * 1000).toLocaleString() : 'N/A';
          return `${t.id.slice(0, 8)} [${status}] ${t.schedule}\n  "${t.prompt.slice(0, 60)}"\n  Next: ${next}`;
        });
        await ctx.reply(`Scheduled tasks:\n\n${lines.join('\n\n')}`);
        return;
      }

      // Parse subcommands
      const addMatch = args.match(/^add\s+"([^"]+)"\s+(.+)$/s);
      if (addMatch) {
        const cron = addMatch[1];
        const prompt = addMatch[2].trim();
        try {
          const nextRun = computeNextRun(cron);
          const id = crypto.randomUUID().slice(0, 12);
          createScheduledTask(id, chatId, prompt, cron, nextRun);
          await ctx.reply(`Task created: ${id.slice(0, 8)}\nSchedule: ${cron}\nPrompt: ${prompt.slice(0, 80)}\nNext run: ${new Date(nextRun * 1000).toLocaleString()}`);
        } catch (e) {
          await ctx.reply(`Invalid cron expression: ${cron}`);
        }
        return;
      }

      const actionMatch = args.match(/^(pause|resume|delete)\s+(\S+)/);
      if (actionMatch) {
        const [, action, idPrefix] = actionMatch;
        const tasks = getAllScheduledTasks();
        const task = tasks.find((t: any) => t.id.startsWith(idPrefix));
        if (!task) { await ctx.reply(`Task not found: ${idPrefix}`); return; }

        if (action === 'delete') {
          deleteScheduledTask(task.id);
          await ctx.reply(`Deleted task ${task.id.slice(0, 8)}`);
        } else if (action === 'pause') {
          setScheduledTaskStatus(task.id, 'paused');
          await ctx.reply(`Paused task ${task.id.slice(0, 8)}`);
        } else {
          setScheduledTaskStatus(task.id, 'active');
          await ctx.reply(`Resumed task ${task.id.slice(0, 8)}`);
        }
        return;
      }

      await ctx.reply('Usage:\n/schedule -- List tasks\n/schedule add "<cron>" <prompt>\n/schedule pause|resume|delete <id>');
    });
  }

  // ---- Voice message handling ----
  bot.on('message:voice', async (ctx) => {
    if (!ENABLE_VOICE) {
      await ctx.reply('Voice messages are disabled. Enable with ENABLE_VOICE=true in .env');
      return;
    }
    const chatId = ctx.chat!.id.toString();

    try {
      // @ts-ignore -- voice.ts is an optional module, created when ENABLE_VOICE is true
      const { transcribeVoice } = await import('./voice.js');
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());

      const text = await transcribeVoice(buffer);
      if (!text) { await ctx.reply('Could not transcribe voice message.'); return; }

      await ctx.reply(`[Voice transcribed]: ${text}`);
      // Process as regular message
      await handleMessage(ctx, chatId, `[Voice transcribed]: ${text}`);
    } catch (e) {
      logger.error({ err: e }, 'Voice processing error');
      await ctx.reply('Error processing voice message.');
    }
  });

  // ---- Text message handler ----
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat!.id.toString();
    const text = ctx.message!.text;

    // Skip if it's a command that was already handled
    if (text.startsWith('/')) return;

    await handleMessage(ctx, chatId, text);
  });

  return bot;
}

// ========== Core Message Handler ==========

async function handleMessage(ctx: Context, chatId: string, rawText: string): Promise<void> {
  // Check kill switch
  if (isKillSwitchActive()) {
    await ctx.reply('Kill switch is active. Use /killswitch to deactivate.');
    return;
  }

  // Check if agent is already running
  if (isAgentRunning(chatId)) {
    await ctx.reply('Still working on your previous message. Use /stop to cancel.');
    return;
  }

  // Intent detection
  const intent = detectIntent(rawText);
  if (intent?.consumedText) {
    await handleIntent(ctx, chatId, intent);
    return;
  }

  // Get model/effort settings
  const cli = 'claude';
  const modelId = getActiveModel(chatId, cli) ?? undefined;
  const effort = getActiveEffort(chatId, cli) ?? undefined;
  const sessionId = getCliSession(chatId, cli) ?? undefined;

  // Build memory context
  const memoryContext = await buildMemoryContext(chatId, rawText);
  const fullMessage = memoryContext
    ? `${memoryContext}\n\n---\n\nNew message from user:\n${rawText}`
    : rawText;

  // Run agent
  const ac = new AbortController();
  trackRunningAgent(chatId, ac);

  // Send typing indicator
  const sendTyping = () => {
    try { ctx.api.sendChatAction(ctx.chat!.id, 'typing'); } catch {}
  };
  sendTyping();

  try {
    const result = await runAgent({
      message: fullMessage,
      sessionId,
      modelId,
      effort,
      abortController: ac,
      onTyping: sendTyping,
    });

    // Save session
    if (result.newSessionId) {
      setCliSession(chatId, cli, result.newSessionId);
    }

    // Save conversation
    const responseText = result.text || '(No response)';
    saveConversationTurn(chatId, rawText, responseText.slice(0, 2000));

    // Send response
    await safeSendMessage(ctx, responseText);
  } catch (error: any) {
    if (ac.signal.aborted) {
      // User cancelled -- don't send error
      return;
    }
    logger.error({ err: error }, 'Error processing message');
    await ctx.reply('Error processing your message. Try again.');
  } finally {
    untrackRunningAgent(chatId);
  }
}

// ========== Intent Handler ==========

async function handleIntent(ctx: Context, chatId: string, intent: { action: string; params: Record<string, string> }): Promise<void> {
  switch (intent.action) {
    case 'model': {
      const alias = intent.params.alias;
      if (!alias) break;
      const resolved = resolveModelAlias(alias);
      if (resolved) {
        setActiveModel(chatId, 'claude', resolved.modelId);
        clearCliSession(chatId, 'claude');
        await ctx.reply(`Switched to ${getModelDisplayName(resolved.modelId)}`);
      }
      break;
    }
    case 'status': {
      const model = getActiveModel(chatId, 'claude') ?? 'claude-sonnet-4-6';
      const memCount = getMemoryCount(chatId);
      await ctx.reply(`Model: ${getModelDisplayName(model)}\nMemories: ${memCount}\nKill switch: ${isKillSwitchActive() ? 'ACTIVE' : 'off'}`);
      break;
    }
    case 'clear': {
      clearSession(chatId);
      clearCliSession(chatId, 'claude');
      await ctx.reply('Session cleared.');
      break;
    }
    case 'memory': {
      const count = getMemoryCount(chatId);
      await ctx.reply(`Total memories: ${count}`);
      break;
    }
    case 'convolife': {
      // Pass through to agent -- it can check context usage
      await handleMessage(ctx, chatId, 'Check how much of the context window has been used');
      break;
    }
  }
}
