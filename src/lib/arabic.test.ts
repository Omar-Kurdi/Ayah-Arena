import { describe, expect, it } from 'vitest';
import { looksArabic, normalizeArabic, normalizedWords, withinOneEdit } from './arabic';

// `npm run check` already proves the basics against the whole corpus (harakat,
// wasla, teh marbuta, one-edit distance). These cover the rules and edges it
// does not state explicitly, and pin the behaviour that grading depends on.

describe('normalizeArabic: marks', () => {
  it('drops every mark range the grader is meant to ignore', () => {
    const marks = [
      'ؐ', // sallallahou alayhe wassallam
      'ؚ', // small kasra
      'ً', // fathatan
      'ّ', // shadda
      'ٟ', // wavy hamza below
      'ۖ', // small high ligature
      'ۭ', // small low meem
      '࣓', // small low waw
    ];
    for (const mark of marks) {
      expect(normalizeArabic(`م${mark}د`)).toBe('مد');
    }
  });

  // Regression: tatweel sits in the same character class as the combining
  // ranges. It was moved to the end of that class to stop it reading as one
  // grapheme with the range beside it; it must still be stripped.
  it('strips tatweel, wherever it appears', () => {
    expect(normalizeArabic('مـد')).toBe('مد');
    expect(normalizeArabic('ـمدـ')).toBe('مد');
    expect(normalizeArabic('مـــد')).toBe('مد');
  });

  it('treats a stretched word and a plain one as the same word', () => {
    expect(normalizeArabic('الــحمد')).toBe(
      normalizeArabic('الحمد')
    );
  });
});

describe('normalizeArabic: dagger alef', () => {
  it('replaces the letter it sits on when that letter is alef or alef maksura', () => {
    // "maa" written with alef + dagger stays one alef, not two.
    expect(normalizeArabic('ماٰ')).toBe('ما');
    expect(normalizeArabic('مىٰ')).toBe('ما');
  });

  it('becomes a full alef after any other letter', () => {
    // "mihaadan": the keyboard spelling writes the alef out.
    expect(normalizeArabic('مهٰد')).toBe('مهاد');
  });
});

describe('normalizeArabic: letter folding', () => {
  it.each([
    ['alef madda', 'آ', 'ا'],
    ['alef hamza above', 'أ', 'ا'],
    ['alef hamza below', 'إ', 'ا'],
    ['alef wasla', 'ٱ', 'ا'],
    ['alef maksura', 'ى', 'ي'],
    ['teh marbuta', 'ة', 'ه'],
    ['waw hamza', 'ؤ', 'و'],
    ['yeh hamza', 'ئ', 'ي'],
  ])('folds %s', (_name, from, to) => {
    expect(normalizeArabic(`م${from}`)).toBe(`م${to}`);
  });

  it('drops a standalone hamza', () => {
    expect(normalizeArabic('مءد')).toBe('مد');
  });

  it('collapses a doubled letter, so shadda and a written double agree', () => {
    expect(normalizeArabic('الليل')).toBe(
      normalizeArabic('اليل')
    );
  });
});

describe('normalizeArabic: everything that is not a letter', () => {
  it('turns digits, punctuation and Latin into word breaks', () => {
    expect(normalizeArabic('مد, abc 123 مد')).toBe('مد مد');
  });

  it('drops the ayah-end symbol', () => {
    expect(normalizeArabic('مد ۝١')).toBe('مد');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(normalizeArabic('  مد \n\t مد  ')).toBe('مد مد');
  });

  it('returns an empty string for empty or letterless input', () => {
    expect(normalizeArabic('')).toBe('');
    expect(normalizeArabic('   ')).toBe('');
    expect(normalizeArabic('hello 123')).toBe('');
  });
});

describe('normalizedWords', () => {
  it('splits on word breaks', () => {
    expect(normalizedWords('مد مد')).toEqual(['مد', 'مد']);
  });

  it('is an empty list, not a list holding an empty string', () => {
    expect(normalizedWords('')).toEqual([]);
    expect(normalizedWords('   ')).toEqual([]);
    expect(normalizedWords('abc')).toEqual([]);
  });
});

describe('withinOneEdit', () => {
  it.each([
    ['identical', 'مدد', 'مدد', true],
    ['one substitution', 'مدد', 'مدر', true],
    ['one insertion', 'مدد', 'مددد', true],
    ['one deletion', 'مددد', 'مدد', true],
    ['two substitutions', 'مدد', 'مرر', false],
    ['two insertions', 'مد', 'مددد', false],
    ['transposition counts as two edits', 'مد', 'دم', false],
    ['empty against one letter', '', 'م', true],
    ['empty against two letters', '', 'مد', false],
    ['both empty', '', '', true],
  ])('%s', (_name, a, b, expected) => {
    expect(withinOneEdit(a, b)).toBe(expected);
    expect(withinOneEdit(b, a)).toBe(expected); // order must not matter
  });
});

describe('looksArabic', () => {
  it('is true for Arabic script, including presentation forms', () => {
    expect(looksArabic('مد')).toBe(true);
    expect(looksArabic('mixed مد text')).toBe(true);
    expect(looksArabic('ﻵ')).toBe(true); // presentation form
  });

  it('is false for Latin, digits and empty input', () => {
    expect(looksArabic('')).toBe(false);
    expect(looksArabic('alhamdulillah')).toBe(false);
    expect(looksArabic('123')).toBe(false);
  });
});
