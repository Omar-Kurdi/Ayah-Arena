import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach } from 'vitest';

/**
 * Integration tests run against the application's real SQLite code, one
 * throwaway database per test.
 *
 * `AYAH_ARENA_DATA_DIR` moves the database file; the connection itself is
 * cached on globalThis (so Next's dev server and build workers share one), so
 * a test also has to drop that handle to get a fresh database.
 */

type WithHandle = typeof globalThis & { __ayahArenaDb?: DatabaseSync };

export function closeDatabase(): void {
  const global = globalThis as WithHandle;
  try {
    global.__ayahArenaDb?.close();
  } catch {
    // Already closed: nothing to do, and nothing worth failing a test over.
  }
  delete global.__ayahArenaDb;
}

/** A directory the test owns, with the database path the app expects inside. */
export function temporaryDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ayah-arena-test-'));
  process.env.AYAH_ARENA_DATA_DIR = dir;
  closeDatabase();
  return dir;
}

export function removeDataDir(dir: string): void {
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
}

/** Gives every test in a file its own empty database, and cleans up after. */
export function useTemporaryDatabase(): { path: () => string } {
  let dir = '';
  beforeEach(() => {
    dir = temporaryDataDir();
  });
  afterEach(() => {
    removeDataDir(dir);
  });
  return { path: () => join(dir, 'ayah-arena.db') };
}

/**
 * The cookie jar `next/headers` would hand a route handler. Only `get` and
 * `set` are used by the app (src/lib/player.ts).
 */
export function cookieJar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: (name: string) =>
      values.has(name) ? { name, value: values.get(name) as string } : undefined,
    set: (name: string, value: string) => {
      values.set(name, value);
    },
    read: (name: string) => values.get(name),
    values,
  };
}

export type CookieJar = ReturnType<typeof cookieJar>;

/** POST a JSON body to a route handler, the way the browser does. */
export function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
