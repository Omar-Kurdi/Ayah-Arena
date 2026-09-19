import Link from 'next/link';
import { surahMeta, verseByKey, loadIndex } from '@/lib/quran';
import { ROUND_OPTIONS, DEFAULT_ROUNDS } from '@/lib/drill';
import { readPlayerId } from '@/lib/player';
import { playerStats } from '@/lib/store';
import { getLocale } from '@/lib/locale';
import { dict, num, percent } from '@/lib/i18n';
import { MushafPage, AyahLine, PendingMarker } from '@/components/MushafPage';
import { ScopePicker } from '@/components/ScopePicker';
import { SiteFooter } from '@/components/SiteFooter';
import { LanguageSwitch } from '@/components/LanguageSwitch';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const locale = await getLocale();
  const d = dict(locale);
  const t = d.home;
  const index = loadIndex();

  // The hero is the mechanic itself, set in real text: the opening of An-Naba
  // with the line where ayah 2 belongs standing empty.
  const hero = verseByKey('78:1');
  const heroSurah = surahMeta(78);

  const playerId = await readPlayerId();
  const stats = playerId ? playerStats(playerId) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <div className="flex items-baseline justify-between gap-4">
          <p className="marginal">{d.brand}</p>
          <span className="text-sm">
            <LanguageSwitch locale={locale} path="/" />
          </span>
        </div>
        <h1 className="mt-3 text-[clamp(2rem,5.5vw,2.75rem)]">
          {t.headline}
          <br />
          <em className="text-brass">{t.headlineTurn}</em>
        </h1>
        <p className="mt-4 max-w-lg text-muted">{t.intro(index.verseCount)}</p>
      </header>

      <div className="mt-9">
        <MushafPage
          surahId={heroSurah.id}
          surahNameArabic={heroSurah.nameArabic}
          locative={d.locative(locale === 'ar' ? heroSurah.nameArabic : heroSurah.nameSimple, 1)}
        >
          <AyahLine glyphs={hero.glyphs} text={hero.uthmani} marker={1} />
          <div className="mt-4 flex items-start gap-2" dir="rtl">
            <div className="writing-line grow" aria-hidden="true" />
            <PendingMarker marker={2} />
          </div>
        </MushafPage>
        <p className="mt-3 text-sm text-muted">{t.heroCaption}</p>
      </div>

      <form action="/drill" method="get" className="mt-11">
        <h2 className="text-2xl">{t.setUp}</h2>

        <div className="mt-5">
          <p className="font-medium">{t.whatToPractise}</p>
          <div className="mt-2">
            {/* Projected down to what the picker draws — the index entries
                also carry per-juz surah spans that nothing here renders. */}
            <ScopePicker
              locale={locale}
              juz={index.juz.map((j) => ({
                number: j.number,
                pairCount: j.pairCount,
                from: {
                  surahName: j.from.surahName,
                  surahNameArabic: index.surahs[j.from.surahId - 1].nameArabic,
                  ayah: j.from.ayah,
                },
                to: {
                  surahName: j.to.surahName,
                  surahNameArabic: index.surahs[j.to.surahId - 1].nameArabic,
                  ayah: j.to.ayah,
                },
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
            {t.howMany}
          </label>
          <select
            id="rounds"
            name="rounds"
            defaultValue={String(DEFAULT_ROUNDS)}
            className="mt-1.5 w-full rounded-lg border border-night-edge bg-night-raised px-3 py-2.5 text-parchment"
          >
            {ROUND_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {t.roundOption(count)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-sm text-muted">{t.howManyHint}</p>
        </div>

        <fieldset className="mt-6">
          <legend className="font-medium">{t.howYouAnswer}</legend>
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
                <span className="block font-medium">{t.typeIt}</span>
                <span className="block text-sm text-muted">{t.typeItHint}</span>
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
                <span className="block font-medium">{t.reciteIt}</span>
                <span className="block text-sm text-muted">{t.reciteItHint}</span>
              </span>
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          className="mt-7 w-full rounded-lg bg-brass px-6 py-3.5 text-lg font-medium text-night transition-opacity hover:opacity-90 sm:w-auto"
        >
          {t.start}
        </button>
      </form>

      {stats && stats.ayahsPracticed > 0 && (
        <section className="mt-12 border-t border-night-edge pt-6">
          <h2 className="text-2xl">{t.whereYouAre}</h2>
          <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
            <div>
              <dt className="marginal">{t.ayatPractised}</dt>
              <dd className="tabular font-display text-3xl">{num(stats.ayahsPracticed, locale)}</dd>
            </div>
            <div>
              <dt className="marginal">{t.roundsFinished}</dt>
              <dd className="tabular font-display text-3xl">
                {num(stats.sessionsCompleted, locale)}
              </dd>
            </div>
            <div>
              <dt className="marginal">{t.averageRecall}</dt>
              <dd className="tabular font-display text-3xl text-brass">
                {percent(stats.averageAccuracy, locale)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">
            {t.totalsOnly}{' '}
            <Link
              href="/drill?scope=juz:30&mode=type&rounds=7"
              className="text-brass underline underline-offset-4"
            >
              {t.pickUp}
            </Link>
            .
          </p>
        </section>
      )}

      <SiteFooter locale={locale} path="/" />
    </div>
  );
}
