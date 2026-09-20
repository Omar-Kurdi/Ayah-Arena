import { gradeTyped, type Grade, type SelfGrade } from '@/lib/score';
import type { AnswerPayload } from '@/lib/drill';

/**
 * The decisions the listening panel makes, with no browser in them: what the
 * reader has agreed to, how what was heard scores, and which dots are lit.
 */

const CONSENT_KEY = 'arena.listen';

/** How often the growing recording is re-heard for the live dots. */
export const LIVE_EVERY_MS = 1500;
/** Live passes re-hear only the most recent stretch, so they stay quick on a
 *  long ayah; the final pass always hears the whole recitation. */
export const LIVE_TAIL_SECONDS = 20;
/** A generous ceiling so a forgotten microphone does not stay open. */
export const MAX_SECONDS = 150;

export function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberConsent() {
  try {
    localStorage.setItem(CONSENT_KEY, '1');
  } catch {
    // Private windows can refuse storage; the panel simply asks again next time.
  }
}

export function suggestedGrade(accuracy: number): SelfGrade {
  if (accuracy >= 0.85) return 'got_it';
  if (accuracy >= 0.5) return 'almost';
  return 'not_yet';
}

/** What the model heard, against the ayah. Timed at zero: the round's clock
 *  is kept by the round, and speed is not this panel's business. */
export const grade = (answer: AnswerPayload, heard: string) =>
  gradeTyped(
    { display: answer.uthmani, accepted: [answer.imlaei, answer.simple, answer.uthmani] },
    heard,
    0
  );

export const heardWord = (w: Grade['words'][number]) => w.status !== 'missed';

const RANK = { missed: 0, close: 1, exact: 2 } as const;

/** A live dot, once lit, stays lit: a pass that only hears the tail of the
 *  recording should not put out the words before it. */
export function keepLit(before: Grade['words'], now: Grade['words']): Grade['words'] {
  return now.map((w, i) => (before[i] && RANK[before[i].status] > RANK[w.status] ? before[i] : w));
}
