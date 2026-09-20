import { describe, expect, it } from 'vitest';
import { recallWords } from './useDrillSession';
import type { RoundResult } from '@/lib/drill';
import type { Grade } from '@/lib/score';

// Which marks end up on the revealed ayah. The rest of the session needs a
// server and a browser, and the Playwright suites cover it there.

type Words = Grade['words'];

const words = (...statuses: Words[number]['status'][]): Words =>
  statuses.map((status, i) => ({ word: `w${i}`, status }));

const heard = (accuracy: number, words: Words): Grade => ({
  accuracy,
  points: Math.round(accuracy * 100),
  words,
  exactCount: words.filter((w) => w.status === 'exact').length,
  closeCount: words.filter((w) => w.status === 'close').length,
  missedCount: words.filter((w) => w.status === 'missed').length,
  extraCount: 0,
});

const round = (words: Words): RoundResult => ({ grade: heard(1, words) }) as RoundResult;

describe('recallWords', () => {
  it('marks a typed attempt with what the grader found', () => {
    const graded = words('exact', 'close');
    expect(recallWords(round(graded), null, false)).toEqual(graded);
  });

  it('leaves an ayah the reader asked to be shown unmarked', () => {
    // Marking every word "look again" would treat asking for help like
    // getting the whole ayah wrong.
    expect(recallWords(round(words('missed', 'missed')), null, true)).toBeNull();
  });

  it('marks nothing when the round carried no per-word grade', () => {
    // A self-reported recite round: one grade, no words.
    expect(recallWords(round([]), null, false)).toBeNull();
  });

  it('falls back to what the listener heard', () => {
    const listened = words('exact', 'missed');
    expect(recallWords(round([]), { grade: heard(0.5, listened) }, false)).toEqual(listened);
  });

  it('ignores a listening pass that heard nothing at all', () => {
    const nothing = { grade: heard(0, words('missed', 'missed')) };
    expect(recallWords(null, nothing, false)).toBeNull();
  });

  it('ignores a listener that could not run', () => {
    expect(recallWords(null, { grade: null }, false)).toBeNull();
  });

  it('prefers the graded attempt over the listener', () => {
    const graded = words('exact', 'exact');
    const listened = { grade: heard(0.5, words('close', 'missed')) };
    expect(recallWords(round(graded), listened, false)).toEqual(graded);
  });

  it('marks nothing before there is anything to mark', () => {
    expect(recallWords(null, null, false)).toBeNull();
  });
});
