import { NextResponse } from 'next/server';
import { requirePlayerId } from '@/lib/player';
import { revealAnswer } from '@/lib/drill';

export const runtime = 'nodejs';

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

  if (!sessionId || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'sessionId and index are required' }, { status: 400 });
  }

  try {
    const playerId = await requirePlayerId();
    return NextResponse.json({ answer: revealAnswer({ sessionId, playerId, index }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'could not reveal that ayah';
    const status = message.includes('another player') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
