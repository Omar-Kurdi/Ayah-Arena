import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sessionSummary } from '@/lib/drill';
import { sourceMeta } from '@/lib/quran';
import { readPlayerId } from '@/lib/player';
import { getSession } from '@/lib/store';
import { Rosette } from '@/components/Rosette';
import { SiteFooter } from '@/components/SiteFooter';

export const dynamic = 'force-dynamic';

function closing(accuracy: number, scored: number): string {
  if (scored === 0) return 'A set read through. Nothing scored, nothing lost.';
  if (accuracy >= 0.95) return 'That set is solid.';
  if (accuracy >= 0.75) return 'Most of that set is holding.';
  if (accuracy >= 0.4) return 'It is coming together.';
  return 'Early days with this set — that is exactly what practice is for.';
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

  const summary = sessionSummary(sessionId);
  if (!summary) notFound();

  const minutes = Math.floor(summary.totalMs / 60000);
  const seconds = Math.round((summary.totalMs % 60000) / 1000);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="marginal">Ayah Arena · {summary.scopeLabel}</p>
        <h1 className="mt-3 text-[clamp(2rem,5.5vw,2.75rem)]">
          {closing(summary.averageAccuracy, summary.scored)}
        </h1>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-1.5">
        {Array.from({ length: summary.totalRounds }, (_, i) => (
          <Rosette
            key={i}
            label={i + 1}
            state={i < summary.answered ? 'done' : 'upcoming'}
            size={32}
          />
        ))}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div>
          <dt className="marginal">points</dt>
          <dd className="tabular font-display text-3xl text-brass">{summary.points}</dd>
        </div>
        <div>
          <dt className="marginal">average recall</dt>
          <dd className="tabular font-display text-3xl">
            {summary.scored > 0 ? `${Math.round(summary.averageAccuracy * 100)}%` : '—'}
          </dd>
        </div>
        <div>
          <dt className="marginal">ayat</dt>
          <dd className="tabular font-display text-3xl">
            {summary.answered}
            <span className="text-muted">/{summary.totalRounds}</span>
          </dd>
        </div>
        <div>
          <dt className="marginal">time</dt>
          <dd className="tabular font-display text-3xl">
            {minutes > 0 ? `${minutes}m ` : ''}
            {seconds}s
          </dd>
        </div>
      </dl>

      {summary.strongest.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl">Held firm</h2>
          <ul className="mt-3 space-y-1.5">
            {summary.strongest.map((item) => (
              <li key={item.verseKey} className="flex items-baseline justify-between gap-4">
                <span>
                  {item.surahName} · ayah {item.ayahNumber}
                </span>
                <span className="tabular text-sm text-verdant">
                  {Math.round(item.accuracy * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.revisit.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl">Worth another look</h2>
          <ul className="mt-3 space-y-1.5">
            {summary.revisit.map((item) => (
              <li key={item.verseKey} className="flex items-baseline justify-between gap-4">
                <span>
                  {item.surahName} · ayah {item.ayahNumber}
                </span>
                <span className="tabular text-sm text-muted">
                  {item.skipped ? 'shown' : `${Math.round(item.accuracy * 100)}%`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            These are the ones that took longest to surface, plus any you asked to
            be shown. Once revision mode lands they will come back around on their
            own.
          </p>
        </section>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={`/drill?scope=${session.scopeType}:${session.scopeId}&mode=${session.mode}&rounds=${session.totalRounds}`}
          className="rounded-lg bg-brass px-5 py-2.5 font-medium text-night transition-opacity hover:opacity-90"
        >
          Another round
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-night-edge px-5 py-2.5 transition-colors hover:border-brass"
        >
          Change the setup
        </Link>
      </div>

      <SiteFooter source={sourceMeta()} />
    </div>
  );
}
