import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- paths ----------
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const STORE_DIR = path.join(PROJECT_ROOT, 'store');
export const WORKSPACE_DIR = path.join(PROJECT_ROOT, 'workspace');
export const AGENTS_DIR = path.join(PROJECT_ROOT, 'agents');

// ---------- env ----------
const env = readEnvFile();

// Bot identity
export const BOT_NAME = env['BOT_NAME'] ?? 'Autonoma';
export const OWNER_NAME = env['OWNER_NAME'] ?? '';
export const TIMEZONE = env['TIMEZONE'] ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

// Telegram
export const TELEGRAM_BOT_TOKEN = env['TELEGRAM_BOT_TOKEN'] ?? '';
export const ALLOWED_CHAT_ID = env['ALLOWED_CHAT_ID'] ?? '';

// Gateway / Dashboard
export const GATEWAY_TOKEN = env['GATEWAY_TOKEN'] ?? 'autonoma-gw';
export const GATEWAY_PORT = parseInt(env['GATEWAY_PORT'] ?? '39217');

// Voice
export const GROQ_API_KEY = env['GROQ_API_KEY'] ?? '';
export const ELEVENLABS_API_KEY = env['ELEVENLABS_API_KEY'] ?? '';
export const ELEVENLABS_VOICE_ID = env['ELEVENLABS_VOICE_ID'] ?? '';

// Google Calendar
export const GOOGLE_CLIENT_ID = env['GOOGLE_CLIENT_ID'] ?? '';
export const GOOGLE_CLIENT_SECRET = env['GOOGLE_CLIENT_SECRET'] ?? '';
export const GOOGLE_REFRESH_TOKEN = env['GOOGLE_REFRESH_TOKEN'] ?? '';

// Memory
export const MEMORY_MODE = (env['MEMORY_MODE'] ?? 'full') as 'full' | 'simple' | 'none';

// Feature flags
export const ENABLE_SCHEDULER = env['ENABLE_SCHEDULER'] !== 'false';
export const ENABLE_VOICE = env['ENABLE_VOICE'] === 'true';
export const ENABLE_TTS = env['ENABLE_TTS'] === 'true';
export const ENABLE_CALENDAR = env['ENABLE_CALENDAR'] === 'true';
export const ENABLE_DASHBOARD = env['ENABLE_DASHBOARD'] !== 'false';
export const ENABLE_BRIEFING = env['ENABLE_BRIEFING'] === 'true';
export const ENABLE_CHECKIN = env['ENABLE_CHECKIN'] === 'true';

// Agent limits
export const MAX_CONCURRENT_AGENTS = parseInt(env['MAX_CONCURRENT_AGENTS'] ?? '4');

// Telegram limits
export const MAX_MESSAGE_LENGTH = 4096;
export const TYPING_REFRESH_MS = 4000;
