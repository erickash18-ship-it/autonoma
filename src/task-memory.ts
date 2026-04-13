import fs from 'node:fs';
import path from 'node:path';
import { STORE_DIR } from './config.js';
import { logger } from './logger.js';

const TASK_MEMORY_DIR = path.join(STORE_DIR, 'task-memory');

if (!fs.existsSync(TASK_MEMORY_DIR)) {
  fs.mkdirSync(TASK_MEMORY_DIR, { recursive: true });
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function getMemoryPath(taskId: string, taskPrompt: string): string {
  const slug = slugify(taskPrompt);
  return path.join(TASK_MEMORY_DIR, `${slug}-${taskId.slice(0, 8)}.md`);
}

export function loadTaskMemory(taskId: string, taskPrompt: string): string {
  const memPath = getMemoryPath(taskId, taskPrompt);
  try {
    if (fs.existsSync(memPath)) return fs.readFileSync(memPath, 'utf-8');
  } catch (e) { logger.error({ err: e }, `Failed to load task memory: ${memPath}`); }
  return '';
}

export function saveTaskMemory(taskId: string, taskPrompt: string, content: string): void {
  const memPath = getMemoryPath(taskId, taskPrompt);
  try {
    fs.writeFileSync(memPath, content, 'utf-8');
    logger.debug(`Task memory saved: ${memPath}`);
  } catch (e) { logger.error({ err: e }, `Failed to save task memory: ${memPath}`); }
}

export function buildTaskMemoryPrompt(taskId: string, taskPrompt: string): string {
  const memory = loadTaskMemory(taskId, taskPrompt);
  const memPath = getMemoryPath(taskId, taskPrompt);
  const parts: string[] = [];

  parts.push(`<task_memory_system>`);
  parts.push(`You have PERSISTENT MEMORY for this scheduled task. It survives across runs.`);
  parts.push(`Read the memory below to understand what happened in previous runs.`);
  parts.push(`At the END of your work, you MUST update the memory file at: ${memPath}`);
  parts.push(`Write a concise status update that includes:`);
  parts.push(`- What you did this run`);
  parts.push(`- What worked, what didn't`);
  parts.push(`- What you learned about the user's preferences`);
  parts.push(`- What to do differently next time`);
  parts.push(`- Any ongoing context (streaks, progress, pending items)`);
  parts.push(`Keep it under 500 words. Replace the old content entirely.`);
  parts.push(`</task_memory_system>`);

  if (memory) {
    parts.push('');
    parts.push(`<task_memory>`);
    parts.push(memory);
    parts.push(`</task_memory>`);
  } else {
    parts.push('');
    parts.push(`<task_memory>`);
    parts.push(`This is the FIRST RUN of this task. No previous memory exists.`);
    parts.push(`After completing your work, create the initial memory file at: ${memPath}`);
    parts.push(`</task_memory>`);
  }

  return parts.join('\n');
}

export function listTaskMemories(): Array<{ file: string; slug: string; lastModified: number; sizeBytes: number }> {
  try {
    return fs.readdirSync(TASK_MEMORY_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const fullPath = path.join(TASK_MEMORY_DIR, f);
        const stat = fs.statSync(fullPath);
        return { file: f, slug: f.replace('.md', ''), lastModified: stat.mtimeMs, sizeBytes: stat.size };
      })
      .sort((a, b) => b.lastModified - a.lastModified);
  } catch { return []; }
}
