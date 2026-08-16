import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { ensurePlayer } from './store';

/**
 * Identity for the MVP is a single opaque cookie -- no account, no email, no
 * profile. Real accounts arrive with duels and circles; until then there is
 * nothing to sign in to and nothing personal to store.
 */

const COOKIE = 'aa_player';
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Reads the current player, if any. Safe to call while rendering a page. */
export async function readPlayerId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

/** Reads the current player, creating one if needed. Route handlers only --
 *  page renders are not allowed to set cookies. */
export async function requirePlayerId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return ensurePlayer(existing);

  const id = randomUUID();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_YEAR,
    path: '/',
  });
  return ensurePlayer(id);
}
