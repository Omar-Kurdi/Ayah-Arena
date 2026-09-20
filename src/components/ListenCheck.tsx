'use client';

import { useEffect, useRef, useState } from 'react';
import { gradeTyped, type Grade, type SelfGrade } from '@/lib/score';
import type { AnswerPayload } from '@/lib/drill';
import { loadListener, micProblem, startRecording, transcribe, type Recording } from '@/lib/listen/listener';
import { dict, type Locale } from '@/lib/i18n';

/**
 * Recite-aloud mode, checked by ear: an on-device speech model listens while
 * the reader recites, lights a dot per word as it comes back, and suggests a
 * self-grade when they finish. The reader always has the last word -- the
 * suggestion is pre-selected, never submitted for them.
 *
 * What the model heard is graded here in the browser against the ayah and
 * then thrown away. It is never shown (a machine transcript of recitation is
 * not Quran text) and never sent anywhere, so neither is the reader's voice.
 */

const CONSENT_KEY = 'arena.listen';
// How often the growing recording is re-heard for the live dots.
const LIVE_EVERY_MS = 1500;
// Live passes re-hear only the most recent stretch, so they stay quick on a
// long ayah; the final pass always hears the whole recitation.
const LIVE_TAIL_SECONDS = 20;
// A generous ceiling so a forgotten microphone does not stay open.
const MAX_SECONDS = 150;

function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberConsent() {
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

const grade = (answer: AnswerPayload, heard: string) =>
  gradeTyped(
    { display: answer.uthmani, accepted: [answer.imlaei, answer.simple, answer.uthmani] },
    heard,
    0
  );

const heardWord = (w: Grade['words'][number]) => w.status !== 'missed';

const RANK = { missed: 0, close: 1, exact: 2 } as const;

/** A live dot, once lit, stays lit: a pass that only hears the tail of the
 *  recording should not put out the words before it. */
export function keepLit(before: Grade['words'], now: Grade['words']): Grade['words'] {
  return now.map((w, i) => (before[i] && RANK[before[i].status] > RANK[w.status] ? before[i] : w));
}

type Stage =
  | { name: 'idle' }
  | { name: 'consent' }
  | { name: 'loading'; fraction: number | null }
  | { name: 'ready' }
  | { name: 'recording' }
  | { name: 'finishing' }
  | { name: 'unavailable'; message: string };

export function ListenCheck({
  locale,
  answerAyahNumber,
  autoOpen,
  fetchAnswer,
  onStop,
  onHeard,
}: {
  locale: Locale;
  answerAyahNumber: number;
  /** A listening round: open straight away (the consent panel first, if the
   *  reader has not agreed yet) rather than waiting for a tap. */
  autoOpen: boolean;
  /** The ayah to grade against. Held here, never drawn, until the reader finishes. */
  fetchAnswer: () => Promise<AnswerPayload>;
  /** The reader stopped reciting: the round's clock stops here. */
  onStop: () => void;
  onHeard: (answer: AnswerPayload, grade: Grade | null) => void;
}) {
  const t = dict(locale).drill.listen;
  // A listening round is open from the moment it mounts, so the opening stage
  // is decided here rather than by setting state from an effect.
  const [stage, setStage] = useState<Stage>(() =>
    !autoOpen
      ? { name: 'idle' }
      : hasConsent()
        ? { name: 'loading', fraction: null }
        : { name: 'consent' }
  );
  const [words, setWords] = useState<Grade['words']>([]);
  const answer = useRef<AnswerPayload | null>(null);
  const recording = useRef<Recording | null>(null);
  const finished = useRef(false);
  const lit = useRef<Grade['words']>([]);

  // Release the microphone if the reader leaves mid-recitation.
  useEffect(() => () => recording.current?.stop(), []);

  // The caller puts the panel into its loading stage; this only does the work.
  const prepare = async () => {
    try {
      const [ans] = await Promise.all([
        fetchAnswer(),
        loadListener((fraction) => setStage({ name: 'loading', fraction })),
      ]);
      answer.current = ans;
      lit.current = grade(ans, '').words;
      setWords(lit.current);
      setStage({ name: 'ready' });
    } catch (err) {
      console.error('listener did not start: ' + (err instanceof Error ? err.message : String(err)));
      setStage({ name: 'unavailable', message: t.failed });
    }
  };

  const open = () => {
    if (!hasConsent()) return setStage({ name: 'consent' });
    setStage({ name: 'loading', fraction: null });
    void prepare();
  };

  useEffect(() => {
    // Only starts the work: the opening stage is already set above.
    if (autoOpen && hasConsent()) void prepare();
    // Once per round; the component is keyed by round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    const rec = recording.current;
    const ans = answer.current;
    if (!rec || !ans || finished.current) return;
    finished.current = true;
    onStop();
    setStage({ name: 'finishing' });
    const audio = await rec.snapshot();
    rec.stop();
    recording.current = null;
    try {
      const heard = await transcribe(audio);
      onHeard(ans, grade(ans, heard));
    } catch {
      onHeard(ans, null);
    }
  };

  const start = async () => {
    try {
      recording.current = await startRecording();
    } catch (err) {
      console.error('microphone did not open:', err);
      setStage({ name: 'unavailable', message: t.mic[await micProblem(err)] });
      return;
    }
    finished.current = false;
    setStage({ name: 'recording' });
  };

  // Live follow-along: re-hear the whole recording so far, one pass at a time.
  useEffect(() => {
    if (stage.name !== 'recording') return;
    let busy = false;
    let lastSeconds = 0;
    const id = setInterval(async () => {
      const rec = recording.current;
      const ans = answer.current;
      if (!rec || !ans || busy || finished.current) return;
      const seconds = rec.seconds();
      if (seconds >= MAX_SECONDS) return void finish();
      if (seconds < 1 || seconds - lastSeconds < 0.75) return;
      busy = true;
      lastSeconds = seconds;
      try {
        const heard = await transcribe(await rec.snapshot(LIVE_TAIL_SECONDS));
        if (finished.current) return;
        const live = keepLit(lit.current, grade(ans, heard).words);
        lit.current = live;
        setWords(live);
        // Every word is back: nothing left to wait for.
        if (live.length > 0 && live.every(heardWord)) void finish();
      } catch {
        // A missed live pass costs nothing; the final pass decides.
      } finally {
        busy = false;
      }
    }, LIVE_EVERY_MS);
    return () => clearInterval(id);
    // finish reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.name]);

  const secondary =
    'rounded-lg border border-night-edge px-5 py-2.5 text-parchment transition-colors hover:border-brass disabled:opacity-60';
  const primary =
    'rounded-lg bg-brass px-5 py-2.5 font-medium text-night transition-opacity hover:opacity-90';

  switch (stage.name) {
    case 'idle':
      return (
        <div>
          <button type="button" onClick={open} className={secondary}>
            {t.open}
          </button>
          <p className="mt-1.5 text-sm text-verdant">{t.onDevice}</p>
        </div>
      );

    case 'consent':
      return (
        <section className="w-full rounded-lg border border-night-edge bg-night-raised p-5">
          <h2 className="text-xl">{t.consentHeading}</h2>
          <p className="mt-2 text-sm text-muted">{t.consent}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={primary}
              onClick={() => {
                rememberConsent();
                open();
              }}
            >
              {t.agree}
            </button>
            <button type="button" className={secondary} onClick={() => setStage({ name: 'idle' })}>
              {t.notNow}
            </button>
          </div>
        </section>
      );

    case 'loading':
      return (
        <div className="w-full" role="status">
          <p className="text-sm text-muted">
            {stage.fraction === null ? t.preparingNoSize : t.preparing(Math.floor(stage.fraction * 100))}
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-night-edge">
            <div
              className="h-full bg-brass transition-[width]"
              style={{ width: `${Math.round((stage.fraction ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      );

    case 'ready':
      return (
        <div className="w-full">
          <p className="text-muted">{t.ready(answerAyahNumber)}</p>
          <button type="button" onClick={() => void start()} className={`mt-3 ${primary}`}>
            {t.start}
          </button>
        </div>
      );

    case 'recording':
    case 'finishing':
      return (
        <div className="w-full">
          <p className="text-muted" role="status">
            {stage.name === 'recording' ? t.listening : t.finishing}
          </p>
          <WordDots words={words} label={t.dotsLabel(words.filter(heardWord).length, words.length)} />
          <button
            type="button"
            onClick={() => void finish()}
            disabled={stage.name === 'finishing'}
            className={`mt-4 ${primary} disabled:opacity-60`}
          >
            {t.done}
          </button>
        </div>
      );

    case 'unavailable':
      return <p className="w-full text-sm text-muted">{stage.message}</p>;
  }
}

/** One dot per word of the ayah, in reading order. Only the count is given
 *  away before the reveal, never the words. */
function WordDots({ words, label }: { words: Grade['words']; label: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" dir="rtl" role="img" aria-label={label}>
      {words.map((w, i) => (
        <span
          key={i}
          className={`size-2.5 rounded-full transition-colors duration-300 ${
            w.status === 'exact' ? 'bg-parchment' : w.status === 'close' ? 'bg-brass' : 'bg-night-edge'
          }`}
        />
      ))}
    </div>
  );
}
