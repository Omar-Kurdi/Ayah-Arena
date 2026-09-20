import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, useTemporaryDatabase } from './harness';

// The routes read identity from a cookie through next/headers, which only
// exists inside a Next request. That framework boundary is the one thing
// mocked here: everything below it -- the drill rules, the store, SQLite --
// is the real code.
const { jarRef } = vi.hoisted(() => {
  // Defined here rather than imported: vi.mock is hoisted above imports.
  const make = (initial: Record<string, string> = {}) => {
    const values = new Map(Object.entries(initial));
    return {
      get: (name: string) =>
        values.has(name) ? { name, value: values.get(name) as string } : undefined,
      set: (name: string, value: string) => void values.set(name, value),
      read: (name: string) => values.get(name),
    };
  };
  return { jarRef: { current: make(), make } };
});
vi.mock('next/headers', () => ({ cookies: async () => jarRef.current }));

const { POST: startRound } = await import('@/app/api/drill/start/route');
const { POST: answerRound } = await import('@/app/api/drill/answer/route');
const { POST: revealRound } = await import('@/app/api/drill/reveal/route');
const { getAttempts, getSession, getSessionItems } = await import('@/lib/store');

const PLAYER_A = 'player-a-0000-0000-0000-000000000001';
const PLAYER_B = 'player-b-0000-0000-0000-000000000002';

const START = 'http://localhost/api/drill/start';
const ANSWER = 'http://localhost/api/drill/answer';
const REVEAL = 'http://localhost/api/drill/reveal';

const asPlayer = (id: string) => {
  jarRef.current = jarRef.make({ aa_player: id });
};

async function startFor(player: string, mode: 'type' | 'recite' = 'type', rounds = 5) {
  asPlayer(player);
  const response = await startRound(
    jsonRequest(START, { scopeType: 'surah', scopeId: 112, mode, rounds })
  );
  return { response, body: await response.json() };
}

describe('starting a round', () => {
  useTemporaryDatabase();
  beforeEach(() => asPlayer(PLAYER_A));

  it('creates a session owned by the player who asked for it', async () => {
    const { response, body } = await startFor(PLAYER_A);
    expect(response.status).toBe(200);
    expect(getSession(body.sessionId)?.playerId).toBe(PLAYER_A);
  });

  it('gives a player with no cookie an identity rather than turning them away', async () => {
    jarRef.current = jarRef.make();
    const response = await startRound(
      jsonRequest(START, { scopeType: 'surah', scopeId: 112, mode: 'type', rounds: 5 })
    );
    expect(response.status).toBe(200);
    expect(jarRef.current.read('aa_player')).toBeTruthy();
  });

  it.each([
    ['surah', 115],
    ['surah', 0],
    ['juz', 31],
    ['juz', 0],
  ])('refuses %s %i, which does not exist', async (scopeType, scopeId) => {
    const response = await startRound(
      jsonRequest(START, { scopeType, scopeId, mode: 'type', rounds: 5 })
    );
    expect(response.status).toBe(400);
  });

  it('refuses a body that is not JSON', async () => {
    const response = await startRound(
      new Request(START, { method: 'POST', body: 'not json', headers: { 'content-type': 'application/json' } })
    );
    expect(response.status).toBe(400);
  });

  it('never asks for more rounds than the surah can offer', async () => {
    const { body } = await startFor(PLAYER_A, 'type', 10);
    // Al-Ikhlas is four ayat, so three pairs can be asked.
    expect(getSessionItems(body.sessionId)).toHaveLength(3);
    expect(body.prompt.total).toBe(3);
  });
});

describe('another player cannot reach a session', () => {
  useTemporaryDatabase();

  it('refuses to grade it, and records no attempt', async () => {
    const { body } = await startFor(PLAYER_A);

    asPlayer(PLAYER_B);
    const response = await answerRound(
      jsonRequest(ANSWER, { sessionId: body.sessionId, index: 0, text: 'x', elapsedMs: 1000 })
    );

    expect(response.status).toBe(403);
    expect(getAttempts(body.sessionId)).toEqual([]);
  });

  it('refuses to reveal it, and leaves the session untouched', async () => {
    const { body } = await startFor(PLAYER_A, 'recite');
    const before = getSession(body.sessionId);

    asPlayer(PLAYER_B);
    const response = await revealRound(jsonRequest(REVEAL, { sessionId: body.sessionId, index: 0 }));

    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('answer');
    expect(getSession(body.sessionId)).toEqual(before);
    expect(getAttempts(body.sessionId)).toEqual([]);
  });

  it('does not let a second player finish a round the first one started', async () => {
    const { body } = await startFor(PLAYER_A);
    const items = getSessionItems(body.sessionId);

    asPlayer(PLAYER_B);
    await answerRound(
      jsonRequest(ANSWER, { sessionId: body.sessionId, index: 0, text: 'x', elapsedMs: 1000 })
    );

    expect(getSession(body.sessionId)?.completedAt).toBeNull();
    expect(getSessionItems(body.sessionId)).toEqual(items);
  });
});

describe('sessions that do not exist', () => {
  useTemporaryDatabase();
  beforeEach(() => asPlayer(PLAYER_A));

  it.each([
    ['an unknown id', { sessionId: 'no-such-session', index: 0 }],
    ['an empty id', { sessionId: '', index: 0 }],
    ['a missing id', { index: 0 }],
    ['a negative index', { sessionId: 'no-such-session', index: -1 }],
    ['an index that is not a number', { sessionId: 'no-such-session', index: 'first' }],
  ])('refuses %s', async (_name, body) => {
    const answer = await answerRound(jsonRequest(ANSWER, { ...body, text: 'x', elapsedMs: 1 }));
    expect(answer.status).toBe(400);
    expect(await answer.json()).toHaveProperty('error');

    const reveal = await revealRound(jsonRequest(REVEAL, body));
    expect(reveal.status).toBe(400);
  });

  it('refuses a round index past the end of a real session', async () => {
    const { body } = await startFor(PLAYER_A);
    const response = await answerRound(
      jsonRequest(ANSWER, { sessionId: body.sessionId, index: 99, text: 'x', elapsedMs: 1 })
    );
    expect(response.status).toBe(400);
    expect(getAttempts(body.sessionId)).toEqual([]);
  });
});
