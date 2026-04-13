import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { STORE_DIR, MEMORY_MODE, ENABLE_SCHEDULER } from './config.js';
import { logger } from './logger.js';

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

export function initDatabase(): void {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  db = new Database(path.join(STORE_DIR, 'autonoma.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // sessions
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    chat_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  // memories + FTS5 (only if full memory mode)
  if (MEMORY_MODE === 'full') {
    db.exec(`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      topic_key TEXT,
      content TEXT NOT NULL,
      sector TEXT NOT NULL CHECK(sector IN ('semantic','episodic')),
      salience REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL
    )`);
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content, content_rowid='id')`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
    END`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END`);
  }

  // turns
  if (MEMORY_MODE === 'full' || MEMORY_MODE === 'simple') {
    db.exec(`CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
  }

  // scheduler
  if (ENABLE_SCHEDULER) {
    db.exec(`CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule TEXT NOT NULL,
      next_run INTEGER NOT NULL,
      last_run INTEGER,
      last_result TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
      created_at INTEGER NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_due ON scheduled_tasks(status, next_run)`);
  }

  // daily logs
  db.exec(`CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    raw_response TEXT NOT NULL,
    agent_summary TEXT,
    agent_insights TEXT,
    energy_level INTEGER,
    focus_rating INTEGER,
    created_at INTEGER NOT NULL,
    UNIQUE(date, chat_id)
  )`);

  // cli sessions
  db.exec(`CREATE TABLE IF NOT EXISTS cli_sessions (
    chat_id TEXT NOT NULL,
    cli_provider TEXT NOT NULL,
    session_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (chat_id, cli_provider)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS cli_session_history (
    chat_id TEXT NOT NULL,
    cli_provider TEXT NOT NULL,
    session_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    display_name TEXT DEFAULT NULL,
    PRIMARY KEY (chat_id, cli_provider, session_id)
  )`);

  // model/effort/verbosity
  db.exec(`CREATE TABLE IF NOT EXISTS model_context (
    chat_id TEXT NOT NULL,
    cli_provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    PRIMARY KEY (chat_id, cli_provider)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS thinking_context (
    chat_id TEXT NOT NULL,
    cli_provider TEXT NOT NULL,
    effort TEXT NOT NULL,
    PRIMARY KEY (chat_id, cli_provider)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS verbosity_context (
    chat_id TEXT NOT NULL PRIMARY KEY,
    verbosity TEXT NOT NULL DEFAULT 'auto'
  )`);

  // kv state
  db.exec(`CREATE TABLE IF NOT EXISTS kv_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  logger.info('Database initialized');
}

// ── KV State ──────────────────────────────────────────────────────────

export function getKvState(key: string): string | null {
  const row = db.prepare('SELECT value FROM kv_state WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setKvState(key: string, value: string): void {
  db.prepare('INSERT INTO kv_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

// ── Sessions ──────────────────────────────────────────────────────────

export function getSession(chatId: string): string | null {
  const row = db.prepare('SELECT session_id FROM sessions WHERE chat_id = ?').get(chatId) as { session_id: string } | undefined;
  return row?.session_id ?? null;
}

export function setSession(chatId: string, sessionId: string): void {
  db.prepare(
    'INSERT INTO sessions (chat_id, session_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at'
  ).run(chatId, sessionId, Date.now());
}

export function clearSession(chatId: string): void {
  db.prepare('DELETE FROM sessions WHERE chat_id = ?').run(chatId);
}

export function clearAllSessions(): number {
  const r1 = db.prepare('DELETE FROM sessions').run();
  const r2 = db.prepare('DELETE FROM cli_sessions').run();
  return r1.changes + r2.changes;
}

// ── Model Context ─────────────────────────────────────────────────────

export function getActiveModel(chatId: string, cli: string): string | null {
  const row = db.prepare('SELECT model_id FROM model_context WHERE chat_id = ? AND cli_provider = ?').get(chatId, cli) as { model_id: string } | undefined;
  return row?.model_id ?? null;
}

export function setActiveModel(chatId: string, cli: string, modelId: string): void {
  db.prepare(
    'INSERT INTO model_context (chat_id, cli_provider, model_id) VALUES (?, ?, ?) ON CONFLICT(chat_id, cli_provider) DO UPDATE SET model_id = excluded.model_id'
  ).run(chatId, cli, modelId);
}

export function clearActiveModel(chatId: string, cli: string): void {
  db.prepare('DELETE FROM model_context WHERE chat_id = ? AND cli_provider = ?').run(chatId, cli);
}

// ── Thinking Effort Context ───────────────────────────────────────────

export function getActiveEffort(chatId: string, cli: string): string | null {
  const row = db.prepare('SELECT effort FROM thinking_context WHERE chat_id = ? AND cli_provider = ?').get(chatId, cli) as { effort: string } | undefined;
  return row?.effort ?? null;
}

export function setActiveEffort(chatId: string, cli: string, effort: string): void {
  db.prepare(
    'INSERT INTO thinking_context (chat_id, cli_provider, effort) VALUES (?, ?, ?) ON CONFLICT(chat_id, cli_provider) DO UPDATE SET effort = excluded.effort'
  ).run(chatId, cli, effort);
}

export function clearActiveEffort(chatId: string, cli: string): void {
  db.prepare('DELETE FROM thinking_context WHERE chat_id = ? AND cli_provider = ?').run(chatId, cli);
}

// ── Verbosity Context ─────────────────────────────────────────────────

export function getVerbosity(chatId: string): string {
  const row = db.prepare('SELECT verbosity FROM verbosity_context WHERE chat_id = ?').get(chatId) as { verbosity: string } | undefined;
  return row?.verbosity ?? 'auto';
}

export function setVerbosity(chatId: string, verbosity: string): void {
  db.prepare(
    'INSERT INTO verbosity_context (chat_id, verbosity) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET verbosity = excluded.verbosity'
  ).run(chatId, verbosity);
}

// ── CLI Sessions ──────────────────────────────────────────────────────

export function getCliSession(chatId: string, cliProvider: string): string | null {
  const row = db.prepare('SELECT session_id FROM cli_sessions WHERE chat_id = ? AND cli_provider = ?').get(chatId, cliProvider) as { session_id: string } | undefined;
  return row?.session_id ?? null;
}

export function setCliSession(chatId: string, cliProvider: string, sessionId: string): void {
  db.prepare(
    'INSERT INTO cli_sessions (chat_id, cli_provider, session_id, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(chat_id, cli_provider) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at'
  ).run(chatId, cliProvider, sessionId, Date.now());
  // Also track in history
  db.prepare(
    'INSERT INTO cli_session_history (chat_id, cli_provider, session_id, created_at, last_used_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(chat_id, cli_provider, session_id) DO UPDATE SET last_used_at = excluded.last_used_at'
  ).run(chatId, cliProvider, sessionId, Date.now(), Date.now());
}

export function clearCliSession(chatId: string, cliProvider: string): void {
  db.prepare('DELETE FROM cli_sessions WHERE chat_id = ? AND cli_provider = ?').run(chatId, cliProvider);
}

export function clearAllCliSessions(): number {
  return db.prepare('DELETE FROM cli_sessions').run().changes;
}

// ── CLI Session History ───────────────────────────────────────────────

export function listSessionHistory(chatId: string, cliProvider: string, limit = 20): any[] {
  return db.prepare(
    'SELECT * FROM cli_session_history WHERE chat_id = ? AND cli_provider = ? ORDER BY last_used_at DESC LIMIT ?'
  ).all(chatId, cliProvider, limit) as any[];
}

export function setSessionName(chatId: string, cliProvider: string, sessionId: string, name: string): void {
  db.prepare(
    'UPDATE cli_session_history SET display_name = ? WHERE chat_id = ? AND cli_provider = ? AND session_id = ?'
  ).run(name, chatId, cliProvider, sessionId);
}

export function deleteSessionHistory(chatId: string, cliProvider: string, sessionId: string): void {
  db.prepare('DELETE FROM cli_session_history WHERE chat_id = ? AND cli_provider = ? AND session_id = ?').run(chatId, cliProvider, sessionId);
}

export function pruneOldSessions(daysOld: number): number {
  const cutoff = Date.now() - daysOld * 86_400_000;
  return db.prepare('DELETE FROM cli_session_history WHERE last_used_at < ?').run(cutoff).changes;
}

// ── Memories ──────────────────────────────────────────────────────────

export function searchMemories(chatId: string, query: string, limit = 5): any[] {
  if (MEMORY_MODE !== 'full') return [];
  try {
    const sanitized = query.replace(/[^\w\s]/g, ' ').trim();
    if (!sanitized) return [];
    return db.prepare(
      `SELECT m.id, m.content, m.sector, m.salience
       FROM memories m
       JOIN memories_fts f ON f.rowid = m.id
       WHERE memories_fts MATCH ? AND m.chat_id = ?
       ORDER BY rank
       LIMIT ?`
    ).all(sanitized, chatId, limit) as any[];
  } catch {
    return [];
  }
}

export function getRecentMemories(chatId: string, limit = 5): any[] {
  if (MEMORY_MODE !== 'full') return [];
  return db.prepare(
    'SELECT id, content, sector, salience FROM memories WHERE chat_id = ? ORDER BY accessed_at DESC LIMIT ?'
  ).all(chatId, limit) as any[];
}

export function getRecentMemoriesDetailed(chatId: string, limit = 20): any[] {
  if (MEMORY_MODE !== 'full') return [];
  return db.prepare(
    'SELECT id, content, sector, salience, topic_key, created_at, accessed_at FROM memories WHERE chat_id = ? ORDER BY accessed_at DESC LIMIT ?'
  ).all(chatId, limit) as any[];
}

export function touchMemory(id: number): void {
  db.prepare('UPDATE memories SET accessed_at = ?, salience = MIN(salience + 0.1, 2.0) WHERE id = ?').run(Date.now(), id);
}

export function insertMemory(chatId: string, content: string, sector: string, topicKey?: string, salience = 1.0): void {
  if (MEMORY_MODE !== 'full') return;
  const now = Date.now();
  db.prepare(
    'INSERT INTO memories (chat_id, topic_key, content, sector, salience, created_at, accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(chatId, topicKey ?? null, content, sector, salience, now, now);
}

export function decayMemories(): { decayed: number; deleted: number } {
  if (MEMORY_MODE !== 'full') return { decayed: 0, deleted: 0 };
  const decayed = db.prepare(
    'UPDATE memories SET salience = salience * 0.95 WHERE salience > 0.1'
  ).run().changes;
  const deleted = db.prepare(
    'DELETE FROM memories WHERE salience <= 0.1'
  ).run().changes;
  return { decayed, deleted };
}

export function getMemoryCount(chatId: string): number {
  if (MEMORY_MODE !== 'full') return 0;
  const row = db.prepare('SELECT COUNT(*) as cnt FROM memories WHERE chat_id = ?').get(chatId) as { cnt: number };
  return row.cnt;
}

export function deleteMemory(id: number): void {
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

// ── Turns ─────────────────────────────────────────────────────────────

export function getRecentTurns(chatId: string, limit = 50): Array<{ role: string; content: string }> {
  if (MEMORY_MODE === 'none') return [];
  return db.prepare(
    'SELECT role, content FROM turns WHERE chat_id = ? ORDER BY id DESC LIMIT ?'
  ).all(chatId, limit).reverse() as Array<{ role: string; content: string }>;
}

export function getRecentTurnsDetailed(chatId: string, limit = 50): any[] {
  if (MEMORY_MODE === 'none') return [];
  return db.prepare(
    'SELECT id, role, content, created_at FROM turns WHERE chat_id = ? ORDER BY id DESC LIMIT ?'
  ).all(chatId, limit).reverse() as any[];
}

export function insertTurn(chatId: string, role: string, content: string): void {
  if (MEMORY_MODE === 'none') return;
  db.prepare(
    'INSERT INTO turns (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)'
  ).run(chatId, role, content, Date.now());
}

export function pruneOldTurns(chatId: string, keep = 200): void {
  if (MEMORY_MODE === 'none') return;
  db.prepare(
    `DELETE FROM turns WHERE chat_id = ? AND id NOT IN (
      SELECT id FROM turns WHERE chat_id = ? ORDER BY id DESC LIMIT ?
    )`
  ).run(chatId, chatId, keep);
}

// ── Scheduled Tasks ───────────────────────────────────────────────────

export function createScheduledTask(id: string, chatId: string, prompt: string, schedule: string, nextRun: number): void {
  db.prepare(
    'INSERT INTO scheduled_tasks (id, chat_id, prompt, schedule, next_run, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, chatId, prompt, schedule, nextRun, 'active', Date.now());
}

export function getDueTasks(): any[] {
  return db.prepare(
    "SELECT * FROM scheduled_tasks WHERE status = 'active' AND next_run <= ?"
  ).all(Date.now()) as any[];
}

export function updateTaskAfterRun(id: string, nextRun: number, result: string): void {
  db.prepare(
    'UPDATE scheduled_tasks SET last_run = ?, next_run = ?, last_result = ? WHERE id = ?'
  ).run(Date.now(), nextRun, result, id);
}

export function getAllScheduledTasks(): any[] {
  return db.prepare(
    'SELECT * FROM scheduled_tasks ORDER BY created_at DESC'
  ).all() as any[];
}

export function deleteScheduledTask(id: string): boolean {
  return db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id).changes > 0;
}

export function setScheduledTaskStatus(id: string, status: string): void {
  db.prepare('UPDATE scheduled_tasks SET status = ? WHERE id = ?').run(status, id);
}

// ── Daily Logs ────────────────────────────────────────────────────────

export function saveDailyLog(
  date: string, chatId: string, rawResponse: string,
  agentSummary?: string, agentInsights?: string, energy?: number, focus?: number
): void {
  db.prepare(
    `INSERT INTO daily_logs (date, chat_id, raw_response, agent_summary, agent_insights, energy_level, focus_rating, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date, chat_id) DO UPDATE SET
       raw_response = excluded.raw_response,
       agent_summary = excluded.agent_summary,
       agent_insights = excluded.agent_insights,
       energy_level = excluded.energy_level,
       focus_rating = excluded.focus_rating`
  ).run(date, chatId, rawResponse, agentSummary ?? null, agentInsights ?? null, energy ?? null, focus ?? null, Date.now());
}

export function getDailyLog(date: string, chatId: string): any | undefined {
  return db.prepare('SELECT * FROM daily_logs WHERE date = ? AND chat_id = ?').get(date, chatId) as any | undefined;
}

export function getRecentDailyLogs(chatId: string, limit = 7): any[] {
  return db.prepare('SELECT * FROM daily_logs WHERE chat_id = ? ORDER BY date DESC LIMIT ?').all(chatId, limit) as any[];
}
