import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, removeDataDir, temporaryDataDir } from './harness';

/**
 * The store upgrades an existing database in place (`migrate` in
 * src/lib/store.ts): `attempts.skipped` arrived after the first build, and a
 * reader who had already drilled must keep their history.
 *
 * These tests build a real database in the older shape, with real rows in it,
 * then let the application open it.
 */

// The schema as it stood before `skipped` existed. Written out rather than
// derived from the current code, so it cannot drift along with it.
const OLD_SCHEMA = `
  CREATE TABLE players (
    id           TEXT PRIMARY KEY,
    display_name TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE TABLE sessions (
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
  CREATE TABLE session_items (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    idx        INTEGER NOT NULL,
    prompt_key TEXT NOT NULL,
    answer_key TEXT NOT NULL,
    PRIMARY KEY (session_id, idx)
  );
  CREATE TABLE attempts (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    idx        INTEGER NOT NULL,
    player_id  TEXT NOT NULL REFERENCES players(id),
    answer_key TEXT NOT NULL,
    mode       TEXT NOT NULL,
    raw_input  TEXT,
    self_grade TEXT,
    accuracy   REAL NOT NULL,
    points     INTEGER NOT NULL,
    elapsed_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, idx)
  );
`;

const PLAYER = 'player-from-an-older-build';
const SESSION = 'session-from-an-older-build';
const EARLIER = '2026-01-01T00:00:00.000Z';

let dir: string;
let dbPath: string;

/** A database as an earlier build left it, with one finished session in it. */
function writeOldDatabase() {
  const db = new DatabaseSync(dbPath);
  db.exec(OLD_SCHEMA);
  db.prepare('INSERT INTO players (id, display_name, created_at) VALUES (?, ?, ?)').run(
    PLAYER,
    null,
    EARLIER
  );
  db.prepare(
    `INSERT INTO sessions (id, player_id, juz, scope_type, scope_id, mode, total_rounds, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(SESSION, PLAYER, 30, 'juz', 30, 'type', 2, EARLIER, EARLIER);
  db.prepare(
    'INSERT INTO session_items (session_id, idx, prompt_key, answer_key) VALUES (?, ?, ?, ?)'
  ).run(SESSION, 0, '112:1', '112:2');
  db.prepare(
    `INSERT INTO attempts (session_id, idx, player_id, answer_key, mode, raw_input, self_grade, accuracy, points, elapsed_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(SESSION, 0, PLAYER, '112:2', 'type', 'قل هو الله احد', null, 1, 110, 2000, EARLIER);
  db.close();
}

const columnsOf = (table: string) => {
  const db = new DatabaseSync(dbPath);
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
    notnull: number;
    dflt_value: string | null;
  }[];
  db.close();
  return rows;
};

beforeEach(() => {
  dir = temporaryDataDir();
  dbPath = join(dir, 'ayah-arena.db');
});

afterEach(() => {
  removeDataDir(dir);
});

describe('opening a database from an older build', () => {
  it('starts without the column the current build needs', () => {
    writeOldDatabase();
    expect(columnsOf('attempts').map((c) => c.name)).not.toContain('skipped');
  });

  it('adds the column when the application opens it', async () => {
    writeOldDatabase();
    const { ensurePlayer } = await import('@/lib/store');
    ensurePlayer(PLAYER); // any call opens the database and runs the upgrade
    closeDatabase();

    const skipped = columnsOf('attempts').find((c) => c.name === 'skipped');
    expect(skipped).toBeDefined();
    expect(skipped?.notnull).toBe(1);
    expect(skipped?.dflt_value).toBe('0');
  });

  it('keeps the history that was already there', async () => {
    writeOldDatabase();
    const { getAttempts, getSession } = await import('@/lib/store');

    const session = getSession(SESSION);
    expect(session?.playerId).toBe(PLAYER);
    expect(session?.completedAt).toBe(EARLIER);

    const [attempt] = getAttempts(SESSION);
    expect(attempt.answerKey).toBe('112:2');
    expect(attempt.accuracy).toBe(1);
    expect(attempt.points).toBe(110);
    expect(attempt.rawInput).toBe('قل هو الله احد');
  });

  it('treats those older rounds as not skipped', async () => {
    writeOldDatabase();
    const { getAttempts, playerStats } = await import('@/lib/store');

    expect(getAttempts(SESSION)[0].skipped).toBe(false);
    // The old round counts towards accuracy, which is what "not skipped" means.
    expect(playerStats(PLAYER).averageAccuracy).toBe(1);
    expect(playerStats(PLAYER).ayahsPracticed).toBe(1);
    expect(playerStats(PLAYER).sessionsCompleted).toBe(1);
  });

});

describe('a database from an older build, once upgraded', () => {
  it('records new rounds with the new column alongside the old ones', async () => {
    writeOldDatabase();
    const { getAttempts, playerStats, recordAttempt } = await import('@/lib/store');

    recordAttempt({
      sessionId: SESSION,
      idx: 1,
      playerId: PLAYER,
      answerKey: '112:3',
      mode: 'type',
      rawInput: null,
      selfGrade: null,
      skipped: true,
      accuracy: 0,
      points: 0,
      elapsedMs: 1000,
    });

    const attempts = getAttempts(SESSION);
    expect(attempts).toHaveLength(2);
    expect(attempts.map((a) => a.skipped)).toEqual([false, true]);
    // The skipped round is left out, so the average stays where it was.
    expect(playerStats(PLAYER).averageAccuracy).toBe(1);
  });

  it('runs only once: opening an already-upgraded database changes nothing', async () => {
    writeOldDatabase();
    const { ensurePlayer } = await import('@/lib/store');
    ensurePlayer(PLAYER);
    closeDatabase();
    const afterFirst = columnsOf('attempts');

    ensurePlayer(PLAYER);
    closeDatabase();
    expect(columnsOf('attempts')).toEqual(afterFirst);
  });
});

describe('opening a database that does not exist yet', () => {
  it('creates every table the application needs', async () => {
    const { ensurePlayer } = await import('@/lib/store');
    ensurePlayer('a-brand-new-player');
    closeDatabase();

    const db = new DatabaseSync(dbPath);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    db.close();

    expect(tables).toEqual(
      expect.arrayContaining(['players', 'sessions', 'session_items', 'attempts'])
    );
  });

  it('creates it with the current shape, upgrade included', async () => {
    const { ensurePlayer } = await import('@/lib/store');
    ensurePlayer('a-brand-new-player');
    closeDatabase();
    expect(columnsOf('attempts').map((c) => c.name)).toContain('skipped');
  });

  it('enforces the foreign keys the schema declares', async () => {
    const { ensurePlayer } = await import('@/lib/store');
    ensurePlayer('a-brand-new-player');
    closeDatabase();

    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON');
    expect(() =>
      db
        .prepare(
          `INSERT INTO sessions (id, player_id, juz, scope_type, scope_id, mode, total_rounds, created_at)
           VALUES ('s', 'nobody', 30, 'juz', 30, 'type', 1, '2026-01-01T00:00:00.000Z')`
        )
        .run()
    ).toThrow();
    db.close();
  });
});
