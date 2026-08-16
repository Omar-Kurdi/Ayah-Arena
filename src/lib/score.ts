import { normalizedWords, withinOneEdit } from './arabic';

/**
 * Word-level alignment scoring.
 *
 * Design constraint from the product guardrails: this function is where
 * "gentle" is actually decided, not in the copy. So:
 *  - a word within one edit of the expected word still earns most of the credit
 *    (typos and spelling variants are not mistakes worth punishing),
 *  - accuracy is reported as words recalled, never as pass/fail,
 *  - the per-word breakdown exists so the UI can show what *was* remembered
 *    rather than only what was missed.
 */

export type WordStatus = 'exact' | 'close' | 'missed';

export interface ScoredWord {
  /** The expected word, in its display (Imlaei) form. */
  word: string;
  status: WordStatus;
}

export type SelfGrade = 'got_it' | 'almost' | 'not_yet';

/**
 * The ayah being recalled, in the two forms grading needs.
 *
 * There is no local rule that makes Uthmani and keyboard spellings agree --
 * the dagger alef is written out in some words and not in others -- so instead
 * of forcing them together, every accepted spelling is graded and the reader's
 * best result is kept. Keyboard Arabic matches the Imlaei spelling; anyone
 * reciting from a mushaf matches the Uthmani one.
 *
 * What is shown back is always `display`, in mushaf orthography. Someone
 * memorizing hifz should never be handed the answer in a script their mushaf
 * does not use, however they happened to type it.
 */
export interface ExpectedAyah {
  /** Mushaf orthography. The words the reader sees after every attempt. */
  display: string;
  /** Every spelling that counts as correct. */
  accepted: string[];
}

export interface Grade {
  /** 0..1 -- share of the ayah recalled. */
  accuracy: number;
  points: number;
  words: ScoredWord[];
  exactCount: number;
  closeCount: number;
  missedCount: number;
  /** Words typed that did not line up with anything expected. */
  extraCount: number;
}

const EXACT_CREDIT = 1;
const CLOSE_CREDIT = 0.75;

// Alignment weights. A mismatch is worth less than a gap on both sides, so the
// aligner prefers to call a word "missed" rather than pair up two unrelated words.
const W_EXACT = 1;
const W_CLOSE = 0.7;
const W_MISMATCH = -0.6;
const W_GAP = -0.45;

type Move = 'diag' | 'up' | 'left';

function pairWeight(expected: string, got: string): number {
  if (expected === got) return W_EXACT;
  if (withinOneEdit(expected, got)) return W_CLOSE;
  return W_MISMATCH;
}

/**
 * Needleman-Wunsch over word sequences. Returns, for each expected word, how
 * well the attempt covered it, plus the count of unmatched attempt words.
 */
function align(
  expected: string[],
  got: string[]
): { statuses: WordStatus[]; extraCount: number } {
  const n = expected.length;
  const m = got.length;

  const score: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  const move: Move[][] = Array.from({ length: n + 1 }, () =>
    new Array<Move>(m + 1).fill('diag')
  );

  for (let i = 1; i <= n; i++) {
    score[i][0] = score[i - 1][0] + W_GAP;
    move[i][0] = 'up';
  }
  for (let j = 1; j <= m; j++) {
    score[0][j] = score[0][j - 1] + W_GAP;
    move[0][j] = 'left';
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = score[i - 1][j - 1] + pairWeight(expected[i - 1], got[j - 1]);
      const up = score[i - 1][j] + W_GAP; // expected word unmatched
      const left = score[i][j - 1] + W_GAP; // attempt word unmatched

      let best = diag;
      let bestMove: Move = 'diag';
      if (up > best) {
        best = up;
        bestMove = 'up';
      }
      if (left > best) {
        best = left;
        bestMove = 'left';
      }
      score[i][j] = best;
      move[i][j] = bestMove;
    }
  }

  const statuses = new Array<WordStatus>(n).fill('missed');
  let extraCount = 0;
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && move[i][j] === 'diag') {
      const e = expected[i - 1];
      const g = got[j - 1];
      statuses[i - 1] = e === g ? 'exact' : withinOneEdit(e, g) ? 'close' : 'missed';
      if (statuses[i - 1] === 'missed') extraCount++;
      i--;
      j--;
    } else if (i > 0 && (j === 0 || move[i][j] === 'up')) {
      statuses[i - 1] = 'missed';
      i--;
    } else {
      extraCount++;
      j--;
    }
  }

  return { statuses, extraCount };
}

/**
 * Speed is a small bonus on top of an already-solid recall, never a penalty and
 * never a reason to lose points. Slow and correct is a good outcome here.
 */
function speedBonus(accuracy: number, elapsedMs: number): number {
  if (accuracy < 0.9) return 0;
  const generous = 30_000;
  const brisk = 8_000;
  if (elapsedMs >= generous) return 0;
  const ratio = (generous - Math.max(elapsedMs, brisk)) / (generous - brisk);
  return Math.round(15 * ratio);
}

/**
 * Grades a typed attempt against every accepted spelling and keeps the best
 * accuracy, while the words shown back always come from the mushaf spelling.
 *
 * The two can disagree: a reader who types a word the mushaf spells with a
 * dagger alef is fully correct, and that word is still drawn as a near-miss.
 * Brass reads as "nearly", which is honest about a spelling difference and
 * keeps the displayed ayah the one they are actually memorizing.
 */
export function gradeTyped(
  expected: ExpectedAyah,
  attemptText: string,
  elapsedMs: number
): Grade {
  const got = normalizedWords(attemptText);
  const shown = gradeAgainst(expected.display, got, elapsedMs);

  let accuracy = shown.accuracy;
  for (const spelling of expected.accepted) {
    const candidate = gradeAgainst(spelling, got, elapsedMs);
    if (candidate.accuracy > accuracy) accuracy = candidate.accuracy;
  }

  return {
    ...shown,
    accuracy,
    points: Math.round(accuracy * 100) + speedBonus(accuracy, elapsedMs),
  };
}

/**
 * Splits an ayah into display words paired 1:1 with their normalized forms.
 *
 * Normalizing the whole string and splitting the whole string separately does
 * not line up: Uthmani text carries pause marks as their own whitespace-
 * delimited tokens, which normalization drops. That shifts every later word by
 * one and shows the reader the normalized, undiacritized form instead of the
 * mushaf spelling. Pairing them token by token keeps the two in step.
 */
function tokenize(text: string): { display: string[]; normalized: string[] } {
  const display: string[] = [];
  const normalized: string[] = [];

  for (const token of text.trim().split(/\s+/)) {
    const parts = normalizedWords(token);
    if (parts.length === 0) continue; // a pause mark or other non-letter token
    if (parts.length === 1) {
      display.push(token);
      normalized.push(parts[0]);
      continue;
    }
    // One written token covering several letter runs: fall back to the
    // normalized pieces so the pairing stays exact.
    display.push(...parts);
    normalized.push(...parts);
  }

  return { display, normalized };
}

function gradeAgainst(
  expectedText: string,
  got: string[],
  elapsedMs: number
): Grade {
  const { display: expectedDisplay, normalized: expected } = tokenize(expectedText);

  if (expected.length === 0) {
    return {
      accuracy: 0,
      points: 0,
      words: [],
      exactCount: 0,
      closeCount: 0,
      missedCount: 0,
      extraCount: 0,
    };
  }

  const { statuses, extraCount } = align(expected, got);

  let exactCount = 0;
  let closeCount = 0;
  let missedCount = 0;
  for (const s of statuses) {
    if (s === 'exact') exactCount++;
    else if (s === 'close') closeCount++;
    else missedCount++;
  }

  const credit = exactCount * EXACT_CREDIT + closeCount * CLOSE_CREDIT;
  const accuracy = Math.min(1, credit / expected.length);

  // tokenize() guarantees these two arrays are the same length and in step.
  const words: ScoredWord[] = statuses.map((status, idx) => ({
    word: expectedDisplay[idx],
    status,
  }));

  return {
    accuracy,
    points: Math.round(accuracy * 100) + speedBonus(accuracy, elapsedMs),
    words,
    exactCount,
    closeCount,
    missedCount,
    extraCount,
  };
}

/** Accuracy attached to each self-reported outcome in recite-aloud mode. */
const SELF_GRADE_ACCURACY: Record<SelfGrade, number> = {
  got_it: 1,
  almost: 0.6,
  not_yet: 0.15,
};

/**
 * Grades a recite-aloud round, where the reader reveals the ayah and reports
 * how it went.
 *
 * `words` is deliberately empty: there is no attempt text to align against, so
 * any per-word marking would be invented. The caller shows the ayah plainly.
 */
export function gradeSelfReported(selfGrade: SelfGrade, elapsedMs: number): Grade {
  const accuracy = SELF_GRADE_ACCURACY[selfGrade];

  return {
    accuracy,
    points: Math.round(accuracy * 100) + speedBonus(accuracy, elapsedMs),
    words: [],
    exactCount: 0,
    closeCount: 0,
    missedCount: 0,
    extraCount: 0,
  };
}
