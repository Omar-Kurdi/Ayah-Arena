import { describe, expect, it } from 'vitest';
import { matchSurahs, type SurahOption } from './matchSurahs';

// Finding a surah by name or by number, in either language. The picker's one
// decision that is not markup.

const surah = (id: number, nameSimple: string, nameEnglish: string, nameArabic: string): SurahOption => ({
  id,
  nameSimple,
  nameEnglish,
  nameArabic,
  versesCount: 10,
  pairCount: 9,
});

const surahs = [
  surah(1, 'Al-Fatihah', 'The Opener', 'الفاتحة'),
  surah(2, 'Al-Baqarah', 'The Cow', 'البقرة'),
  surah(20, 'Taha', 'Ta-Ha', 'طه'),
  surah(112, 'Al-Ikhlas', 'Sincerity', 'الإخلاص'),
];

const ids = (found: SurahOption[]) => found.map((s) => s.id);

describe('matchSurahs', () => {
  it('offers every surah until something is typed', () => {
    expect(ids(matchSurahs(surahs, ''))).toEqual([1, 2, 20, 112]);
    expect(ids(matchSurahs(surahs, '   '))).toEqual([1, 2, 20, 112]);
  });

  it('reads a bare number as the surah number', () => {
    // Not "any name containing that digit": searching 2 should offer
    // Al-Baqarah and the surahs numbered 2x, not a dozen others.
    expect(ids(matchSurahs(surahs, '2'))).toEqual([2, 20]);
    expect(ids(matchSurahs(surahs, '112'))).toEqual([112]);
  });

  it('reads Arabic-Indic digits as numbers too', () => {
    // The Arabic interface numbers every tile ١١٢, so ١١٢ has to find it.
    expect(ids(matchSurahs(surahs, '١١٢'))).toEqual([112]);
    expect(ids(matchSurahs(surahs, '٢'))).toEqual([2, 20]);
  });

  it('finds a surah by any of its three names', () => {
    expect(ids(matchSurahs(surahs, 'baqarah'))).toEqual([2]);
    expect(ids(matchSurahs(surahs, 'the cow'))).toEqual([2]);
    expect(ids(matchSurahs(surahs, 'البقرة'))).toEqual([2]);
  });

  it('ignores case, spacing and hyphens', () => {
    for (const query of ['AL-BAQARAH', 'al baqarah', 'albaqarah', ' Al-Baqarah ']) {
      expect(ids(matchSurahs(surahs, query)), query).toEqual([2]);
    }
  });

  it('offers nothing rather than everything when nothing matches', () => {
    expect(matchSurahs(surahs, 'zzz')).toEqual([]);
    expect(matchSurahs(surahs, '999')).toEqual([]);
  });
});
