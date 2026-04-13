import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal ? ` (${defaultVal})` : '';
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function askYesNo(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  return new Promise(resolve => {
    rl.question(`${question} ${hint}: `, answer => {
      const a = answer.trim().toLowerCase();
      if (!a) resolve(defaultYes);
      else resolve(a === 'y' || a === 'yes');
    });
  });
}

async function main() {
  console.log(`
 █████╗ ██╗   ██╗████████╗ ██████╗ ███╗   ██╗ ██████╗ ███╗   ███╗ █████╗
██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗████╗  ██║██╔═══██╗████╗ ████║██╔══██╗
███████║██║   ██║   ██║   ██║   ██║██╔██╗ ██║██║   ██║██╔████╔██║███████║
██╔══██║██║   ██║   ██║   ██║   ██║██║╚██╗██║██║   ██║██║╚██╔╝██║██╔══██║
██║  ██║╚██████╔╝   ██║   ╚██████╔╝██║ ╚████║╚██████╔╝██║ ╚═╝ ██║██║  ██║
╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝

  Setup Wizard
  ============
  This will set up your personal AI assistant in about 5 minutes.
`);

  // Check if .env already exists
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const overwrite = await askYesNo('.env already exists. Overwrite?', false);
    if (!overwrite) {
      console.log('Setup cancelled. Your existing .env is unchanged.');
      rl.close();
      return;
    }
  }

  // Step 1: Owner info
  console.log('\n--- Step 1: About You ---\n');
  const ownerName = await ask('What is your name?');
  const botName = await ask('What do you want to call your bot?', 'Autonoma');

  // Step 2: Telegram
  console.log('\n--- Step 2: Telegram Bot ---\n');
  console.log('You need a Telegram bot token. Here\'s how to get one:');
  console.log('  1. Open Telegram and search for @BotFather');
  console.log('  2. Send /newbot and follow the prompts');
  console.log('  3. Copy the token it gives you\n');
  const botToken = await ask('Paste your Telegram bot token');
  if (!botToken) {
    console.log('Bot token is required. Run setup again when you have it.');
    rl.close();
    return;
  }

  console.log('\nTo restrict the bot to only your account (recommended):');
  console.log('  1. Open Telegram and search for @userinfobot');
  console.log('  2. Send any message -- it will reply with your chat ID\n');
  const chatId = await ask('Your Telegram chat ID (leave blank to allow all)');

  // Step 3: Timezone
  console.log('\n--- Step 3: Timezone ---\n');
  const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezone = await ask('Your timezone?', systemTz);

  // Step 4: Mission
  console.log('\n--- Step 4: Mission ---\n');
  console.log('Describe what you want your bot to help you with.');
  console.log('This becomes part of its personality. Be specific.\n');
  const mission = await ask('Your mission/goals (2-3 sentences)');

  // Step 5: Features
  console.log('\n--- Step 5: Features ---\n');
  const enableCalendar = await askYesNo('Enable Google Calendar integration?', false);
  const enableVoice = await askYesNo('Enable voice messages (Groq STT)?', false);
  const enableTts = enableVoice ? await askYesNo('Enable text-to-speech responses (ElevenLabs)?', false) : false;
  const enableDashboard = await askYesNo('Enable web dashboard?', true);
  const enableBriefing = await askYesNo('Enable daily morning briefing?', false);
  const enableCheckin = await askYesNo('Enable nightly check-in?', false);

  // Step 6: Integration credentials
  let googleClientId = '', googleClientSecret = '', googleRefreshToken = '';
  if (enableCalendar) {
    console.log('\n--- Google Calendar Setup ---\n');
    console.log('Create OAuth2 credentials at:');
    console.log('  https://console.cloud.google.com/apis/credentials\n');
    googleClientId = await ask('Google Client ID');
    googleClientSecret = await ask('Google Client Secret');
    googleRefreshToken = await ask('Google Refresh Token (if you have one)');
  }

  let groqKey = '', elevenLabsKey = '', elevenLabsVoiceId = '';
  if (enableVoice) {
    console.log('\n--- Voice Setup ---\n');
    groqKey = await ask('Groq API key (groq.com/keys)');
    if (enableTts) {
      elevenLabsKey = await ask('ElevenLabs API key');
      elevenLabsVoiceId = await ask('ElevenLabs Voice ID');
    }
  }

  // Step 7: Generate .env
  console.log('\n--- Generating Configuration ---\n');

  const gatewayToken = crypto.randomUUID().slice(0, 16);

  const envContent = `# Autonoma Configuration
# Generated by setup wizard on ${new Date().toISOString().slice(0, 10)}

# --- Required ---
TELEGRAM_BOT_TOKEN=${botToken}
ALLOWED_CHAT_ID=${chatId}

# --- Bot Identity ---
BOT_NAME=${botName}
OWNER_NAME=${ownerName}

# --- Timezone ---
TIMEZONE=${timezone}

# --- Features ---
ENABLE_SCHEDULER=true
ENABLE_VOICE=${enableVoice}
ENABLE_TTS=${enableTts}
ENABLE_CALENDAR=${enableCalendar}
ENABLE_DASHBOARD=${enableDashboard}
ENABLE_BRIEFING=${enableBriefing}
ENABLE_CHECKIN=${enableCheckin}

# --- Memory ---
MEMORY_MODE=full

# --- Agent Limits ---
MAX_CONCURRENT_AGENTS=4

# --- Dashboard ---
GATEWAY_TOKEN=${gatewayToken}
GATEWAY_PORT=39217

# --- Google Calendar ---
GOOGLE_CLIENT_ID=${googleClientId}
GOOGLE_CLIENT_SECRET=${googleClientSecret}
GOOGLE_REFRESH_TOKEN=${googleRefreshToken}

# --- Voice ---
GROQ_API_KEY=${groqKey}
ELEVENLABS_API_KEY=${elevenLabsKey}
ELEVENLABS_VOICE_ID=${elevenLabsVoiceId}

# --- Logging ---
LOG_LEVEL=info
`;

  fs.writeFileSync(envPath, envContent, 'utf-8');
  console.log('  .env written');

  // Step 8: Generate SOUL.md
  const templatePath = path.join(PROJECT_ROOT, 'templates', 'SOUL.template.md');
  const soulPath = path.join(PROJECT_ROOT, 'SOUL.md');

  if (fs.existsSync(templatePath)) {
    let soul = fs.readFileSync(templatePath, 'utf-8');
    soul = soul.replace(/\{\{BOT_NAME\}\}/g, botName);
    soul = soul.replace(/\{\{OWNER_NAME\}\}/g, ownerName);
    soul = soul.replace(/\{\{MISSION\}\}/g, mission || 'Help me be more productive and organized.');
    fs.writeFileSync(soulPath, soul, 'utf-8');
    console.log('  SOUL.md written');
  } else {
    // Fallback if template doesn't exist
    const soul = `# ${botName}\n\nYou are ${botName}, a personal AI assistant for ${ownerName}.\n\n## Mission\n\n${mission || 'Help me be more productive and organized.'}\n\n## Personality\n\n- Direct and efficient\n- No AI cliches\n- Just do it. Don't explain what you're about to do.\n`;
    fs.writeFileSync(soulPath, soul, 'utf-8');
    console.log('  SOUL.md written (from fallback)');
  }

  // Step 9: Create store directory
  const storeDir = path.join(PROJECT_ROOT, 'store');
  if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true });
  console.log('  store/ directory created');

  // Done
  console.log(`
  Setup complete!

  To start your bot:
    npm run build && npm run start    (production)
    npm run dev                       (development)

  Your bot will be available on Telegram as the bot you created with @BotFather.
  Send it a message to get started!
`);

  rl.close();
}

main().catch(err => {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
});
