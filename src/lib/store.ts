import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * All persistence lives behind this module. It is deliberately the only file
 * that knows the storage engine: duels and circles will outgrow a local SQLite
 * file, and swapping in Postgres should mean rewriting this file and nothing
 * else.
 *
 * Attempts are recorded with enough shape for the later phases -- per-ayah
 * accuracy and timing are exactly what a spaced-repetition queue needs, so
 * recording them now avoids a migration when revision mode arrives.
 */

export type DrillMode = 'type' | 'recite';
export type ScopeType = 'juz' | 'surah';

export interface SessionRow {
  id: string;
  playerId: string;
  juz: number;
  scopeType: ScopeType;
  scopeId: number;
  mode: DrillMode;
  totalRounds: number;
  createdAt: string;
  completedAt: string | null;
}

export interface SessionItemRow {
  sessionId: string;
  idx: number;
  promptKey: string;
  answerKey: string;
}

export interface AttemptRow {
  sessionId: string;
  idx: number;
  playerId: string;
  answerKey: string;
  mode: DrillMode;
  rawInput: string | null;
  selfGrade: string | null;
  /** The reader asked to be shown this ayah instead of attempting it. Kept out
   *  of every accuracy figure -- a skip is not a blank answer. */
  skipped: boolean;
  accuracy: number;
  points: number;
  elapsedMs: number;
  createdAt: string;
}

// Next's dev server re-evaluates modules on edit, and its build workers import
// every route in parallel. Caching the handle on globalThis keeps one
// connection per process; opening it lazily keeps the build from touching the
// database at all.
const globalRef = globalThis as typeof globalThis & { __ayahArenaDb?: DatabaseSync };

function connect(): DatabaseSync {
  if (globalRef.__ayahArenaDb) return globalRef.__ayahArenaDb;

  const dir = join(process.cwd(), '.data');
  mkdirSync(dir, { recursive: true });
  const handle = new DatabaseSync(join(dir, 'ayah-arena.db'));

  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA foreign_keys = ON');
  handle.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id          TEXT PRIMARY KEY,
      display_name TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      player_id    TEXT NOT NULL REFERENCES players(id),
      juz          INTEGER NOT NULL,
      scope_type   TEXT NOT NULL,
      scope_id     INTEGER NOT NULL,
      mode         TEXT NOT NULL,
      total_rounds INTEGER NOT NULL,
      created_at   TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS session_items (
      session_id TEXT NOT NULL REFERENCES sessions(id),
      idx        INTEGER NOT NULL,
      prompt_key TEXT NOT NULL,
      answer_key TEXT NOT NULL,
      PRIMARY KEY (session_id, idx)
    );

    CREATE TABLE IF NOT EXISTS attempts (
      session_id TEXT NOT NULL REFERENCES sessions(id),
      idx        INTEGER NOT NULL,
      player_id  TEXT NOT NULL REFERENCES players(id),
      answer_key TEXT NOT NULL,
      mode       TEXT NOT NULL,
      raw_input  TEXT,
      self_grade TEXT,
      skipped    INTEGER NOT NULL DEFAULT 0,
      accuracy   REAL NOT NULL,
      points     INTEGER NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, idx)
    );

    CREATE INDEX IF NOT EXISTS attempts_by_player
      ON attempts (player_id, answer_key, created_at);
    CREATE INDEX IF NOT EXISTS sessions_by_player
      ON sessions (player_id, created_at);
  `);

  migrate(handle);
  globalRef.__ayahArenaDb = handle;
  return handle;
}

/** Additive column migrations for databases created by an earlier build. */
function migrate(handle: DatabaseSync): void {
  const columns = handle.prepare('PRAGMA table_info(attempts)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'skipped')) {
    handle.exec('ALTER TABLE attempts ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0');
  }
}

const now = () => new Date().toISOString();

export function ensurePlayer(id: string): string {
  connect()
    .prepare('INSERT OR IGNORE INTO players (id, created_at) VALUES (?, ?)')
    .run(id, now());
  return id;
}

export function createSession(input: {
  playerId: string;
  juz: number;
  scopeType: ScopeType;
  scopeId: number;
  mode: DrillMode;
  items: { promptKey: string; answerKey: string }[];
}): string {
  const handle = connect();
  const sessionId = randomUUID();

  handle
    .prepare(
      `INSERT INTO sessions
         (id, player_id, juz, scope_type, scope_id, mode, total_rounds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      sessionId,
      input.playerId,
      input.juz,
      input.scopeType,
      input.scopeId,
      input.mode,
      input.items.length,
      now()
    );

  const insertItem = handle.prepare(
    'INSERT INTO session_items (session_id, idx, prompt_key, answer_key) VALUES (?, ?, ?, ?)'
  );
  input.items.forEach((item, idx) => {
    insertItem.run(sessionId, idx, item.promptKey, item.answerKey);
  });

  return sessionId;
}

export function getSession(sessionId: string): SessionRow | null {
  const row = connect()
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(sessionId) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    id: row.id as string,
    playerId: row.player_id as string,
    juz: Number(row.juz),
    scopeType: row.scope_type as ScopeType,
    scopeId: Number(row.scope_id),
    mode: row.mode as DrillMode,
    totalRounds: Number(row.total_rounds),
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

export function getSessionItems(sessionId: string): SessionItemRow[] {
  const rows = connect()
    .prepare('SELECT * FROM session_items WHERE session_id = ? ORDER BY idx')
    .all(sessionId) as Record<string, unknown>[];

  return rows.map((row) => ({
    sessionId: row.session_id as string,
    idx: Number(row.idx),
    promptKey: row.prompt_key as string,
    answerKey: row.answer_key as string,
  }));
}

/** Idempotent: replaying the same round overwrites rather than double-counting. */
export function recordAttempt(attempt: Omit<AttemptRow, 'createdAt'>): void {
  connect()
    .prepare(
      `INSERT INTO attempts
         (session_id, idx, player_id, answer_key, mode, raw_input, self_grade,
          skipped, accuracy, points, elapsed_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (session_id, idx) DO UPDATE SET
         raw_input = excluded.raw_input,
         self_grade = excluded.self_grade,
         skipped = excluded.skipped,
         accuracy = excluded.accuracy,
         points = excluded.points,
         elapsed_ms = excluded.elapsed_ms,
         created_at = excluded.created_at`
    )
    .run(
      attempt.sessionId,
      attempt.idx,
      attempt.playerId,
      attempt.answerKey,
      attempt.mode,
      attempt.rawInput,
      attempt.selfGrade,
      attempt.skipped ? 1 : 0,
      attempt.accuracy,
      attempt.points,
      attempt.elapsedMs,
      now()
    );
}

export function getAttempts(sessionId: string): AttemptRow[] {
  const rows = connect()
    .prepare('SELECT * FROM attempts WHERE session_id = ? ORDER BY idx')
    .all(sessionId) as Record<string, unknown>[];

  return rows.map((row) => ({
    sessionId: row.session_id as string,
    idx: Number(row.idx),
    playerId: row.player_id as string,
    answerKey: row.answer_key as string,
    mode: row.mode as DrillMode,
    rawInput: (row.raw_input as string | null) ?? null,
    selfGrade: (row.self_grade as string | null) ?? null,
    skipped: Number(row.skipped ?? 0) === 1,
    accuracy: Number(row.accuracy),
    points: Number(row.points),
    elapsedMs: Number(row.elapsed_ms),
    createdAt: row.created_at as string,
  }));
}

export function completeSession(sessionId: string): void {
  connect()
    .prepare('UPDATE sessions SET completed_at = ? WHERE id = ? AND completed_at IS NULL')
    .run(now(), sessionId);
}

export interface PlayerStats {
  sessionsCompleted: number;
  ayahsPracticed: number;
  averageAccuracy: number;
}

/** Totals only. There is deliberately no streak counter and no "last active"
 *  date here -- nothing in this app should be able to tell a reader they broke
 *  something by taking a few days off. */
export function playerStats(playerId: string): PlayerStats {
  const handle = connect();

  const sessions = handle
    .prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE player_id = ? AND completed_at IS NOT NULL'
    )
    .get(playerId) as { n: number };

  const attempts = handle
    .prepare(
      `SELECT COUNT(DISTINCT answer_key) AS ayat, AVG(accuracy) AS avg_accuracy
         FROM attempts WHERE player_id = ? AND skipped = 0`
    )
    .get(playerId) as { ayat: number; avg_accuracy: number | null };

  return {
    sessionsCompleted: Number(sessions.n ?? 0),
    ayahsPracticed: Number(attempts.ayat ?? 0),
    averageAccuracy: attempts.avg_accuracy ?? 0,
  };
}
