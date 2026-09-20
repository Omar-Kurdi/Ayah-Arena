import { describe, expect, it } from 'vitest';
import { normalizedWords } from './arabic';
import {
  buildPairs,
  expectedAyah,
  isValidScope,
  scopeLabel,
  scopePairCount,
  surahVerses,
  verseByKey,
} from './quran';

// Reads the committed data files, like the app does. No network, no database.
// `npm run check` walks all 6,236 ayat; this pins the specific cases that have
// been fragile, and the boundaries around them.

describe('verseByKey', () => {
  it('resolves an ayah by its own key', () => {
    const verse = verseByKey('112:1');
    expect(verse.surah).toBe(112);
    expect(verse.ayah).toBe(1);
    expect(verse.uthmani.length).toBeGreaterThan(0);
  });

  it('refuses a key that is not an ayah', () => {
    for (const key of ['0:1', '115:1', '112:5', 'nonsense', '']) {
      expect(() => verseByKey(key)).toThrow();
    }
  });
});

describe('glyph alignment', () => {
  // Every mushaf glyph covers one graded word, except in four ayat where the
  // page fuses two words into a single glyph. The fetch script records that as
  // `n`, and the totals have to agree or the recall marking slips a word.
  const spanned = (key: string) =>
    verseByKey(key).glyphs.reduce((sum, glyph) => sum + (glyph.n ?? 1), 0);

  it.each(['2:181', '8:6', '13:37', '37:130'])(
    'the fused glyphs in %s still cover every graded word',
    (key) => {
      const verse = verseByKey(key);
      expect(verse.glyphs.some((glyph) => (glyph.n ?? 1) > 1)).toBe(true);
      expect(spanned(key)).toBe(normalizedWords(verse.uthmani).length);
    }
  );

  it.each(['1:1', '2:255', '112:1', '114:6'])('glyphs line up with words in %s', (key) => {
    expect(spanned(key)).toBe(normalizedWords(verseByKey(key).uthmani).length);
  });

  it('every glyph names a real mushaf page', () => {
    for (const verse of [verseByKey('1:1'), verseByKey('2:255'), verseByKey('114:6')]) {
      for (const glyph of verse.glyphs) {
        expect(glyph.p).toBeGreaterThanOrEqual(1);
        expect(glyph.p).toBeLessThanOrEqual(604);
        expect(glyph.c.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('expectedAyah', () => {
  it('shows the mushaf spelling and accepts all three', () => {
    const verse = verseByKey('112:1');
    const expected = expectedAyah(verse);
    expect(expected.display).toBe(verse.uthmani);
    expect(expected.accepted).toEqual(
      expect.arrayContaining([verse.uthmani, verse.imlaei, verse.simple])
    );
  });
});

describe('isValidScope', () => {
  it.each([
    [{ type: 'juz' as const, id: 1 }, true],
    [{ type: 'juz' as const, id: 30 }, true],
    [{ type: 'juz' as const, id: 0 }, false],
    [{ type: 'juz' as const, id: 31 }, false],
    [{ type: 'surah' as const, id: 1 }, true],
    [{ type: 'surah' as const, id: 114 }, true],
    [{ type: 'surah' as const, id: 0 }, false],
    [{ type: 'surah' as const, id: 115 }, false],
    [{ type: 'surah' as const, id: 1.5 }, false],
    [{ type: 'surah' as const, id: Number.NaN }, false],
  ])('%o -> %s', (scope, expected) => {
    expect(isValidScope(scope)).toBe(expected);
  });
});

describe('buildPairs', () => {
  it('pairs consecutive ayat of one surah, never across a surah boundary', () => {
    const pairs = buildPairs({ type: 'juz', id: 30 });
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(pair.answer.surah).toBe(pair.prompt.surah);
      expect(pair.answer.ayah).toBe(pair.prompt.ayah + 1);
    }
  });

  it('starts a juz where the juz starts, mid-surah if that is where it falls', () => {
    const pairs = buildPairs({ type: 'juz', id: 2 });
    expect(pairs[0].prompt.key).toBe('2:142');
  });

  it('agrees with the count the picker shows', () => {
    for (const scope of [
      { type: 'juz' as const, id: 30 },
      { type: 'surah' as const, id: 112 },
    ]) {
      expect(buildPairs(scope)).toHaveLength(scopePairCount(scope));
    }
  });

  it('has nothing to ask for a one-ayah surah', () => {
    expect(surahVerses(108)).toHaveLength(3);
    expect(buildPairs({ type: 'surah', id: 103 }).length).toBe(surahVerses(103).length - 1);
  });
});

describe('scopeLabel', () => {
  it('names a juz in each language, with the right digits', () => {
    expect(scopeLabel({ type: 'juz', id: 30 }, 'en')).toBe('Juz 30');
    expect(scopeLabel({ type: 'juz', id: 30 }, 'ar')).toContain('٣٠'); // ٣٠
  });

  it('names a surah in the language of the interface', () => {
    expect(scopeLabel({ type: 'surah', id: 112 }, 'en')).toBe('Al-Ikhlas');
    expect(scopeLabel({ type: 'surah', id: 112 }, 'ar')).toContain('الإخلاص');
  });
});
