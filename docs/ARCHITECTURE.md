# Autonoma Architecture

## Overview

Autonoma is a self-hosted Telegram bot that acts as your personal AI assistant.
It uses the Claude Agent SDK for full tool access -- meaning your bot can read files,
write code, run commands, and search the web on your behalf.

## System Diagram

```
You (Telegram) --> Bot (Grammy) --> Agent (Claude SDK) --> Tools
                       |                    |
                       v                    v
                   Scheduler            Memory (SQLite)
                       |
                       v
                   Cron Tasks
```

## Core Components

### Entry Point (index.ts)
- Acquires PID lock (prevents duplicate instances)
- Initializes SQLite database
- Starts Telegram polling loop
- Starts scheduler (if enabled)
- Starts dashboard (if enabled)

### Bot (bot.ts)
- Grammy library with manual polling (not webhooks)
- Intent detection for natural language commands
- Slash command routing
- Voice message transcription
- Message chunking for long responses

### Agent (agent.ts)
- Claude Agent SDK `query()` integration
- Persona injection (SOUL.md + HEARTBEAT.md)
- Session management (resume/new/stale recovery)
- Concurrency limiting
- Activity-based watchdog (5min inactivity = abort)
- Global kill switch

### Database (db.ts)
- SQLite with WAL mode
- FTS5 full-text search for memories
- Tables: sessions, memories, turns, scheduled_tasks, daily_logs, kv_state

### Memory (memory.ts)
- Dual-sector: semantic (long-term facts) + episodic (recent events)
- FTS5 search for relevant memory retrieval
- Salience-based decay (unused memories fade over time)
- Auto-detection of semantic signals ("I prefer", "remember", etc.)

### Scheduler (scheduler.ts)
- Cron-based task execution
- 60-second poll interval
- Persistent task memory (learns from previous runs)
- Duplicate prevention guards

## Data Flow

1. **Message received** via Telegram polling
2. **Auth check** -- is this chat ID allowed?
3. **Intent detection** -- is this a command?
4. **Memory context** built from turns + FTS search
5. **Agent invoked** with persona + memory + user message
6. **Response** chunked and sent back to Telegram
7. **Conversation saved** to turns table
8. **Semantic signals** extracted and stored as memories

## Extension Points

- **Custom Intents**: Add patterns to `src/intent.ts`
- **Agent SOPs**: Create `.md` files in `agents/`
- **Scheduled Tasks**: Add via `/schedule` command
- **Integrations**: The bot can build and wire up anything you ask for

## Configuration

All config flows through `src/config.ts` which reads `.env`.
Feature flags control which modules are active.
