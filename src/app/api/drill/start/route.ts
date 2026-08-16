import { NextResponse } from 'next/server';
import { requirePlayerId } from '@/lib/player';
import { startSession, ROUND_OPTIONS, DEFAULT_ROUNDS } from '@/lib/drill';
import { isValidScope, type Scope, type ScopeType } from '@/lib/quran';
import type { DrillMode } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const mode: DrillMode = input.mode === 'recite' ? 'recite' : 'type';
  const scopeType: ScopeType = input.scopeType === 'surah' ? 'surah' : 'juz';
  const scope: Scope = { type: scopeType, id: Number(input.scopeId) };
  const rounds = ROUND_OPTIONS.includes(Number(input.rounds) as (typeof ROUND_OPTIONS)[number])
    ? Number(input.rounds)
    : DEFAULT_ROUNDS;

  if (!isValidScope(scope)) {
    return NextResponse.json(
      { error: `${scopeType} ${input.scopeId} does not exist` },
      { status: 400 }
    );
  }

  try {
    const playerId = await requirePlayerId();
    const { sessionId, prompt } = startSession({ playerId, scope, mode, rounds });
    return NextResponse.json({ sessionId, mode, prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'could not start the drill';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
