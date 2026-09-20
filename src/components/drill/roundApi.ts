import type { AnswerPayload, PromptPayload, RoundResult } from '@/lib/drill';
import type { SelfGrade } from '@/lib/score';
import type { DrillConfig } from './useDrillSession';

/**
 * The three round endpoints.
 *
 * Each one answers JSON and reports a problem the same way, so that shape is
 * handled once here: the server's own message if it sent one, and otherwise
 * the wording the caller passes in, which is already in the reader's language.
 */

/** Every endpoint here is a POST of JSON, and the URLs stay written out: a
 *  `fetch` whose target is a variable is worth flagging, even in a browser. */
const sending = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data as T;
}

export const startRound = async (config: DrillConfig, fallback: string) =>
  unwrap<{ sessionId: string; prompt: PromptPayload }>(
    await fetch('/api/drill/start', sending(config)),
    fallback
  );

export const answerRound = async (
  attempt: {
    sessionId: string;
    index: number;
    text: string;
    selfGrade?: SelfGrade;
    skipped: boolean;
    elapsedMs: number;
  },
  fallback: string
) => unwrap<RoundResult>(await fetch('/api/drill/answer', sending(attempt)), fallback);

/** The ayah on its own, ungraded. The server allows this in recite mode only. */
export const revealRound = async (
  round: { sessionId: string | null; index?: number },
  fallback: string
) => {
  const data = await unwrap<{ answer: AnswerPayload }>(
    await fetch('/api/drill/reveal', sending(round)),
    fallback
  );
  return data.answer;
};
