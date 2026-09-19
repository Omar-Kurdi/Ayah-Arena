import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sessionSummary } from '@/lib/drill';
import { readPlayerId } from '@/lib/player';
import { getLocale } from '@/lib/locale';
import { dict, num, percent, type Locale } from '@/lib/i18n';
import { getSession } from '@/lib/store';
import { Rosette } from '@/components/Rosette';
import { SiteFooter } from '@/components/SiteFooter';

export const dynamic = 'force-dynamic';

function closing(accuracy: number, scored: number, locale: Locale): string {
  const t = dict(locale).results.closing;
  if (scored === 0) return t.none;
  if (accuracy >= 0.95) return t.solid;
  if (accuracy >= 0.75) return t.holding;
  if (accuracy >= 0.4) return t.coming;
  return t.early;
}

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = getSession(sessionId);
  const playerId = await readPlayerId();

  // Results are private to the player who drilled them. Sharing arrives with
  // result cards, as an export the reader chooses to make.
  if (!session || !playerId || session.playerId !== playerId) notFound();

  const locale = await getLocale();
  const d = dict(locale);
  const t = d.results;
  const summary = sessionSummary(sessionId, locale);
  if (!summary) notFound();
  const itemName = (item: { surahName: string; surahNameArabic: string }) =>
    locale === 'ar' ? item.surahNameArabic : item.surahName;

  const minutes = Math.floor(summary.totalMs / 60000);
  const seconds = Math.round((summary.totalMs % 60000) / 1000);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="marginal">
          {d.brand} · {summary.scopeLabel}
        </p>
        <h1 className="mt-3 text-[clamp(2rem,5.5vw,2.75rem)]">
          {closing(summary.averageAccuracy, summary.scored, locale)}
        </h1>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-1.5">
        {Array.from({ length: summary.totalRounds }, (_, i) => (
          <Rosette
            key={i}
            label={i + 1}
            state={i < summary.answered ? 'done' : 'upcoming'}
            size={32}
            numerals={locale === 'ar' ? 'arabic' : 'latin'}
          />
        ))}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div>
          <dt className="marginal">{t.points}</dt>
          <dd className="tabular font-display text-3xl text-brass">{num(summary.points, locale)}</dd>
        </div>
        <div>
          <dt className="marginal">{t.averageRecall}</dt>
          <dd className="tabular font-display text-3xl">
            {summary.scored > 0 ? percent(summary.averageAccuracy, locale) : '—'}
          </dd>
        </div>
        <div>
          <dt className="marginal">{t.ayat}</dt>
          <dd className="tabular font-display text-3xl">
            {num(summary.answered, locale)}
            <span className="text-muted">/{num(summary.totalRounds, locale)}</span>
          </dd>
        </div>
        <div>
          <dt className="marginal">{t.time}</dt>
          <dd className="tabular font-display text-3xl">{t.duration(minutes, seconds)}</dd>
        </div>
      </dl>

      {summary.strongest.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl">{t.heldFirm}</h2>
          <ul className="mt-3 space-y-1.5">
            {summary.strongest.map((item) => (
              <li key={item.verseKey} className="flex items-baseline justify-between gap-4">
                <span>{t.item(itemName(item), item.ayahNumber)}</span>
                <span className="tabular text-sm text-verdant">
                  {percent(item.accuracy, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.revisit.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl">{t.worthAnotherLook}</h2>
          <ul className="mt-3 space-y-1.5">
            {summary.revisit.map((item) => (
              <li key={item.verseKey} className="flex items-baseline justify-between gap-4">
                <span>{t.item(itemName(item), item.ayahNumber)}</span>
                <span className="tabular text-sm text-muted">
                  {item.skipped ? t.shown : percent(item.accuracy, locale)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">{t.revisitNote}</p>
        </section>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={`/drill?scope=${session.scopeType}:${session.scopeId}&mode=${session.mode}&rounds=${session.totalRounds}`}
          className="rounded-lg bg-brass px-5 py-2.5 font-medium text-night transition-opacity hover:opacity-90"
        >
          {t.another}
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-night-edge px-5 py-2.5 transition-colors hover:border-brass"
        >
          {t.change}
        </Link>
      </div>

      <SiteFooter locale={locale} path={`/results/${sessionId}`} />
    </div>
  );
}
