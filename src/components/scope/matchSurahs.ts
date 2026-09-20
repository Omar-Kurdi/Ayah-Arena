export interface SurahOption {
  id: number;
  nameArabic: string;
  nameSimple: string;
  nameEnglish: string;
  versesCount: number;
  pairCount: number;
}

/**
 * Finding a surah among 114, by whatever the reader has in mind.
 *
 * Arabic-Indic digits fold to Latin first: the Arabic interface numbers every
 * tile ٦٧ and invites searching by number, so ٦٧ has to find it. A bare number
 * means "surah number", not "any name containing that digit" -- otherwise
 * searching 2 offers a dozen surahs before Al-Baqarah. Everything else is
 * matched against all three names with the punctuation and spacing dropped,
 * so "al-baqarah", "albaqara" and "Baqarah" all land in the same place.
 */
export function matchSurahs(surahs: SurahOption[], query: string): SurahOption[] {
  const needle = query
    .trim()
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (!needle) return surahs;

  if (/^\d+$/.test(needle)) return surahs.filter((s) => String(s.id).startsWith(needle));

  const fold = (value: string) => value.toLowerCase().replace(/[^a-z؀-ۿ]/g, '');
  const folded = fold(needle);
  return surahs.filter((s) =>
    fold(`${s.nameSimple}${s.nameEnglish}${s.nameArabic}`).includes(folded)
  );
}
