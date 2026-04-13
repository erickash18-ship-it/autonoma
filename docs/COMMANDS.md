# Autonoma Commands

## Session Management

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/clear` | Clear current session and start fresh |
| `/newchat` | Start a new chat session |
| `/sessions` | Browse previous sessions |
| `/stop` | Abort the currently running agent |

## Model & Settings

| Command | Description |
|---------|-------------|
| `/model` | Show or switch Claude model |
| `/models` | List all available models |
| `/effort` | Set thinking effort (low/medium/high/max) |
| `/verbosity` | Set progress verbosity (silent/milestone/verbose/auto) |

## Memory

| Command | Description |
|---------|-------------|
| `/memory` | Show memory stats and recent memories |
| `/remember <text>` | Save something to long-term memory |

## Scheduling

| Command | Description |
|---------|-------------|
| `/schedule` | List all scheduled tasks |
| `/schedule add "<cron>" <prompt>` | Create a new scheduled task |
| `/schedule pause <id>` | Pause a task |
| `/schedule resume <id>` | Resume a paused task |
| `/schedule delete <id>` | Delete a task |

### Cron Examples
- `0 9 * * *` -- Daily at 9am
- `0 9 * * 1` -- Every Monday at 9am
- `0 */4 * * *` -- Every 4 hours
- `30 6 * * 1-5` -- Weekdays at 6:30am

## System

| Command | Description |
|---------|-------------|
| `/status` | System health and integration status |
| `/uptime` | How long the bot has been running |
| `/killswitch` | Emergency stop all agents |
| `/chatid` | Show your Telegram chat ID |
| `/help` | Show available commands |

## Voice

| Command | Description |
|---------|-------------|
| `/voice` | Toggle voice responses on/off |
| Send voice message | Automatically transcribed and processed |

## Dashboard

| Command | Description |
|---------|-------------|
| `/dashboard` | Show dashboard URL |

## Inline Prefixes

| Prefix | Effect |
|--------|--------|
| `.q` or `(quiet)` | Silent mode (no progress updates) |
| `.m` or `(milestone)` | Milestone mode (phase updates only) |
| `.v` or `(verbose)` | Verbose mode (all tool calls shown) |
