#!/bin/bash
# Autonoma - One-line installer
# Usage: curl -fsSL https://raw.githubusercontent.com/erickash18-ship-it/autonoma/main/install.sh | bash

set -e

echo ""
echo "  Installing Autonoma..."
echo ""

# Check prerequisites
if ! command -v node &> /dev/null; then
  echo "  Error: Node.js is required. Install it from https://nodejs.org (v20+)"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "  Error: Node.js 20+ required. You have $(node -v)"
  exit 1
fi

if ! command -v claude &> /dev/null; then
  echo "  Error: Claude Code CLI is required."
  echo "  Install it: npm install -g @anthropic-ai/claude-code"
  echo "  Then run: claude login"
  exit 1
fi

# Clone and install
git clone https://github.com/erickash18-ship-it/autonoma.git ~/autonoma
cd ~/autonoma
npm install

# Run setup wizard
echo ""
npx tsx scripts/setup.ts
