import { NextResponse } from 'next/server';
import { requirePlayerId } from '@/lib/player';
import { submitAttempt } from '@/lib/drill';
import type { SelfGrade } from '@/lib/score';

export const runtime = 'nodejs';

const SELF_GRADES: SelfGrade[] = ['got_it', 'almost', 'not_yet'];

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId : '';
  const index = Number(input.index);
  const elapsedMs = Number(input.elapsedMs);

  if (!sessionId || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'sessionId and index are required' }, { status: 400 });
  }

  const selfGrade = SELF_GRADES.includes(input.selfGrade as SelfGrade)
    ? (input.selfGrade as SelfGrade)
    : undefined;

  try {
    const playerId = await requirePlayerId();
    const result = submitAttempt({
      sessionId,
      playerId,
      index,
      text: typeof input.text === 'string' ? input.text : '',
      selfGrade,
      skipped: input.skipped === true,
      elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : 0,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'could not grade that attempt';
    const status = message.includes('another player') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
