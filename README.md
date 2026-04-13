# Autonoma

**Your personal AI assistant, running on your machine, powered by Claude.**

Autonoma is a self-hosted Telegram bot framework built on the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk).
It gives you a persistent AI assistant with memory, scheduling, and full tool access --
all running locally on your computer.

## Why Autonoma?

Your bot can do anything Claude Code can do -- read files, write code, run commands,
search the web, build scripts, manage your calendar. The framework handles the plumbing:
Telegram interface, persistent memory, session management, task scheduling.

**You just talk to it. It builds whatever you need.**

## Features

- **Claude Agent SDK**: Full tool use -- file access, bash, web search, code execution
- **Persistent Memory**: Dual-sector (semantic + episodic) with FTS5 search and salience decay
- **Session Management**: Switch between conversations, resume where you left off
- **Scheduled Tasks**: Cron-based recurring tasks with persistent memory across runs
- **Voice Messages**: Send/receive voice via Groq STT + ElevenLabs TTS
- **Google Calendar**: Schedule awareness and event management
- **Web Dashboard**: Browse memories, manage tasks, system health
- **Kill Switch**: Emergency stop all agents instantly

## Quick Start

```bash
git clone https://github.com/erickash18-ship-it/autonoma
cd autonoma
npm install
npm run setup    # Interactive wizard -- sets up everything
npm run dev      # Start in development mode
```

The setup wizard will guide you through:
1. Creating a Telegram bot via @BotFather
2. Configuring your bot's identity and mission
3. Enabling optional features (calendar, voice, dashboard)

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/model` | Switch Claude model (opus/sonnet/haiku) |
| `/effort` | Set thinking effort (low/medium/high/max) |
| `/memory` | View memory stats |
| `/schedule` | Manage scheduled tasks |
| `/clear` | Start fresh session |
| `/stop` | Abort running agent |
| `/status` | System health |

See [docs/COMMANDS.md](docs/COMMANDS.md) for the full reference.

## Architecture

```
You (Telegram) --> Bot (Grammy) --> Agent (Claude SDK) --> Tools
                       |                    |
                       v                    v
                   Scheduler            Memory (SQLite)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Coming from OpenClaw?

See [docs/MIGRATION.md](docs/MIGRATION.md) for a step-by-step migration guide.

## Requirements

- macOS or Linux
- Node.js 20+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Running as a Service

See [docs/MIGRATION.md](docs/MIGRATION.md#running-as-a-service) for launchd (macOS)
and systemd (Linux) instructions.

## License

MIT
