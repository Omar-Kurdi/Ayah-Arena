import Link from 'next/link';
import {
  juzEntries,
  surahEntries,
  surahMeta,
  sourceMeta,
  verseByKey,
  loadIndex,
} from '@/lib/quran';
import { ROUND_OPTIONS, DEFAULT_ROUNDS } from '@/lib/drill';
import { readPlayerId } from '@/lib/player';
import { playerStats } from '@/lib/store';
import { MushafPage, AyahLine, PendingMarker } from '@/components/MushafPage';
import { ScopePicker } from '@/components/ScopePicker';
import { SiteFooter } from '@/components/SiteFooter';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const index = loadIndex();
  const source = sourceMeta();

  // The hero is the mechanic itself, set in real text: the opening of An-Naba
  // with the line where ayah 2 belongs standing empty.
  const hero = verseByKey('78:1');
  const heroSurah = surahMeta(78);

  const playerId = await readPlayerId();
  const stats = playerId ? playerStats(playerId) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="marginal">Ayah Arena</p>
        <h1 className="mt-3 text-[clamp(2rem,5.5vw,2.75rem)]">
          Someone recites.
          <br />
          <em className="text-brass">You continue.</em>
        </h1>
        <p className="mt-4 max-w-lg text-muted">
          One ayah appears. Give the next one — typed, or recited out loud. All{' '}
          {index.verseCount.toLocaleString()} ayat are loaded, so any juz or any surah
          is a round.
        </p>
      </header>

      <div className="mt-9">
        <MushafPage
          surahNameArabic={heroSurah.nameArabic}
          locative={`${heroSurah.nameSimple} · ayah 1`}
        >
          <AyahLine text={hero.uthmani} marker={1} />
          <div className="mt-4 flex items-start gap-2" dir="rtl">
            <div className="writing-line grow" aria-hidden="true" />
            <PendingMarker marker={2} />
          </div>
        </MushafPage>
        <p className="mt-3 text-sm text-muted">
          Ayah 2 goes on the empty line. That is the whole game.
        </p>
      </div>

      <form action="/drill" method="get" className="mt-11">
        <h2 className="text-2xl">Set up a round</h2>

        <div className="mt-5">
          <p className="font-medium">What to practise</p>
          <div className="mt-2">
            {/* Projected down to what the picker draws — the index entries
                also carry per-juz surah spans that nothing here renders. */}
            <ScopePicker
              juz={index.juz.map((j) => ({
                number: j.number,
                pairCount: j.pairCount,
                from: { surahName: j.from.surahName, ayah: j.from.ayah },
                to: { surahName: j.to.surahName, ayah: j.to.ayah },
              }))}
              surahs={index.surahs.map((s) => ({
                id: s.id,
                nameArabic: s.nameArabic,
                nameSimple: s.nameSimple,
                nameEnglish: s.nameEnglish,
                versesCount: s.versesCount,
                pairCount: s.pairCount,
              }))}
              defaultScope="juz:30"
            />
          </div>
        </div>

        <div className="mt-6 max-w-xs">
          <label htmlFor="rounds" className="block font-medium">
            How many ayat
          </label>
          <select
            id="rounds"
            name="rounds"
            defaultValue={String(DEFAULT_ROUNDS)}
            className="mt-1.5 w-full rounded-lg border border-night-edge bg-night-raised px-3 py-2.5 text-parchment"
          >
            {ROUND_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count} ayat
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-sm text-muted">
            Short surahs hold fewer — you will get as many as your choice has.
          </p>
        </div>

        <fieldset className="mt-6">
          <legend className="font-medium">How you answer</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer gap-3 rounded-lg border border-night-edge px-4 py-3 transition-colors has-checked:border-brass">
              <input
                type="radio"
                name="mode"
                value="type"
                defaultChecked
                className="mt-1.5 accent-[var(--color-brass)]"
              />
              <span>
                <span className="block font-medium">Type it</span>
                <span className="block text-sm text-muted">
                  Needs an Arabic keyboard. Graded word by word.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-night-edge px-4 py-3 transition-colors has-checked:border-brass">
              <input
                type="radio"
                name="mode"
                value="recite"
                className="mt-1.5 accent-[var(--color-brass)]"
              />
              <span>
                <span className="block font-medium">Recite it</span>
                <span className="block text-sm text-muted">
                  Say it out loud, reveal, and mark how it went.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          className="mt-7 w-full rounded-lg bg-brass px-6 py-3.5 text-lg font-medium text-night transition-opacity hover:opacity-90 sm:w-auto"
        >
          Start a round
        </button>
      </form>

      {stats && stats.ayahsPracticed > 0 && (
        <section className="mt-12 border-t border-night-edge pt-6">
          <h2 className="text-2xl">Where you are</h2>
          <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
            <div>
              <dt className="marginal">ayat practised</dt>
              <dd className="tabular font-display text-3xl">{stats.ayahsPracticed}</dd>
            </div>
            <div>
              <dt className="marginal">rounds finished</dt>
              <dd className="tabular font-display text-3xl">{stats.sessionsCompleted}</dd>
            </div>
            <div>
              <dt className="marginal">average recall</dt>
              <dd className="tabular font-display text-3xl text-brass">
                {Math.round(stats.averageAccuracy * 100)}%
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">
            Totals only — no streaks to break, and nothing here resets if you take a
            week off.{' '}
            <Link
              href="/drill?scope=juz:30&mode=type&rounds=7"
              className="text-brass underline underline-offset-4"
            >
              Pick up where you like
            </Link>
            .
          </p>
        </section>
      )}

      <SiteFooter source={source} />
    </div>
  );
}
