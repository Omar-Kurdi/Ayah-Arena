'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AnswerPayload, PromptPayload, RoundResult } from '@/lib/drill';
import type { ScopeType } from '@/lib/quran';
import type { DrillMode } from '@/lib/store';
import type { Grade, SelfGrade } from '@/lib/score';
import { dict, type Locale } from '@/lib/i18n';
import { answerRound, revealRound, startRound } from './roundApi';
import { useRoundClock } from './useRoundClock';

/**
 * A drill session, from the first round to the results page: what the server
 * has told us, what the reader has done, and how long they have been at it.
 *
 * It is kept apart from the markup because it is the part with rules -- the
 * one-session-per-mount guard, what counts as a round the reader asked to be
 * shown, when the clock stops. `DrillClient` renders what this returns.
 */

export interface DrillConfig {
  scopeType: ScopeType;
  scopeId: number;
  mode: DrillMode;
  /** Recite-aloud with the on-device listener. The server only sees 'recite'. */
  listen: boolean;
  rounds: number;
}

export type Phase = 'loading' | 'prompting' | 'revealed' | 'error';

/** What the on-device listener made of a recited round. A null grade means it
 *  could not hear anything usable. Only ever a suggestion to the reader. */
export type Listened = { grade: Grade | null } | null;

/** Server messages are English and written for developers. The Arabic
 *  interface shows its own message rather than leaking one. */
function failure(err: unknown, fallback: string, locale: Locale): string {
  return locale === 'ar' || !(err instanceof Error) ? fallback : err.message;
}

/**
 * Which marks belong on the revealed ayah, if any.
 *
 * A graded attempt speaks for itself. A round the reader asked to be shown is
 * displayed plainly -- marking every word "look again" would treat asking for
 * help like getting the whole ayah wrong. Otherwise what the listener heard
 * stands in, but only if it heard something: a silent pass marks nothing.
 */
export function recallWords(
  result: RoundResult | null,
  listened: Listened,
  wasShown: boolean
): Grade['words'] | null {
  if (result && result.grade.words.length > 0 && !wasShown) return result.grade.words;
  if (listened?.grade?.words.some((w) => w.status !== 'missed')) return listened.grade.words;
  return null;
}

export function useDrillSession(config: DrillConfig, locale: Locale) {
  const t = dict(locale).drill;
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptPayload | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState<AnswerPayload | null>(null);
  // A round the reader asked to be shown, rather than a blank answer.
  const [wasShown, setWasShown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listened, setListened] = useState<Listened>(null);
  // Once a reader turns listening on, later rounds open ready to listen.
  const [listenOn, setListenOn] = useState(config.listen);

  const [elapsed, clock] = useRoundClock(phase === 'prompting');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const stumbled = useCallback(
    (err: unknown, fallback: string) => {
      setError(failure(err, fallback, locale));
      setPhase('error');
    },
    [locale]
  );

  // One session per mount. React 18+ dev double-invokes effects, and a second
  // session would orphan the first, so the request is guarded.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    startRound(config, t.couldNotStart)
      .then((data) => {
        setSessionId(data.sessionId);
        setPrompt(data.prompt);
        setPhase('prompting');
        clock.restart();
      })
      .catch((err: unknown) => stumbled(err, t.couldNotStart));
    // `t` is dict(locale): one stable object per locale, and the clock keeps
    // one identity for the life of the session.
  }, [config, t, clock, stumbled]);

  const submit = useCallback(
    async (options: { selfGrade?: SelfGrade; skipped?: boolean } = {}) => {
      if (!sessionId || !prompt || submitting) return;
      setSubmitting(true);
      setWasShown(options.skipped === true);

      try {
        setResult(
          await answerRound(
            {
              sessionId,
              index: prompt.index,
              text,
              selfGrade: options.selfGrade,
              skipped: options.skipped === true,
              elapsedMs: clock.elapsedMs(),
            },
            t.couldNotSave
          )
        );
        setPhase('revealed');
        headingRef.current?.focus();
      } catch (err) {
        stumbled(err, t.couldNotSave);
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId, prompt, text, submitting, clock, t, stumbled]
  );

  const fetchAnswer = useCallback(
    () => revealRound({ sessionId, index: prompt?.index }, t.couldNotReveal),
    [sessionId, prompt, t]
  );

  const reveal = useCallback(async () => {
    if (!sessionId || !prompt) return;
    clock.stopUnlessStopped();

    try {
      setRevealed(await fetchAnswer());
      setPhase('revealed');
    } catch (err) {
      stumbled(err, t.couldNotReveal);
    }
  }, [sessionId, prompt, clock, fetchAnswer, t, stumbled]);

  /** The listener has a transcript: the ayah comes out, marked with what it
   *  heard, and the reader is asked how it went. */
  const heard = useCallback((answer: AnswerPayload, grade: Grade | null) => {
    setListenOn(true);
    setRevealed(answer);
    setListened({ grade });
    setPhase('revealed');
  }, []);

  const advance = useCallback(() => {
    if (!result) return;
    if (!result.next) {
      router.push(`/results/${sessionId}${config.listen ? '?listen=1' : ''}`);
      return;
    }
    setPrompt(result.next);
    setResult(null);
    setText('');
    setRevealed(null);
    setWasShown(false);
    setListened(null);
    clock.restart();
    setPhase('prompting');
  }, [result, router, sessionId, config.listen, clock]);

  return {
    phase,
    error,
    prompt,
    result,
    text,
    setText,
    elapsed,
    submitting,
    listened,
    listenOn,
    /** The ayah to draw on the answer line, whichever way it came out. Both
     *  endpoints build it from the same verse, so either will do. */
    answer: revealed ?? result?.answer ?? null,
    recall: recallWords(result, listened, wasShown),
    headingRef,
    submit,
    fetchAnswer,
    reveal,
    stopClock: clock.stop,
    heard,
    advance,
  };
}
