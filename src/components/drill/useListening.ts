'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AnswerPayload } from '@/lib/drill';
import type { Grade } from '@/lib/score';
import {
  loadListener,
  micProblem,
  startRecording,
  transcribe,
  type Recording,
} from '@/lib/listen/listener';
import { dict, type Locale } from '@/lib/i18n';
import {
  grade,
  hasConsent,
  heardWord,
  keepLit,
  LIVE_EVERY_MS,
  LIVE_TAIL_SECONDS,
  MAX_SECONDS,
  rememberConsent,
} from './listening';

/**
 * Listening to a recitation, from the reader's agreement to the grade it
 * earns. One stage at a time, and the panel draws whichever it is in.
 *
 * The microphone opens only when the reader presses start, and closes again
 * when they leave. What the model heard is graded against the ayah here and
 * then dropped: it is never rendered and never sent anywhere, so neither is
 * the voice that produced it.
 */

/** Where a panel opens: a listening round is already open, and asks for the
 *  reader's agreement first if they have not given it on this device. */
function openingStage(autoOpen: boolean): Stage {
  if (!autoOpen) return { name: 'idle' };
  return hasConsent() ? { name: 'loading', fraction: null } : { name: 'consent' };
}

/** Whether this tick is worth another pass: not before there is a second of
 *  audio, and not again for a stretch barely longer than the last one. */
function passDue(seconds: number, since: number): boolean {
  return seconds >= 1 && seconds - since >= 0.75;
}

/** One live pass: hear the most recent stretch again, and merge what came
 *  back into the dots that are already lit. */
async function livePass(rec: Recording, ans: AnswerPayload, lit: Grade['words']) {
  const heard = await transcribe(await rec.snapshot(LIVE_TAIL_SECONDS));
  return keepLit(lit, grade(ans, heard).words);
}

/** What a pass in flight needs to look at. Refs, not state: a pass started a
 *  second ago must still see the recording as it is now. */
interface InFlight {
  recording: RefObject<Recording | null>;
  answer: RefObject<AnswerPayload | null>;
  finished: RefObject<boolean>;
  lit: RefObject<Grade['words']>;
}

/**
 * The live follow-along, while the reader recites: every so often, hear the
 * recitation again and light the words that have come back. Passes never
 * overlap, and the recitation finishes itself once every word is in.
 */
function useLivePasses(
  active: boolean,
  inFlight: InFlight,
  onWords: (words: Grade['words']) => void,
  onFinished: () => void
) {
  useEffect(() => {
    if (!active) return;
    const { recording, answer, finished, lit } = inFlight;
    let busy = false;
    let lastSeconds = 0;

    const id = setInterval(async () => {
      const rec = recording.current;
      const ans = answer.current;
      if (!rec || !ans || busy || finished.current) return;
      const seconds = rec.seconds();
      if (seconds >= MAX_SECONDS) return void onFinished();
      if (!passDue(seconds, lastSeconds)) return;

      busy = true;
      lastSeconds = seconds;
      try {
        const live = await livePass(rec, ans, lit.current);
        if (finished.current) return;
        lit.current = live;
        onWords(live);
        // Every word is back: nothing left to wait for.
        if (live.length > 0 && live.every(heardWord)) onFinished();
      } catch {
        // A missed live pass costs nothing; the final pass decides.
      } finally {
        busy = false;
      }
    }, LIVE_EVERY_MS);

    return () => clearInterval(id);
    // The refs and the callbacks are read when a pass runs, not when it is armed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

export type Stage =
  | { name: 'idle' }
  | { name: 'consent' }
  | { name: 'loading'; fraction: number | null }
  | { name: 'ready' }
  | { name: 'recording' }
  | { name: 'finishing' }
  | { name: 'unavailable'; message: string };

export function useListening({
  locale,
  autoOpen,
  fetchAnswer,
  onStop,
  onHeard,
}: {
  locale: Locale;
  /** A listening round: open straight away (the consent panel first, if the
   *  reader has not agreed yet) rather than waiting for a tap. */
  autoOpen: boolean;
  fetchAnswer: () => Promise<AnswerPayload>;
  onStop: () => void;
  onHeard: (answer: AnswerPayload, grade: Grade | null) => void;
}) {
  const t = dict(locale).drill.listen;
  // A listening round is open from the moment it mounts, so the opening stage
  // is decided here rather than by setting state from an effect.
  const [stage, setStage] = useState<Stage>(() => openingStage(autoOpen));
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
      console.error('listener did not start:', err);
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

  useLivePasses(
    stage.name === 'recording',
    { recording, answer, finished, lit },
    setWords,
    () => void finish()
  );

  return {
    stage,
    words,
    /** The reader wants to listen: the consent panel, or straight to work. */
    open,
    /** They agreed, and will not be asked again on this device. */
    agree: () => {
      rememberConsent();
      open();
    },
    /** Not now: back to a button, with nothing downloaded. */
    dismiss: () => setStage({ name: 'idle' }),
    start,
    finish,
  };
}
