'use client';

import { useState } from 'react';
import { dict, type Locale } from '@/lib/i18n';
import { JuzGrid, SurahFinder, type JuzOption, type SurahOption } from './scope/ScopeChoices';

/**
 * Choosing what to practise, out of 30 juz and 114 surahs.
 *
 * A single list of 144 things is unusable, and the two are different kinds of
 * choice, so they get different controls -- `scope/ScopeChoices` draws them.
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

export type { JuzOption, SurahOption };

type View = 'juz' | 'surah';

export function ScopePicker({
  locale,
  juz,
  surahs,
  defaultScope,
  startLabel,
}: {
  locale: Locale;
  juz: JuzOption[];
  surahs: SurahOption[];
  defaultScope: string;
  /** The form's submit button lives here, so it can name the selection. */
  startLabel: string;
}) {
  const [view, setView] = useState<View>(defaultScope.startsWith('surah:') ? 'surah' : 'juz');
  const [scope, setScope] = useState(defaultScope);
  const [query, setQuery] = useState('');
  const [fromEnd, setFromEnd] = useState(false);

  const t = dict(locale).picker;
  const selected = describe(scope, juz, surahs, locale);

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
              view === value ? 'bg-brass text-night' : 'text-muted hover:text-parchment'
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
          <JuzGrid juz={juz} locale={locale} scope={scope} onChoose={setScope} />
        ) : (
          <SurahFinder
            surahs={surahs}
            locale={locale}
            scope={scope}
            onChoose={setScope}
            search={{ query, onQuery: setQuery, fromEnd, onFromEnd: () => setFromEnd((v) => !v) }}
          />
        )}
      </fieldset>

      {/* Stays pinned to the bottom of the screen while the grid scrolls past,
          so a reader who taps a juz halfway down never has to hunt for Start. */}
      <div className="sticky bottom-0 z-10 mt-4 border-t border-night-edge bg-night/95 py-3 backdrop-blur">
        <button
          type="submit"
          className="w-full rounded-lg bg-brass px-6 py-3.5 text-lg font-medium text-night transition-opacity hover:opacity-90"
        >
          {startLabel} · {selected.title}
        </button>
      </div>
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
