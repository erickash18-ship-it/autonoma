# Migrating from OpenClaw to Autonoma

## Why Migrate

OpenClaw's OAuth authentication was banned by Anthropic. Autonoma uses the Claude Agent SDK,
which authenticates through your local Claude Code CLI subscription -- no OAuth needed.

**What you gain:**
- Full tool use (file access, bash, web search -- not just chat)
- Persistent memory with FTS5 search
- Scheduled tasks with cron expressions
- Session management (switch between conversations)
- Voice message support (Groq STT + ElevenLabs TTS)
- Google Calendar integration
- Web dashboard for memory/scheduler management
- Self-hosted on your machine

## Prerequisites

- macOS or Linux
- Node.js 20+
- Claude Code CLI installed and authenticated (`claude --version`)
- A Telegram account

## Quick Start

```bash
git clone https://github.com/erickash18-ship-it/autonoma
cd autonoma
npm install
npm run setup    # Interactive wizard
npm run dev      # Start bot
```

## What Changes from OpenClaw

| Feature | OpenClaw | Autonoma |
|---------|----------|----------|
| Auth | OAuth (banned) | Claude Code CLI subscription |
| Chat | Text only | Text + Voice + Photos |
| Memory | None | Dual-sector FTS5 + decay |
| Tools | None | Full Claude Agent SDK |
| Scheduling | None | Cron-based task scheduler |
| Calendar | None | Google Calendar (optional) |
| Dashboard | None | Web UI (optional) |
| Hosting | Cloud | Self-hosted (your machine) |

## Migrating Your Conversations

OpenClaw doesn't export conversation history, so you start fresh.
However, Autonoma's memory system will quickly learn your preferences
through natural conversation.

To seed important context, tell your bot:
```
Remember: I prefer X over Y
Remember: My business does Z
Remember: I'm working on A
```

These get stored as semantic memories and persist forever.

## Running as a Service

### macOS (launchd)

Create `~/Library/LaunchAgents/com.autonoma.app.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.autonoma.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/autonoma</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/autonoma.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/autonoma.log</string>
</dict>
</plist>
```

Load it: `launchctl load ~/Library/LaunchAgents/com.autonoma.app.plist`

### Linux (systemd)

Create `/etc/systemd/system/autonoma.service`:
```ini
[Unit]
Description=Autonoma AI Assistant
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/autonoma
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable: `sudo systemctl enable --now autonoma`
