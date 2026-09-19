'use client';

import { useMemo, useState } from 'react';
import { dict, num, type Locale } from '@/lib/i18n';
import { JuzTitle, SurahName } from './QuranText';

/**
 * Only what the picker draws. The full index entries carry per-juz surah spans
 * — 37 of them for juz 30 alone — plus revelation place and juz ranges that
 * nothing here renders, and all of it would otherwise cross to the client on
 * every load of a dynamic page.
 */
export interface JuzOption {
  number: number;
  pairCount: number;
  from: { surahName: string; surahNameArabic: string; ayah: number };
  to: { surahName: string; surahNameArabic: string; ayah: number };
}

export interface SurahOption {
  id: number;
  nameArabic: string;
  nameSimple: string;
  nameEnglish: string;
  versesCount: number;
  pairCount: number;
}

/**
 * Choosing what to practise, out of 30 juz and 114 surahs.
 *
 * A single list of 144 things is unusable, and the two are different kinds of
 * choice, so they get different controls: 30 is few enough to lay out as a grid
 * you scan, 114 is not, so it gets a filter. The tiles and rows are labels over
 * a real radio group, so arrow keys and screen readers work natively.
 *
 * What the form actually submits is the hidden input below, not the checked
 * radio. Only one panel is mounted at a time and the list is filtered, so a
 * chosen surah's radio leaves the DOM the moment you switch tabs or retype the
 * search — the browser would then submit no scope at all, and the reader would
 * silently get the default while the page still named their choice.
 *
 * Numerals follow the interface language. In English they are Latin, because
 * this is a control and the English interface serves readers who may not read
 * Arabic-Indic figures yet; in Arabic that reasoning inverts, and they are
 * Arabic-Indic like everything else on the page.
 */

type View = 'juz' | 'surah';

export function ScopePicker({
  locale,
  juz,
  surahs,
  defaultScope,
}: {
  locale: Locale;
  juz: JuzOption[];
  surahs: SurahOption[];
  defaultScope: string;
}) {
  const [view, setView] = useState<View>(defaultScope.startsWith('surah:') ? 'surah' : 'juz');
  const [scope, setScope] = useState(defaultScope);
  const [query, setQuery] = useState('');
  // Hifz usually runs from the end of the mushaf, so the short surahs most
  // people are working on sit at the bottom of a 1-114 grid. One tap flips it.
  const [fromEnd, setFromEnd] = useState(false);

  const filtered = useMemo(() => {
    // Arabic-Indic digits fold to Latin first: the Arabic interface numbers
    // every row ٦٧ and invites searching by number, so ٦٧ has to find it.
    const needle = query
      .trim()
      .toLowerCase()
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
    if (!needle) return surahs;

    // A bare number means "surah number", not "any name containing that digit".
    if (/^\d+$/.test(needle)) return surahs.filter((s) => String(s.id).startsWith(needle));

    const fold = (value: string) => value.toLowerCase().replace(/[^a-z؀-ۿ]/g, '');
    const folded = fold(needle);
    return surahs.filter((s) =>
      fold(`${s.nameSimple}${s.nameEnglish}${s.nameArabic}`).includes(folded)
    );
  }, [query, surahs]);
  const matches = fromEnd ? [...filtered].reverse() : filtered;

  const t = dict(locale).picker;
  const selected = describe(scope, juz, surahs, locale);
  const surahLabel = (s: SurahOption) => (locale === 'ar' ? s.nameArabic : s.nameSimple);

  return (
    <div>
      <input type="hidden" name="scope" value={scope} />

      <div className="flex gap-1 rounded-lg border border-night-edge p-1" role="group">
        {(['juz', 'surah'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            aria-pressed={view === value}
            className={`flex-1 rounded-md px-4 py-2 font-medium transition-colors ${
              view === value
                ? 'bg-brass text-night'
                : 'text-muted hover:text-parchment'
            }`}
          >
            {value === 'juz' ? t.byJuz : t.bySurah}
          </button>
        ))}
      </div>

      {/* Always visible, so a selection made in the other tab is never hidden. */}
      <p className="mt-3 text-sm">
        <span className="text-parchment">{selected.title}</span>{' '}
        <span className="text-muted">— {selected.detail}</span>
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">{dict(locale).home.whatToPractise}</legend>

        {view === 'juz' ? (
          // Wide enough tiles that the mushaf titles, sized to the longest of
          // them, stay readable: two a row on a phone, four on a desktop.
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {juz.map((entry) => {
              const value = `juz:${entry.number}`;
              return (
                <label key={entry.number} className="scope-tile">
                  <input
                    type="radio"
                    name="scope-choice"
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="sr-only"
                  />
                  <span className="tile-number">{num(entry.number, locale)}</span>
                  <JuzTitle juz={entry.number} className="tile-juz-title" />
                  {/* Where it opens, ayah included: juz 2 and 3 both begin in
                      Al-Baqarah, and the name alone cannot tell them apart. */}
                  <span className="tile-caption">
                    {locale === 'ar' ? entry.from.surahNameArabic : entry.from.surahName}{' '}
                    {num(entry.from.ayah, locale)}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div>
            <div className="flex gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.find}
                aria-label={t.find}
                className="min-w-0 flex-1 rounded-lg border border-night-edge bg-night-raised px-3 py-2.5 text-parchment placeholder:text-muted"
              />
              <button
                type="button"
                onClick={() => setFromEnd((v) => !v)}
                aria-pressed={fromEnd}
                className={`shrink-0 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  fromEnd
                    ? 'border-brass text-brass'
                    : 'border-night-edge text-muted hover:text-parchment'
                }`}
              >
                {t.fromEnd}
              </button>
            </div>

            {matches.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{t.noMatch}</p>
            ) : (
              // A grid of the same tiles as the juz view rather than a list in a
              // scroll box: six surahs a row instead of one, drawn by their
              // mushaf names so they can be found by eye, and no second
              // scrollbar nested inside the page's own.
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {matches.map((surah) => {
                  const value = `surah:${surah.id}`;
                  return (
                    <label key={surah.id} className="scope-tile">
                      <input
                        type="radio"
                        name="scope-choice"
                        value={value}
                        checked={scope === value}
                        onChange={() => setScope(value)}
                        className="sr-only"
                      />
                      <span className="tile-number">{num(surah.id, locale)}</span>
                      <SurahName
                        id={surah.id}
                        nameArabic={surah.nameArabic}
                        className="tile-surah-name"
                      />
                      <span className="tile-caption">{surahLabel(surah)}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </fieldset>
    </div>
  );
}

/** What the current selection actually commits the reader to. */
function describe(scope: string, juz: JuzOption[], surahs: SurahOption[], locale: Locale) {
  const t = dict(locale).picker;
  const [kind, idText] = scope.split(':');
  const id = Number(idText);
  const ar = locale === 'ar';

  // "can be asked" rather than a raw ayah count: the last ayah of a run is
  // never a prompt, and this is the number that decides how long a round can
  // be. It is what makes a 3-ayah surah's shortness obvious before you start.
  if (kind === 'surah') {
    const surah = surahs[id - 1];
    return {
      title: dict(locale).scope.surah(ar ? surah.nameArabic : surah.nameSimple),
      detail: t.surahDetail(surah.nameEnglish, surah.versesCount, surah.pairCount),
    };
  }

  const entry = juz[id - 1];
  const name = (end: JuzOption['from']) => (ar ? end.surahNameArabic : end.surahName);
  const span =
    entry.from.surahName === entry.to.surahName
      ? t.sameSurahSpan(name(entry.from), entry.from.ayah, entry.to.ayah)
      : t.crossSurahSpan(name(entry.from), entry.from.ayah, name(entry.to), entry.to.ayah);
  return {
    title: t.juzTitle(entry.number),
    detail: t.juzDetail(span, entry.pairCount),
  };
}
