import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

export function readEnvFile(keys?: string[]): Record<string, string> {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return {};

  const result: Record<string, string> = {};
  try {
    for (const raw of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      result[key] = val;
    }
  } catch { /* unreadable */ }

  if (keys) {
    const filtered: Record<string, string> = {};
    for (const k of keys) if (k in result) filtered[k] = result[k];
    return filtered;
  }
  return result;
}
