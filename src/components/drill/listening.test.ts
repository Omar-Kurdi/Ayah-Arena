import { describe, expect, it } from 'vitest';
import { keepLit, suggestedGrade } from './listening';
import type { Grade } from '@/lib/score';

// The listening panel's two pure decisions. Everything else about it needs a
// microphone and a model, which belongs to the listener end-to-end stage.

type Words = Grade['words'];
const words = (...statuses: Words[number]['status'][]): Words =>
  statuses.map((status, i) => ({ word: `w${i}`, status }));

describe('suggestedGrade', () => {
  it('suggests the grade the reader would have chosen', () => {
    expect(suggestedGrade(1)).toBe('got_it');
    expect(suggestedGrade(0.7)).toBe('almost');
    expect(suggestedGrade(0.2)).toBe('not_yet');
  });

  it.each([
    [0.85, 'got_it'], // the band edges, where an off-by-one would show
    [0.8499, 'almost'],
    [0.5, 'almost'],
    [0.4999, 'not_yet'],
    [0, 'not_yet'],
  ])('%f -> %s', (accuracy, expected) => {
    expect(suggestedGrade(accuracy)).toBe(expected);
  });

  it('never suggests better than the reader managed', () => {
    const rank = { not_yet: 0, almost: 1, got_it: 2 };
    for (let a = 0; a <= 1.0001; a += 0.05) {
      const here = rank[suggestedGrade(Math.min(a, 1))];
      const lower = rank[suggestedGrade(Math.max(0, a - 0.05))];
      expect(here).toBeGreaterThanOrEqual(lower);
    }
  });
});

describe('keepLit', () => {
  it('lights a word the latest pass heard', () => {
    const lit = keepLit(words('missed', 'missed'), words('exact', 'missed'));
    expect(lit.map((w) => w.status)).toEqual(['exact', 'missed']);
  });

  it('keeps a word lit when a later pass, hearing only the tail, misses it', () => {
    const lit = keepLit(words('exact', 'close'), words('missed', 'missed'));
    expect(lit.map((w) => w.status)).toEqual(['exact', 'close']);
  });

  it('upgrades a near miss once the word is heard properly', () => {
    expect(keepLit(words('close'), words('exact'))[0].status).toBe('exact');
  });

  it('never downgrades exact to close', () => {
    expect(keepLit(words('exact'), words('close'))[0].status).toBe('exact');
  });

  it('takes the new list as the shape, so the ayah decides the dot count', () => {
    expect(keepLit(words('exact', 'exact', 'exact'), words('missed'))).toHaveLength(1);
    expect(keepLit(words('exact'), words('missed', 'missed'))).toHaveLength(2);
  });

  it('handles the first pass, when nothing was lit yet', () => {
    expect(keepLit([], words('exact', 'missed')).map((w) => w.status)).toEqual([
      'exact',
      'missed',
    ]);
  });

  it('is stable: merging the same pass twice changes nothing', () => {
    const once = keepLit(words('exact', 'missed'), words('missed', 'close'));
    const twice = keepLit(once, words('missed', 'close'));
    expect(twice.map((w) => w.status)).toEqual(once.map((w) => w.status));
  });

  it('keeps the words from whichever pass won, not a blend', () => {
    const before: Words = [{ word: 'kept', status: 'exact' }];
    const now: Words = [{ word: 'fresh', status: 'missed' }];
    expect(keepLit(before, now)[0]).toEqual({ word: 'kept', status: 'exact' });
  });
});
