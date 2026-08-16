import Link from 'next/link';
import { DrillClient, type DrillConfig } from '@/components/DrillClient';
import { ROUND_OPTIONS, DEFAULT_ROUNDS } from '@/lib/drill';
import { isValidScope, scopeLabel, type Scope } from '@/lib/quran';
import type { DrillMode } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DEFAULT_SCOPE: Scope = { type: 'juz', id: 30 };

/** The home form is a plain GET form, so the round is fully described by the
 *  URL — shareable and reloadable, and it works before any JS runs. An
 *  unrecognised scope falls back to juz 30 rather than erroring: a mistyped
 *  link should still start a round. */
function parseConfig(params: Record<string, string | string[] | undefined>): DrillConfig {
  const raw = typeof params.scope === 'string' ? params.scope : '';
  const [kind, idText] = raw.split(':');
  const candidate: Scope = {
    type: kind === 'surah' ? 'surah' : 'juz',
    id: Number(idText),
  };
  const scope = isValidScope(candidate) ? candidate : DEFAULT_SCOPE;
  const rounds = Number(params.rounds);

  return {
    scopeType: scope.type,
    scopeId: scope.id,
    mode: (params.mode === 'recite' ? 'recite' : 'type') as DrillMode,
    rounds: ROUND_OPTIONS.includes(rounds as (typeof ROUND_OPTIONS)[number])
      ? rounds
      : DEFAULT_ROUNDS,
  };
}

export default async function DrillPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const config = parseConfig(params);
  const label = scopeLabel({ type: config.scopeType, id: config.scopeId });

  return (
    <div className="mx-auto flex min-h-dvh max-w-[34rem] flex-col px-5 py-8 sm:py-12">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <p className="marginal">
          {label} · {config.mode === 'type' ? 'typed' : 'recited'}
        </p>
        <Link
          href="/"
          className="shrink-0 text-sm text-muted underline underline-offset-4 hover:text-parchment"
        >
          Leave the round
        </Link>
      </div>

      <div className="my-auto w-full">
        <DrillClient config={config} />
      </div>

      <p className="mt-auto pt-10 text-sm text-muted">
        Leaving keeps everything you have answered so far. There is no penalty for
        stopping.
      </p>
    </div>
  );
}
