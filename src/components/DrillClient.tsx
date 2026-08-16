'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rosette, RosetteRow } from './Rosette';
import { MushafPage, AyahLine, PendingMarker } from './MushafPage';
import { AyahRecall, RecallLegend } from './AyahRecall';
import { looksArabic } from '@/lib/arabic';
import type { PromptPayload, RoundResult } from '@/lib/drill';
import type { ScopeType } from '@/lib/quran';
import type { DrillMode } from '@/lib/store';
import type { SelfGrade } from '@/lib/score';

export interface DrillConfig {
  scopeType: ScopeType;
  scopeId: number;
  mode: DrillMode;
  rounds: number;
}

type Phase = 'loading' | 'prompting' | 'revealed' | 'error';

/** Deliberately warm and specific, and never about falling short. The lowest
 *  band still ends by handing the ayah back rather than commenting on it. */
function verdict(accuracy: number): string {
  if (accuracy >= 0.999) return 'Word for word.';
  if (accuracy >= 0.85) return "That's the ayah.";
  if (accuracy >= 0.5) return 'Most of it came back.';
  if (accuracy > 0) return 'Some of it came back.';
  return 'Here it is.';
}

const SELF_GRADES: { value: SelfGrade; label: string; hint: string }[] = [
  { value: 'got_it', label: 'Got it', hint: 'Recited it as written' },
  { value: 'almost', label: 'Almost', hint: 'A word or two off' },
  { value: 'not_yet', label: 'Not yet', hint: 'Worth another look' },
];

export function DrillClient({ config }: { config: DrillConfig }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptPayload | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  // A round the reader asked to be shown. The ayah is displayed plainly for it:
  // marking every word "look again" would treat asking for help like getting
  // the whole ayah wrong.
  const [wasShown, setWasShown] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const startedAt = useRef<number>(Date.now());
  // In recite-aloud mode the clock stops when the ayah is revealed, so time
  // spent choosing an honest self-grade never costs anything.
  const frozenMs = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // One session per mount. React 18+ dev double-invokes effects, and a second
  // session would orphan the first, so the request is guarded.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch('/api/drill/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(config),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Could not start the round');

        setSessionId(data.sessionId);
        setPrompt(data.prompt);
        setPhase('prompting');
        startedAt.current = Date.now();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start the round');
        setPhase('error');
      }
    })();
  }, [config]);

  // A quiet elapsed count, not a countdown. Speed can only ever add points.
  useEffect(() => {
    if (phase !== 'prompting') return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'prompting' && config.mode === 'type') inputRef.current?.focus();
  }, [phase, prompt, config.mode]);

  // The line grows to hold the whole ayah rather than scrolling inside itself.
  // Ayat outside juz 30 run long, and a reader has to be able to see what they
  // have written — a page of a mushaf adds lines, it does not scroll.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, phase, prompt]);

  const submit = useCallback(
    async (options: { selfGrade?: SelfGrade; skipped?: boolean } = {}) => {
      if (!sessionId || !prompt || submitting) return;
      setSubmitting(true);
      setWasShown(options.skipped === true);

      try {
        const res = await fetch('/api/drill/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            index: prompt.index,
            text,
            selfGrade: options.selfGrade,
            skipped: options.skipped === true,
            elapsedMs: frozenMs.current ?? Date.now() - startedAt.current,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Could not save that attempt');

        setResult(data);
        setPhase('revealed');
        headingRef.current?.focus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save that attempt');
        setPhase('error');
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId, prompt, text, submitting]
  );

  const reveal = useCallback(async () => {
    if (!sessionId || !prompt) return;
    frozenMs.current = Date.now() - startedAt.current;

    try {
      const res = await fetch('/api/drill/reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, index: prompt.index }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not reveal that ayah');

      setRevealed(data.answer.uthmani);
      setPhase('revealed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reveal that ayah');
      setPhase('error');
    }
  }, [sessionId, prompt]);

  const advance = useCallback(() => {
    if (!result) return;
    if (!result.next) {
      router.push(`/results/${sessionId}`);
      return;
    }
    setPrompt(result.next);
    setResult(null);
    setText('');
    setRevealed(null);
    setWasShown(false);
    setElapsed(0);
    frozenMs.current = null;
    startedAt.current = Date.now();
    setPhase('prompting');
  }, [result, router, sessionId]);

  if (phase === 'loading') {
    return (
      <p className="marginal py-24 text-center" role="status">
        Setting up your ayat
      </p>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-night-edge bg-night-raised p-6 text-center">
        <h2 className="text-2xl">That round did not start</h2>
        <p className="mt-2 text-muted">{error}</p>
        <a
          href="/"
          className="mt-5 inline-block rounded-lg border border-brass px-5 py-2.5 text-brass"
        >
          Back to the start
        </a>
      </div>
    );
  }

  if (!prompt) return null;

  const showKeyboardHint =
    config.mode === 'type' && text.trim().length > 0 && !looksArabic(text);
  const locative = `${prompt.surahName} \u00b7 ayah ${prompt.ayahNumber}`;
  const typing = phase === 'prompting' && config.mode === 'type';

  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <RosetteRow total={prompt.total} currentIndex={prompt.index} />
        <p className="marginal tabular shrink-0">
          {phase === 'prompting'
            ? `${elapsed}s elapsed`
            : `${prompt.index + 1} of ${prompt.total}`}
        </p>
      </header>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (typing) void submit();
        }}
      >
        <MushafPage surahNameArabic={prompt.surahNameArabic} locative={locative}>
          <AyahLine text={prompt.uthmani} marker={prompt.ayahNumber} />

          {/* The next line of the same page — written on, or filled in. */}
          <div className="mt-4 flex items-start gap-2" dir="rtl">
            {typing ? (
              <>
                <label htmlFor="attempt" className="sr-only">
                  Write ayah {prompt.answerAyahNumber}
                </label>
                <textarea
                  id="attempt"
                  ref={inputRef}
                  dir="rtl"
                  lang="ar"
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  className="writing-line grow"
                />
                <PendingMarker marker={prompt.answerAyahNumber} />
              </>
            ) : result && result.grade.words.length > 0 && !wasShown ? (
              <p className="ayah grow" lang="ar">
                <AyahRecall words={result.grade.words} />{' '}
                <span className="inline-block translate-y-1 px-1 align-baseline">
                  <Rosette label={result.answer.ayahNumber} state="done" size={26} numerals="arabic" />
                </span>
              </p>
            ) : revealed || result ? (
              <div className="grow">
                <AyahLine
                  text={revealed ?? result!.answer.uthmani}
                  marker={prompt.answerAyahNumber}
                />
              </div>
            ) : (
              <>
                <div className="writing-line grow" aria-hidden="true" />
                <PendingMarker marker={prompt.answerAyahNumber} />
              </>
            )}
          </div>
        </MushafPage>

        {typing && (
          <>
            <p className="mt-3 text-sm text-muted">
              {showKeyboardHint
                ? 'That is Latin script. Switch your keyboard to Arabic to be scored.'
                : `Write ayah ${prompt.answerAyahNumber} on the line. Harakat are optional, and spelling is graded gently.`}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brass px-5 py-2.5 font-medium text-night transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? 'Checking\u2026' : 'Check my answer'}
              </button>
              <button
                type="button"
                onClick={() => void submit({ skipped: true })}
                disabled={submitting}
                className="text-sm text-muted underline underline-offset-4 hover:text-parchment"
              >
                Show me this one
              </button>
            </div>
          </>
        )}
      </form>

      {phase === 'prompting' && config.mode === 'recite' && (
        <div className="mt-5">
          <p className="text-muted">
            Recite ayah {prompt.answerAyahNumber} out loud, then reveal it to see how
            it went.
          </p>
          <button
            type="button"
            onClick={() => void reveal()}
            className="mt-4 rounded-lg bg-brass px-5 py-2.5 font-medium text-night transition-opacity hover:opacity-90"
          >
            Reveal the ayah
          </button>
        </div>
      )}

      {phase === 'revealed' && config.mode === 'recite' && !result && (
        <SelfGradeChoices
          onGrade={(grade) => void submit({ selfGrade: grade })}
          submitting={submitting}
        />
      )}

      {phase === 'revealed' && result && (
        <section className="mt-6">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl outline-none"
            aria-live="polite"
          >
            {verdict(result.grade.accuracy)}
          </h2>

          {result.grade.words.length > 0 && !wasShown && (
            <div className="mt-3">
              <RecallLegend words={result.grade.words} />
            </div>
          )}

          <dl className="mt-5 flex flex-wrap gap-x-9 gap-y-3">
            <div>
              <dt className="marginal">recalled</dt>
              <dd className="tabular font-display text-2xl">
                {Math.round(result.grade.accuracy * 100)}%
              </dd>
            </div>
            <div>
              <dt className="marginal">points</dt>
              <dd className="tabular font-display text-2xl text-brass">
                +{result.grade.points}
              </dd>
            </div>
            <div>
              <dt className="marginal">running total</dt>
              <dd className="tabular font-display text-2xl">{result.runningPoints}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={advance}
            className="mt-6 rounded-lg bg-brass px-5 py-2.5 font-medium text-night transition-opacity hover:opacity-90"
          >
            {result.next ? 'Next ayah' : 'See how it went'}
          </button>
        </section>
      )}
    </div>
  );
}

/**
 * Recite-aloud mode: the ayah is revealed on the page above, and the reader
 * reports how it went. Self-report is the only honest grade for spoken recall
 * until audio input exists, and it is the signal the revision queue will need.
 */
function SelfGradeChoices({
  onGrade,
  submitting,
}: {
  onGrade: (grade: SelfGrade) => void;
  submitting: boolean;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-2xl">How did that go?</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {SELF_GRADES.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={submitting}
            onClick={() => onGrade(option.value)}
            className="rounded-lg border border-night-edge px-4 py-3 text-left transition-colors hover:border-brass disabled:opacity-60"
          >
            <span className="block font-medium text-parchment">{option.label}</span>
            <span className="block text-sm text-muted">{option.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
