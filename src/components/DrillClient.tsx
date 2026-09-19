'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rosette, RosetteRow } from './Rosette';
import { MushafPage, AyahLine, PendingMarker } from './MushafPage';
import { AyahRecall, RecallLegend } from './AyahRecall';
import { looksArabic } from '@/lib/arabic';
import type { AnswerPayload, PromptPayload, RoundResult } from '@/lib/drill';
import type { ScopeType } from '@/lib/quran';
import type { DrillMode } from '@/lib/store';
import type { SelfGrade } from '@/lib/score';
import { dict, num, percent, type Locale } from '@/lib/i18n';

export interface DrillConfig {
  scopeType: ScopeType;
  scopeId: number;
  mode: DrillMode;
  rounds: number;
}

type Phase = 'loading' | 'prompting' | 'revealed' | 'error';

/** Deliberately warm and specific, and never about falling short. The lowest
 *  band still ends by handing the ayah back rather than commenting on it. */
function verdict(accuracy: number, locale: Locale): string {
  const t = dict(locale).drill.verdict;
  if (accuracy >= 0.999) return t.whole;
  if (accuracy >= 0.85) return t.held;
  if (accuracy >= 0.5) return t.most;
  if (accuracy > 0) return t.some;
  return t.none;
}

const SELF_GRADES: SelfGrade[] = ['got_it', 'almost', 'not_yet'];

export function DrillClient({ config, locale }: { config: DrillConfig; locale: Locale }) {
  const t = dict(locale).drill;
  // Server messages are English and written for developers. The Arabic
  // interface shows its own message rather than leaking one.
  const failure = (err: unknown, fallback: string) =>
    locale === 'ar' || !(err instanceof Error) ? fallback : err.message;
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptPayload | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState<AnswerPayload | null>(null);
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
        if (!res.ok) throw new Error(data.error ?? t.couldNotStart);

        setSessionId(data.sessionId);
        setPrompt(data.prompt);
        setPhase('prompting');
        startedAt.current = Date.now();
      } catch (err) {
        setError(failure(err, t.couldNotStart));
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
        if (!res.ok) throw new Error(data.error ?? t.couldNotSave);

        setResult(data);
        setPhase('revealed');
        headingRef.current?.focus();
      } catch (err) {
        setError(failure(err, t.couldNotSave));
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
      if (!res.ok) throw new Error(data.error ?? t.couldNotReveal);

      setRevealed(data.answer);
      setPhase('revealed');
    } catch (err) {
      setError(failure(err, t.couldNotReveal));
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
        {t.loading}
      </p>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-night-edge bg-night-raised p-6 text-center">
        <h2 className="text-2xl">{t.didNotStart}</h2>
        <p className="mt-2 text-muted">{error}</p>
        <a
          href="/"
          className="mt-5 inline-block rounded-lg border border-brass px-5 py-2.5 text-brass"
        >
          {t.backToStart}
        </a>
      </div>
    );
  }

  if (!prompt) return null;

  const showKeyboardHint =
    config.mode === 'type' && text.trim().length > 0 && !looksArabic(text);
  const locative = dict(locale).locative(
    locale === 'ar' ? prompt.surahNameArabic : prompt.surahName,
    prompt.ayahNumber
  );
  const typing = phase === 'prompting' && config.mode === 'type';

  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <RosetteRow
          total={prompt.total}
          currentIndex={prompt.index}
          label={t.progressLabel(prompt.index + 1, prompt.total)}
          numerals={locale === 'ar' ? 'arabic' : 'latin'}
        />
        <p className="marginal tabular shrink-0">
          {phase === 'prompting'
            ? t.elapsed(elapsed)
            : t.position(prompt.index + 1, prompt.total)}
        </p>
      </header>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (typing) void submit();
        }}
      >
        <MushafPage
          surahId={prompt.surahNumber}
          surahNameArabic={prompt.surahNameArabic}
          locative={locative}
        >
          <AyahLine glyphs={prompt.glyphs} text={prompt.uthmani} marker={prompt.ayahNumber} />

          {/* The next line of the same page — written on, or filled in. */}
          <div className="mt-4 flex items-start gap-2" dir="rtl">
            {typing ? (
              <>
                <label htmlFor="attempt" className="sr-only">
                  {t.writeLabel(prompt.answerAyahNumber)}
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
              <p className="ayah grow">
                <AyahRecall
                  words={result.grade.words}
                  glyphs={result.answer.glyphs}
                  text={result.answer.uthmani}
                />{' '}
                <span className="inline-block translate-y-1 px-1 align-baseline">
                  <Rosette label={result.answer.ayahNumber} state="done" size={26} numerals="arabic" />
                </span>
              </p>
            ) : revealed || result ? (
              <div className="grow">
                <AyahLine
                  glyphs={(revealed ?? result!.answer).glyphs}
                  text={(revealed ?? result!.answer).uthmani}
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
                ? t.latinHint
                : t.writeHint(prompt.answerAyahNumber)}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brass px-5 py-2.5 font-medium text-night transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? t.checking : t.check}
              </button>
              <button
                type="button"
                onClick={() => void submit({ skipped: true })}
                disabled={submitting}
                className="text-sm text-muted underline underline-offset-4 hover:text-parchment"
              >
                {t.showMe}
              </button>
            </div>
          </>
        )}
      </form>

      {phase === 'prompting' && config.mode === 'recite' && (
        <div className="mt-5">
          <p className="text-muted">{t.reciteHint(prompt.answerAyahNumber)}</p>
          <button
            type="button"
            onClick={() => void reveal()}
            className="mt-4 rounded-lg bg-brass px-5 py-2.5 font-medium text-night transition-opacity hover:opacity-90"
          >
            {t.reveal}
          </button>
        </div>
      )}

      {phase === 'revealed' && config.mode === 'recite' && !result && (
        <SelfGradeChoices
          onGrade={(grade) => void submit({ selfGrade: grade })}
          submitting={submitting}
          locale={locale}
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
            {verdict(result.grade.accuracy, locale)}
          </h2>

          {result.grade.words.length > 0 && !wasShown && (
            <div className="mt-3">
              <RecallLegend words={result.grade.words} labels={t.legend} />
            </div>
          )}

          <dl className="mt-5 flex flex-wrap gap-x-9 gap-y-3">
            <div>
              <dt className="marginal">{t.recalled}</dt>
              <dd className="tabular font-display text-2xl">
                {percent(result.grade.accuracy, locale)}
              </dd>
            </div>
            <div>
              <dt className="marginal">{t.points}</dt>
              <dd className="tabular font-display text-2xl text-brass">
                +{num(result.grade.points, locale)}
              </dd>
            </div>
            <div>
              <dt className="marginal">{t.runningTotal}</dt>
              <dd className="tabular font-display text-2xl">
                {num(result.runningPoints, locale)}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={advance}
            className="mt-6 rounded-lg bg-brass px-5 py-2.5 font-medium text-night transition-opacity hover:opacity-90"
          >
            {result.next ? t.next : t.finish}
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
  locale,
}: {
  onGrade: (grade: SelfGrade) => void;
  submitting: boolean;
  locale: Locale;
}) {
  const t = dict(locale).drill;
  return (
    <section className="mt-6">
      <h2 className="text-2xl">{t.howDidItGo}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {SELF_GRADES.map((grade) => (
          <button
            key={grade}
            type="button"
            disabled={submitting}
            onClick={() => onGrade(grade)}
            className="rounded-lg border border-night-edge px-4 py-3 text-start transition-colors hover:border-brass disabled:opacity-60"
          >
            <span className="block font-medium text-parchment">{t.selfGrades[grade].label}</span>
            <span className="block text-sm text-muted">{t.selfGrades[grade].hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
