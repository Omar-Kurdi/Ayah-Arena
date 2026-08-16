'use client';

import { useMemo, useState } from 'react';

/**
 * Only what the picker draws. The full index entries carry per-juz surah spans
 * — 37 of them for juz 30 alone — plus revelation place and juz ranges that
 * nothing here renders, and all of it would otherwise cross to the client on
 * every load of a dynamic page.
 */
export interface JuzOption {
  number: number;
  pairCount: number;
  from: { surahName: string; ayah: number };
  to: { surahName: string; ayah: number };
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
 * Numerals here are Latin rather than the Arabic-Indic figures used for ayah
 * markers. The mushaf page is where those belong; this is a control, and the
 * app is for readers who do not necessarily read Arabic numerals yet.
 */

type View = 'juz' | 'surah';

export function ScopePicker({
  juz,
  surahs,
  defaultScope,
}: {
  juz: JuzOption[];
  surahs: SurahOption[];
  defaultScope: string;
}) {
  const [view, setView] = useState<View>(defaultScope.startsWith('surah:') ? 'surah' : 'juz');
  const [scope, setScope] = useState(defaultScope);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return surahs;

    // A bare number means "surah number", not "any name containing that digit".
    if (/^\d+$/.test(needle)) return surahs.filter((s) => String(s.id).startsWith(needle));

    const fold = (value: string) => value.toLowerCase().replace(/[^a-z؀-ۿ]/g, '');
    const folded = fold(needle);
    return surahs.filter((s) =>
      fold(`${s.nameSimple}${s.nameEnglish}${s.nameArabic}`).includes(folded)
    );
  }, [query, surahs]);

  const selected = describe(scope, juz, surahs);

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
            {value === 'juz' ? 'By juz' : 'By surah'}
          </button>
        ))}
      </div>

      {/* Always visible, so a selection made in the other tab is never hidden. */}
      <p className="mt-3 text-sm">
        <span className="text-parchment">{selected.title}</span>{' '}
        <span className="text-muted">— {selected.detail}</span>
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">What to practise</legend>

        {view === 'juz' ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
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
                  <span className="font-display text-2xl leading-none">{entry.number}</span>
                  {/* Where it opens, ayah included: juz 2 and 3 both begin in
                      Al-Baqarah, and the name alone cannot tell them apart. */}
                  <span className="mt-1 block truncate text-[0.7rem] text-muted">
                    {entry.from.surahName} {entry.from.ayah}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a surah by name or number"
              aria-label="Find a surah by name or number"
              className="w-full rounded-lg border border-night-edge bg-night-raised px-3 py-2.5 text-parchment placeholder:text-muted"
            />

            {matches.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                No surah goes by that name. Try part of it, or its number.
              </p>
            ) : (
              <ul className="mt-2 max-h-[22rem] overflow-y-auto rounded-lg border border-night-edge">
                {matches.map((surah) => {
                  const value = `surah:${surah.id}`;
                  return (
                    <li key={surah.id}>
                      <label className="scope-row">
                        <input
                          type="radio"
                          name="scope-choice"
                          value={value}
                          checked={scope === value}
                          onChange={() => setScope(value)}
                          className="sr-only"
                        />
                        <span className="tabular w-8 shrink-0 text-sm text-muted">{surah.id}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{surah.nameSimple}</span>
                          <span className="block truncate text-sm text-muted">
                            {surah.nameEnglish} · {surah.versesCount} ayat
                          </span>
                        </span>
                        <span className="font-arabic shrink-0 text-xl text-brass" lang="ar">
                          {surah.nameArabic}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </fieldset>
    </div>
  );
}

/** What the current selection actually commits the reader to. */
function describe(scope: string, juz: JuzOption[], surahs: SurahOption[]) {
  const [kind, idText] = scope.split(':');
  const id = Number(idText);

  // "can be asked" rather than a raw ayah count: the last ayah of a run is
  // never a prompt, and this is the number that decides how long a round can
  // be. It is what makes a 3-ayah surah's shortness obvious before you start.
  if (kind === 'surah') {
    const surah = surahs[id - 1];
    return {
      title: surah.nameSimple,
      detail: `${surah.nameEnglish} · ${surah.versesCount} ayat, ${surah.pairCount} can be asked`,
    };
  }

  const entry = juz[id - 1];
  const span =
    entry.from.surahName === entry.to.surahName
      ? `${entry.from.surahName} ${entry.from.ayah}–${entry.to.ayah}`
      : `${entry.from.surahName} ${entry.from.ayah} to ${entry.to.surahName} ${entry.to.ayah}`;
  return {
    title: `Juz ${entry.number}`,
    detail: `${span} · ${entry.pairCount} ayat can be asked`,
  };
}
