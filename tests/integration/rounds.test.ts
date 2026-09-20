import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, useTemporaryDatabase } from './harness';

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
const { sessionSummary } = await import('@/lib/drill');
const { playerStats } = await import('@/lib/store');
const { verseByKey } = await import('@/lib/quran');

const PLAYER = 'player-rounds-0000-0000-000000000003';
const START = 'http://localhost/api/drill/start';
const ANSWER = 'http://localhost/api/drill/answer';
const REVEAL = 'http://localhost/api/drill/reveal';

/** Al-Ikhlas: four ayat, so three rounds, whatever order they come in. */
async function startRound3(mode: 'type' | 'recite') {
  const response = await startRound(
    jsonRequest(START, { scopeType: 'surah', scopeId: 112, mode, rounds: 10 })
  );
  const body = await response.json();
  return body.sessionId as string;
}

/** The ayah the round is actually asking for, read from the session itself. */
const answerFor = (sessionId: string, index: number) =>
  verseByKey(getSessionItems(sessionId)[index].answerKey).uthmani;

describe('reveal belongs to recite rounds', () => {
  useTemporaryDatabase();
  beforeEach(() => {
    jarRef.current = jarRef.make({ aa_player: PLAYER });
  });

  it('hands the reciter the ayah they were reciting', async () => {
    const sessionId = await startRound3('recite');
    const response = await revealRound(jsonRequest(REVEAL, { sessionId, index: 0 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer.uthmani).toBe(answerFor(sessionId, 0));
    expect(body.answer.glyphs.length).toBeGreaterThan(0);
  });

  it('refuses a typed round: the answer must not be readable before the attempt', async () => {
    const sessionId = await startRound3('type');
    const response = await revealRound(jsonRequest(REVEAL, { sessionId, index: 0 }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).not.toHaveProperty('answer');
    expect(JSON.stringify(body)).not.toContain(answerFor(sessionId, 0));
  });

  it('refuses a round index the session does not have, and reveals nothing', async () => {
    const sessionId = await startRound3('recite');
    const response = await revealRound(jsonRequest(REVEAL, { sessionId, index: 7 }));
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty('answer');
  });

  it('records no attempt: revealing is not answering', async () => {
    const sessionId = await startRound3('recite');
    await revealRound(jsonRequest(REVEAL, { sessionId, index: 0 }));
    expect(getAttempts(sessionId)).toEqual([]);
  });
});

describe('a typed round keeps its answer until the attempt is in', () => {
  useTemporaryDatabase();
  beforeEach(() => {
    jarRef.current = jarRef.make({ aa_player: PLAYER });
  });

  it('sends the prompt without the answer text', async () => {
    const response = await startRound(
      jsonRequest(START, { scopeType: 'surah', scopeId: 112, mode: 'type', rounds: 10 })
    );
    const body = await response.json();
    const expected = answerFor(body.sessionId, 0);

    expect(JSON.stringify(body.prompt)).not.toContain(expected);
    expect(body.prompt).not.toHaveProperty('uthmaniAnswer');
    expect(body.prompt.answerAyahNumber).toBeTypeOf('number'); // the number is fine
  });

  it('returns the answer once the attempt has been submitted', async () => {
    const sessionId = await startRound3('type');
    const response = await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 0, text: answerFor(sessionId, 0), elapsedMs: 2000 })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer.uthmani).toBe(answerFor(sessionId, 0));
    expect(body.grade.accuracy).toBe(1);
  });
});

describe('submitting an attempt', () => {
  useTemporaryDatabase();
  beforeEach(() => {
    jarRef.current = jarRef.make({ aa_player: PLAYER });
  });

  it('stores what was typed, and grades it', async () => {
    const sessionId = await startRound3('type');
    await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 0, text: answerFor(sessionId, 0), elapsedMs: 2000 })
    );

    const [attempt] = getAttempts(sessionId);
    expect(attempt.accuracy).toBe(1);
    expect(attempt.mode).toBe('type');
    expect(attempt.skipped).toBe(false);
    expect(attempt.rawInput).toBe(answerFor(sessionId, 0));
    expect(attempt.elapsedMs).toBe(2000);
  });

  it('scores an empty attempt zero rather than failing', async () => {
    const sessionId = await startRound3('type');
    const response = await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 0, text: '', elapsedMs: 5000 })
    );
    expect(response.status).toBe(200);
    expect(getAttempts(sessionId)[0].accuracy).toBe(0);
  });

  it('keeps a recite round self-graded, with no invented word marking', async () => {
    const sessionId = await startRound3('recite');
    const response = await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 0, selfGrade: 'got_it', elapsedMs: 3000 })
    );
    const body = await response.json();

    expect(body.grade.words).toEqual([]);
    expect(getAttempts(sessionId)[0].selfGrade).toBe('got_it');
  });

});

describe('submitting an attempt: self-grades', () => {
  useTemporaryDatabase();
  beforeEach(() => {
    jarRef.current = jarRef.make({ aa_player: PLAYER });
  });

  // A grade the server does not recognise is dropped and the round is recorded
  // at the gentlest grade. A reader can only ever push their own score down
  // this way, which is why it is accepted rather than rejected.
  it('falls back to the lowest grade when the self-grade is not one it knows', async () => {
    const sessionId = await startRound3('recite');
    const response = await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 0, selfGrade: 'brilliant', elapsedMs: 1000 })
    );

    expect(response.status).toBe(200);
    const [attempt] = getAttempts(sessionId);
    expect(attempt.selfGrade).toBe('not_yet');
    expect(attempt.accuracy).toBeLessThan(1);
  });

  it('counts the round once, even if the same index is sent twice', async () => {
    const sessionId = await startRound3('type');
    const text = answerFor(sessionId, 0);
    await answerRound(jsonRequest(ANSWER, { sessionId, index: 0, text, elapsedMs: 2000 }));
    await answerRound(jsonRequest(ANSWER, { sessionId, index: 0, text: '', elapsedMs: 9000 }));

    const attempts = getAttempts(sessionId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].accuracy).toBe(0); // the later attempt replaces the earlier one
  });
});

describe('skipped rounds stay out of accuracy', () => {
  useTemporaryDatabase();
  beforeEach(() => {
    jarRef.current = jarRef.make({ aa_player: PLAYER });
  });

  // Perfect, skipped, perfect. Counting the skip would drag the average to
  // 67%; leaving it out keeps it at 100%. The figures differ, so a regression
  // in the skip rule fails this test rather than passing quietly.
  it('averages only the rounds that were answered', async () => {
    const sessionId = await startRound3('type');

    await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 0, text: answerFor(sessionId, 0), elapsedMs: 2000 })
    );
    await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 1, text: '', skipped: true, elapsedMs: 1000 })
    );
    await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 2, text: answerFor(sessionId, 2), elapsedMs: 2000 })
    );

    const summary = sessionSummary(sessionId);
    expect(summary?.answered).toBe(3);
    expect(summary?.scored).toBe(2);
    expect(summary?.averageAccuracy).toBe(1);
    expect(playerStats(PLAYER).averageAccuracy).toBe(1);
  });

  it('still lists a skipped ayah among the ones to look at again', async () => {
    const sessionId = await startRound3('type');
    await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 0, text: '', skipped: true, elapsedMs: 1000 })
    );

    const summary = sessionSummary(sessionId);
    expect(summary?.revisit.map((item) => item.skipped)).toContain(true);
    expect(summary?.strongest).toEqual([]);
  });

});

describe('what a skipped round records', () => {
  useTemporaryDatabase();
  beforeEach(() => {
    jarRef.current = jarRef.make({ aa_player: PLAYER });
  });

  it('marks the attempt itself as skipped in the database', async () => {
    const sessionId = await startRound3('type');
    await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 0, text: 'anything', skipped: true, elapsedMs: 1000 })
    );

    const [attempt] = getAttempts(sessionId);
    expect(attempt.skipped).toBe(true);
    expect(attempt.rawInput).toBeNull(); // asking to be shown is not an attempt
  });

  it('does not let a recite round claim to be skipped', async () => {
    const sessionId = await startRound3('recite');
    await answerRound(
      jsonRequest(ANSWER, { sessionId, index: 0, selfGrade: 'not_yet', skipped: true, elapsedMs: 1000 })
    );
    expect(getAttempts(sessionId)[0].skipped).toBe(false);
  });
});

describe('finishing a session', () => {
  useTemporaryDatabase();
  beforeEach(() => {
    jarRef.current = jarRef.make({ aa_player: PLAYER });
  });

  const answerOne = (sessionId: string, index: number) =>
    answerRound(
      jsonRequest(ANSWER, {
        sessionId,
        index,
        text: answerFor(sessionId, index),
        elapsedMs: 2000,
      })
    ).then((response) => response.json());

  it('hands out the next round until there are none, then closes the session', async () => {
    const sessionId = await startRound3('type');
    expect(getSession(sessionId)?.completedAt).toBeNull();

    const first = await answerOne(sessionId, 0);
    const second = await answerOne(sessionId, 1);
    const third = await answerOne(sessionId, 2);

    expect(first.next.index).toBe(1);
    expect(second.next.index).toBe(2);
    expect(third.next).toBeNull();
    expect(getSession(sessionId)?.completedAt).toBeTruthy();
    expect(playerStats(PLAYER).sessionsCompleted).toBe(1);
  });

  it('adds up the points it reported along the way', async () => {
    const sessionId = await startRound3('type');

    const first = await answerOne(sessionId, 0);
    const second = await answerOne(sessionId, 1);
    const third = await answerOne(sessionId, 2);

    expect(second.runningPoints).toBeGreaterThan(first.runningPoints);
    expect(third.runningPoints).toBeGreaterThan(second.runningPoints);
    expect(sessionSummary(sessionId)?.points).toBe(third.runningPoints);
  });
});
