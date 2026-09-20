'use client';

import { useMemo, type ReactNode } from 'react';
import { dict, num, type Locale } from '@/lib/i18n';
import { JuzTitle, SurahName } from '../QuranText';
import { matchSurahs, type SurahOption } from './matchSurahs';

/**
 * The two ways to choose what to practise. They are different kinds of choice,
 * so they get different controls: 30 juz are few enough to lay out as a grid
 * you scan, 114 surahs are not, so they get a filter. Both are labels over one
 * real radio group, so arrow keys and screen readers work natively.
 */

/**
 * Only what the picker draws. The full index entries carry per-juz surah spans
 * -- 37 of them for juz 30 alone -- plus revelation place and juz ranges that
 * nothing here renders, and all of it would otherwise cross to the client on
 * every load of a dynamic page.
 */
export interface JuzOption {
  number: number;
  pairCount: number;
  from: { surahName: string; surahNameArabic: string; ayah: number };
  to: { surahName: string; surahNameArabic: string; ayah: number };
}

export type { SurahOption };

/** What the reader has typed, and which end of the mushaf they are reading
 *  from. It travels together because the search box owns all of it. */
export interface Search {
  query: string;
  onQuery: (query: string) => void;
  fromEnd: boolean;
  onFromEnd: () => void;
}

/** One choice: a number, its mushaf name, and a line saying which one it is. */
function ScopeTile({
  value,
  checked,
  onChoose,
  number,
  locale,
  caption,
  children,
}: {
  value: string;
  checked: boolean;
  onChoose: (value: string) => void;
  number: number;
  locale: Locale;
  caption: string;
  /** The name, drawn in the mushaf's own lettering. */
  children: ReactNode;
}) {
  return (
    <label className="scope-tile">
      <input
        type="radio"
        name="scope-choice"
        value={value}
        checked={checked}
        onChange={() => onChoose(value)}
        className="sr-only"
      />
      <span className="tile-number">{num(number, locale)}</span>
      {children}
      <span className="tile-caption">{caption}</span>
    </label>
  );
}

/** Wide enough tiles that the mushaf titles, sized to the longest of them,
 *  stay readable: two a row on a phone, four on a desktop. */
export function JuzGrid({
  juz,
  locale,
  scope,
  onChoose,
}: {
  juz: JuzOption[];
  locale: Locale;
  scope: string;
  onChoose: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {juz.map((entry) => (
        <ScopeTile
          key={entry.number}
          value={`juz:${entry.number}`}
          checked={scope === `juz:${entry.number}`}
          onChoose={onChoose}
          number={entry.number}
          locale={locale}
          // Where it opens, ayah included: juz 2 and 3 both begin in
          // Al-Baqarah, and the name alone cannot tell them apart.
          caption={`${locale === 'ar' ? entry.from.surahNameArabic : entry.from.surahName} ${num(
            entry.from.ayah,
            locale
          )}`}
        >
          <JuzTitle juz={entry.number} className="tile-juz-title" />
        </ScopeTile>
      ))}
    </div>
  );
}

/** The search box, and the one control beside it: hifz usually runs from the
 *  end of the mushaf, so the short surahs most people are working on sit at
 *  the bottom of a 1-114 grid. One tap flips it. */
function SurahSearch({ locale, query, onQuery, fromEnd, onFromEnd }: Search & { locale: Locale }) {
  const t = dict(locale).picker;
  return (
    <div className="flex gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t.find}
        aria-label={t.find}
        className="min-w-0 flex-1 rounded-lg border border-night-edge bg-night-raised px-3 py-2.5 text-parchment placeholder:text-muted"
      />
      <button
        type="button"
        onClick={onFromEnd}
        aria-pressed={fromEnd}
        className={`shrink-0 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
          fromEnd ? 'border-brass text-brass' : 'border-night-edge text-muted hover:text-parchment'
        }`}
      >
        {t.fromEnd}
      </button>
    </div>
  );
}

/** Search, and the surahs that match: a grid of the same tiles rather than a
 *  list in a scroll box, six a row, with no second scrollbar inside the page. */
export function SurahFinder({
  surahs,
  locale,
  scope,
  onChoose,
  search,
}: {
  surahs: SurahOption[];
  locale: Locale;
  scope: string;
  onChoose: (value: string) => void;
  search: Search;
}) {
  const found = useMemo(() => matchSurahs(surahs, search.query), [surahs, search.query]);
  const matches = search.fromEnd ? [...found].reverse() : found;

  return (
    <div>
      <SurahSearch locale={locale} {...search} />

      {matches.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{dict(locale).picker.noMatch}</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {matches.map((surah) => (
            <ScopeTile
              key={surah.id}
              value={`surah:${surah.id}`}
              checked={scope === `surah:${surah.id}`}
              onChoose={onChoose}
              number={surah.id}
              locale={locale}
              caption={locale === 'ar' ? surah.nameArabic : surah.nameSimple}
            >
              <SurahName id={surah.id} nameArabic={surah.nameArabic} className="tile-surah-name" />
            </ScopeTile>
          ))}
        </div>
      )}
    </div>
  );
}
