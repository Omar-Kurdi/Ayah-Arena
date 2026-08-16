import {
  buildPairs,
  verseByKey,
  surahMeta,
  pickRandom,
  expectedAyah,
  scopeLabel,
  type Scope,
} from './quran';
import { gradeTyped, gradeSelfReported, type Grade, type SelfGrade } from './score';
import {
  createSession,
  getSession,
  getSessionItems,
  recordAttempt,
  getAttempts,
  completeSession,
  type DrillMode,
} from './store';

/**
 * Round orchestration: which ayah comes next, what the client is allowed to
 * see, and what a finished session adds up to.
 *
 * The answer text never reaches the client before the attempt is submitted.
 * The Quran is not secret, but keeping the round server-authoritative is what
 * makes duels fair later without reworking this layer.
 */

export const ROUND_OPTIONS = [5, 7, 10] as const;
export const DEFAULT_ROUNDS = 7;

export interface PromptPayload {
  index: number;
  total: number;
  surahName: string;
  surahNameArabic: string;
  surahNumber: number;
  ayahNumber: number;
  verseKey: string;
  uthmani: string;
  /** Ayah number the reader is being asked to recall. */
  answerAyahNumber: number;
}

export interface AnswerPayload {
  verseKey: string;
  ayahNumber: number;
  uthmani: string;
  imlaei: string;
}

export interface RoundResult {
  grade: Grade;
  answer: AnswerPayload;
  next: PromptPayload | null;
  runningPoints: number;
}

export interface StartInput {
  playerId: string;
  scope: Scope;
  mode: DrillMode;
  rounds: number;
}

function promptFor(sessionId: string, index: number): PromptPayload | null {
  const items = getSessionItems(sessionId);
  const item = items[index];
  if (!item) return null;

  const prompt = verseByKey(item.promptKey);
  const answer = verseByKey(item.answerKey);
  const surah = surahMeta(prompt.surah);

  return {
    index,
    total: items.length,
    surahName: surah.nameSimple,
    surahNameArabic: surah.nameArabic,
    surahNumber: prompt.surah,
    ayahNumber: prompt.ayah,
    verseKey: prompt.key,
    uthmani: prompt.uthmani,
    answerAyahNumber: answer.ayah,
  };
}

export function startSession(input: StartInput): {
  sessionId: string;
  prompt: PromptPayload;
} {
  const pool = buildPairs(input.scope);

  if (pool.length === 0) {
    throw new Error('no ayah pairs available for that selection');
  }

  const picked = pickRandom(pool, input.rounds);
  const sessionId = createSession({
    playerId: input.playerId,
    // A surah scope has no single juz -- 19 surahs straddle a boundary -- so
    // scope_type/scope_id is the whole key and this column stays vestigial.
    juz: input.scope.type === 'juz' ? input.scope.id : 0,
    scopeType: input.scope.type,
    scopeId: input.scope.id,
    mode: input.mode,
    items: picked.map((p) => ({ promptKey: p.prompt.key, answerKey: p.answer.key })),
  });

  const prompt = promptFor(sessionId, 0);
  if (!prompt) throw new Error('failed to build the first round');

  return { sessionId, prompt };
}

/**
 * Hands back the ayah without grading, so a reader in recite-aloud mode can
 * see what they were reciting before reporting how it went. Restricted to that
 * mode: in typed mode the answer must not be readable before the attempt, or
 * duels stop meaning anything.
 */
export function revealAnswer(input: {
  sessionId: string;
  playerId: string;
  index: number;
}): AnswerPayload {
  const session = getSession(input.sessionId);
  if (!session) throw new Error('session not found');
  if (session.playerId !== input.playerId) throw new Error('session belongs to another player');
  if (session.mode !== 'recite') throw new Error('this round is not a recite-aloud round');

  const item = getSessionItems(input.sessionId)[input.index];
  if (!item) throw new Error('round not found');

  const answer = verseByKey(item.answerKey);
  return {
    verseKey: answer.key,
    ayahNumber: answer.ayah,
    uthmani: answer.uthmani,
    imlaei: answer.imlaei,
  };
}

export function submitAttempt(input: {
  sessionId: string;
  playerId: string;
  index: number;
  text?: string;
  selfGrade?: SelfGrade;
  skipped?: boolean;
  elapsedMs: number;
}): RoundResult {
  const session = getSession(input.sessionId);
  if (!session) throw new Error('session not found');
  if (session.playerId !== input.playerId) throw new Error('session belongs to another player');

  const items = getSessionItems(input.sessionId);
  const item = items[input.index];
  if (!item) throw new Error('round not found');

  const answer = verseByKey(item.answerKey);
  const elapsedMs = Math.max(0, Math.min(input.elapsedMs, 10 * 60 * 1000));

  const skipped = input.skipped === true && session.mode === 'type';

  const grade =
    session.mode === 'recite'
      ? gradeSelfReported(input.selfGrade ?? 'not_yet', elapsedMs)
      : gradeTyped(expectedAyah(answer), skipped ? '' : (input.text ?? ''), elapsedMs);

  recordAttempt({
    sessionId: input.sessionId,
    idx: input.index,
    playerId: input.playerId,
    answerKey: answer.key,
    mode: session.mode,
    rawInput: session.mode === 'type' && !skipped ? (input.text ?? '') : null,
    selfGrade: session.mode === 'recite' ? (input.selfGrade ?? 'not_yet') : null,
    skipped,
    accuracy: grade.accuracy,
    points: grade.points,
    elapsedMs,
  });

  const next = promptFor(input.sessionId, input.index + 1);
  if (!next) completeSession(input.sessionId);

  const runningPoints = getAttempts(input.sessionId).reduce((sum, a) => sum + a.points, 0);

  return {
    grade,
    answer: {
      verseKey: answer.key,
      ayahNumber: answer.ayah,
      uthmani: answer.uthmani,
      imlaei: answer.imlaei,
    },
    next,
    runningPoints,
  };
}

export interface SummaryAyah {
  verseKey: string;
  surahName: string;
  ayahNumber: number;
  accuracy: number;
  /** Shown rather than attempted, so it carries no score. */
  skipped: boolean;
}

export interface SessionSummary {
  sessionId: string;
  mode: DrillMode;
  scopeLabel: string;
  totalRounds: number;
  answered: number;
  /** Rounds that were actually attempted. Skips are excluded, so a set of
   *  shown ayat never reads as 0% recall. */
  scored: number;
  points: number;
  averageAccuracy: number;
  totalMs: number;
  /** Ayat worth another look -- never framed as failures. */
  revisit: SummaryAyah[];
  strongest: SummaryAyah[];
}

export function sessionSummary(sessionId: string): SessionSummary | null {
  const session = getSession(sessionId);
  if (!session) return null;

  const attempts = getAttempts(sessionId);

  const describe = (attempt: { answerKey: string; accuracy: number; skipped: boolean }) => {
    const verse = verseByKey(attempt.answerKey);
    return {
      verseKey: attempt.answerKey,
      surahName: surahMeta(verse.surah).nameSimple,
      ayahNumber: verse.ayah,
      accuracy: attempt.accuracy,
      skipped: attempt.skipped,
    };
  };

  // Skipped ayat never touch an accuracy figure. They still belong in the list
  // of things to look at again -- that is what asking to be shown one means.
  const scored = attempts.filter((a) => !a.skipped);

  const label = scopeLabel({ type: session.scopeType, id: session.scopeId });

  const points = attempts.reduce((sum, a) => sum + a.points, 0);
  const totalMs = attempts.reduce((sum, a) => sum + a.elapsedMs, 0);
  const averageAccuracy = scored.length
    ? scored.reduce((sum, a) => sum + a.accuracy, 0) / scored.length
    : 0;

  return {
    sessionId,
    mode: session.mode,
    scopeLabel: label,
    totalRounds: session.totalRounds,
    answered: attempts.length,
    scored: scored.length,
    points,
    averageAccuracy,
    totalMs,
    revisit: attempts
      .filter((a) => a.skipped || a.accuracy < 0.85)
      .sort((a, b) => Number(b.skipped) - Number(a.skipped) || a.accuracy - b.accuracy)
      .slice(0, 3)
      .map(describe),
    strongest: scored
      .filter((a) => a.accuracy >= 0.85)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 3)
      .map(describe),
  };
}
