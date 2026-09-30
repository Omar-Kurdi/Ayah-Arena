'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AnswerPayload } from '@/lib/drill';
import type { Grade } from '@/lib/score';
import {
  loadListener,
  micPermission,
  micProblem,
  requestMicrophone,
  startRecording,
  transcribe,
  type MicProblem,
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
 * The browser is asked for the microphone once, as the reader agrees, and it
 * remembers the answer for the site -- so starting to recite, in this round or
 * any later one, opens the microphone without another prompt. The microphone
 * itself is only live while they are reciting, and closes when they leave.
 * What the model heard is graded against the ayah here and then dropped: it is
 * never rendered and never sent anywhere, so neither is the voice.
 */

/**
 * Whether to ask for the microphone now. Yes when the reader has just clicked,
 * which is where a permission prompt belongs. Otherwise only when the browser
 * says it is already granted, so opening a listening round never throws an
 * unprompted permission dialog at someone who merely loaded a page.
 */
async function shouldAskForMic(fromClick: boolean): Promise<boolean> {
  return fromClick || (await micPermission()) === 'granted';
}

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

/**
 * Everything the panel needs before it can listen: the ayah to grade against
 * and the model itself, fetched together because neither waits on the other.
 *
 * A failure comes back as a value rather than thrown, because this is started
 * before the microphone prompt and may finish while the reader is still
 * looking at it -- with nobody awaiting it yet.
 */
async function fetchAndLoad(
  fetchAnswer: () => Promise<AnswerPayload>,
  onProgress: (fraction: number | null) => void
): Promise<{ answer: AnswerPayload } | { failed: unknown }> {
  try {
    const [answer] = await Promise.all([fetchAnswer(), loadListener(onProgress)]);
    return { answer };
  } catch (failed) {
    return { failed };
  }
}

/** Asks the browser for the microphone, and turns a refusal into the stage
 *  that explains it. Null when there is nothing in the reader's way. */
async function micRefusal(mic: Record<MicProblem, string>): Promise<Stage | null> {
  try {
    await requestMicrophone();
    return null;
  } catch (err) {
    return refused(err, mic);
  }
}

/** Opens the microphone for real. The permission was settled when the reader
 *  agreed, so this normally just hands back a recorder. */
async function openRecording(
  mic: Record<MicProblem, string>
): Promise<{ recording: Recording } | { stage: Stage }> {
  try {
    return { recording: await startRecording() };
  } catch (err) {
    return { stage: (await refused(err, mic))! };
  }
}

/** The one place a microphone failure is turned into something a reader can
 *  act on, so the wording is the same wherever it happens. */
async function refused(err: unknown, mic: Record<MicProblem, string>): Promise<Stage> {
  console.error('microphone did not open:', err);
  return { name: 'unavailable', message: mic[await micProblem(err)] };
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
  const prepare = async (fromClick: boolean) => {
    // Decided before anything starts, so the work below is all asynchronous:
    // mounting a panel should never set state in the same tick.
    const ask = await shouldAskForMic(fromClick);

    // Once the panel has given up, late progress must not put it back into a
    // loading bar the reader is no longer waiting on.
    let abandoned = false;
    const loading = fetchAndLoad(fetchAnswer, (fraction) => {
      if (!abandoned) setStage({ name: 'loading', fraction });
    });

    // The prompt goes up beside the download, so the reader answers it while
    // the bytes are arriving -- and a refusal is said straight away, rather
    // than after a download for a microphone they have already turned down.
    const refusal = ask ? await micRefusal(t.mic) : null;
    if (refusal) {
      abandoned = true;
      setStage(refusal);
      return;
    }

    const loaded = await loading;
    if ('failed' in loaded) {
      console.error('listener did not start:', loaded.failed);
      setStage({ name: 'unavailable', message: t.failed });
      return;
    }
    answer.current = loaded.answer;
    lit.current = grade(loaded.answer, '').words;
    setWords(lit.current);
    setStage({ name: 'ready' });
  };

  const open = () => {
    if (!hasConsent()) return setStage({ name: 'consent' });
    setStage({ name: 'loading', fraction: null });
    void prepare(true);
  };

  useEffect(() => {
    if (!autoOpen || !hasConsent()) return;
    // Only starts the work: the opening stage is already set above. It begins
    // after the mount settles rather than during it, because it downloads a
    // model and may open the microphone, and a panel that unmounts straight
    // away should do neither. Not a click, so the microphone is only asked
    // for when the browser says it is already granted.
    let live = true;
    void Promise.resolve().then(() => {
      if (live) void prepare(false);
    });
    return () => {
      live = false;
    };
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
    const opened = await openRecording(t.mic);
    if ('stage' in opened) return setStage(opened.stage);
    recording.current = opened.recording;
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
