'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The round's clock.
 *
 * It counts up, never down: speed is a bonus on top of accurate recall and
 * never a penalty, so there is nothing to run out of. It stops the moment the
 * ayah is out, which is what keeps the time spent choosing an honest
 * self-grade from costing anything.
 */
export interface RoundClock {
  /** What this round took, for the record: frozen if the ayah is out. */
  elapsedMs: () => number;
  /** This round is over: start the next one from zero. */
  restart: () => void;
  /** The reader has finished reciting. */
  stop: () => void;
  /** The ayah is being revealed. If the reader already stopped reciting,
   *  that earlier moment is the honest one and this changes nothing. */
  stopUnlessStopped: () => void;
}

/** Returns the whole seconds to show, and a clock that never changes identity
 *  -- everything it does goes through refs, so it is safe in a dependency. */
export function useRoundClock(running: boolean): [number, RoundClock] {
  // Set when the round actually starts, not while rendering: reading the
  // clock during render is not a pure render.
  const startedAt = useRef<number>(0);
  const stoppedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const clock = useMemo<RoundClock>(
    () => ({
      elapsedMs: () => stoppedAt.current ?? Date.now() - startedAt.current,
      restart: () => {
        stoppedAt.current = null;
        startedAt.current = Date.now();
        setElapsed(0);
      },
      stop: () => {
        stoppedAt.current = Date.now() - startedAt.current;
      },
      stopUnlessStopped: () => {
        stoppedAt.current ??= Date.now() - startedAt.current;
      },
    }),
    []
  );

  return [elapsed, clock];
}
