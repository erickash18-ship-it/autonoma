# Custom Agents

Place your agent SOP (Standard Operating Procedure) files here as `.md` files.

## How It Works

When you ask your bot to run as a specific agent, it loads the corresponding SOP file
and uses it as the system prompt. This gives your bot specialized knowledge and behavior
for specific tasks.

## Format

Each SOP file should include:

1. **Identity**: Who this agent is and what it does
2. **Methodology**: Step-by-step process it follows
3. **Input Format**: What context it expects
4. **Output Format**: What it produces
5. **Quality Gates**: How it validates its work

## Example

See `../templates/agents/example-agent.md` for a template.

## Organization

You can organize agents into subdirectories by team:

```
agents/
  research/
    market-analyst.md
    competitor-intel.md
  creative/
    ad-copywriter.md
    video-scripter.md
  ops/
    daily-reporter.md
```

The bot will find agents regardless of subdirectory depth.
