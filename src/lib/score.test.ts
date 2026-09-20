import { describe, expect, it } from 'vitest';
import { gradeSelfReported, gradeTyped, type ExpectedAyah } from './score';

// `npm run check` covers the headline grading paths on real ayat. These pin
// the rules around them: which spelling wins, what an extra word costs, how
// speed is credited, and that nothing here throws on junk input.

const FAST = 1_000;
const SLOW = 10 * 60 * 1000;

// Al-Ikhlas 1, in the three spellings the grader accepts.
const uthmani = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ';
const imlaei = 'قل هو الله أحد';
const simple = 'قل هو الله احد';
const ayah: ExpectedAyah = { display: uthmani, accepted: [imlaei, simple, uthmani] };

describe('gradeTyped: what counts as right', () => {
  it('accepts every spelling in the list, each at full marks', () => {
    for (const spelling of [uthmani, imlaei, simple]) {
      expect(gradeTyped(ayah, spelling, FAST).accuracy).toBe(1);
    }
  });

  it('hands back the mushaf spelling whatever was typed', () => {
    const graded = gradeTyped(ayah, simple, FAST);
    expect(graded.words.map((w) => w.word).join(' ')).toBe(uthmani);
  });

  it('marks a one-letter typo as close rather than missed', () => {
    const graded = gradeTyped(ayah, 'قل هو الله أحر', FAST);
    expect(graded.words.map((w) => w.status)).toEqual(['exact', 'exact', 'exact', 'close']);
    expect(graded.accuracy).toBeGreaterThan(0.9);
    expect(graded.accuracy).toBeLessThan(1);
  });

  it('scores a missing word as missed and loses roughly its share', () => {
    const graded = gradeTyped(ayah, 'قل هو الله', FAST);
    expect(graded.missedCount).toBe(1);
    expect(graded.accuracy).toBeCloseTo(0.75, 2);
  });

  it('counts words that match nothing as extra', () => {
    const graded = gradeTyped(ayah, `${simple} زيادة`, FAST);
    expect(graded.extraCount).toBe(1);
  });
});

describe('gradeTyped: boundaries', () => {
  it('scores an empty attempt zero, and still returns the ayah to look at', () => {
    const graded = gradeTyped(ayah, '', FAST);
    expect(graded.accuracy).toBe(0);
    expect(graded.points).toBe(0);
    expect(graded.words).toHaveLength(4);
    expect(graded.words.every((w) => w.status === 'missed')).toBe(true);
  });

  it('scores whitespace and Latin the same as nothing', () => {
    for (const attempt of ['   ', 'qul huwa allahu ahad', '12345', '...']) {
      expect(gradeTyped(ayah, attempt, FAST).accuracy).toBe(0);
    }
  });

  it('never returns an accuracy outside 0..1, or negative points', () => {
    for (const attempt of ['', simple, `${simple} ${simple}`, 'مد']) {
      const graded = gradeTyped(ayah, attempt, FAST);
      expect(graded.accuracy).toBeGreaterThanOrEqual(0);
      expect(graded.accuracy).toBeLessThanOrEqual(1);
      expect(graded.points).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts each word exactly once across the three status buckets', () => {
    const graded = gradeTyped(ayah, 'قل هو الله أحر', FAST);
    expect(graded.exactCount + graded.closeCount + graded.missedCount).toBe(graded.words.length);
  });
});

describe('gradeTyped: speed is a bonus, never a penalty', () => {
  it('pays a bonus for a quick perfect answer', () => {
    expect(gradeTyped(ayah, simple, FAST).points).toBeGreaterThan(100);
  });

  it('still pays full marks for a slow perfect answer', () => {
    expect(gradeTyped(ayah, simple, SLOW).points).toBe(100);
  });

  it('never scores a slow answer above a fast one', () => {
    const fast = gradeTyped(ayah, simple, FAST).points;
    const slow = gradeTyped(ayah, simple, SLOW).points;
    expect(slow).toBeLessThanOrEqual(fast);
  });

  it('pays no bonus when nothing came back', () => {
    expect(gradeTyped(ayah, '', 1).points).toBe(0);
  });
});

describe('gradeTyped: normalization is part of grading', () => {
  it('ignores harakat, tatweel and the ayah-end symbol in the attempt', () => {
    const decorated = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ ۝١';
    const stretched = 'قل هــو الله أحد';
    expect(gradeTyped(ayah, decorated, FAST).accuracy).toBe(1);
    expect(gradeTyped(ayah, stretched, FAST).accuracy).toBe(1);
  });

  it('does not care about surrounding whitespace', () => {
    expect(gradeTyped(ayah, `   ${simple}   `, FAST).accuracy).toBe(1);
  });
});

describe('gradeSelfReported', () => {
  it('ranks the three grades in order', () => {
    const got = gradeSelfReported('got_it', FAST).accuracy;
    const almost = gradeSelfReported('almost', FAST).accuracy;
    const notYet = gradeSelfReported('not_yet', FAST).accuracy;
    expect(got).toBeGreaterThan(almost);
    expect(almost).toBeGreaterThan(notYet);
    expect(notYet).toBeGreaterThan(0); // nothing scores zero for trying
  });

  it('invents no per-word marking: a spoken round has no word list', () => {
    expect(gradeSelfReported('got_it', FAST).words).toEqual([]);
  });

  it('pays a speed bonus only on a full self-grade', () => {
    expect(gradeSelfReported('got_it', FAST).points).toBeGreaterThan(100);
    const notYet = gradeSelfReported('not_yet', FAST);
    expect(notYet.points).toBe(Math.round(notYet.accuracy * 100));
  });
});
