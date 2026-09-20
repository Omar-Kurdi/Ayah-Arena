'use client';

import Link from 'next/link';
import { RosetteRow } from './Rosette';
import { MushafPage, AyahLine } from './MushafPage';
import { WritingLine, RevealedLine } from './drill/AnswerLine';
import { TypedControls, ReciteControls } from './drill/RoundControls';
import { SelfGradeChoices, RoundSummary } from './drill/RoundSummary';
import { useDrillSession, type DrillConfig } from './drill/useDrillSession';
import { dict, type Locale } from '@/lib/i18n';

/**
 * A round, on the page: the prompt ayah, the line the answer goes on, and the
 * controls for the way this reader is answering.
 *
 * The session itself -- what the server said, the clock, what the listener
 * heard -- is `useDrillSession`. This component decides what is on screen.
 */

export type { DrillConfig };

export function DrillClient({ config, locale }: { config: DrillConfig; locale: Locale }) {
  const t = dict(locale).drill;
  const round = useDrillSession(config, locale);
  const { phase, prompt, result } = round;

  if (phase === 'loading') return <Loading label={t.loading} />;
  if (phase === 'error') return <DidNotStart locale={locale} reason={round.error} />;
  if (!prompt) return null;

  const typing = phase === 'prompting' && config.mode === 'type';
  const reciting = config.mode === 'recite';

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
            ? t.elapsed(round.elapsed)
            : t.position(prompt.index + 1, prompt.total)}
        </p>
      </header>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (typing) void round.submit();
        }}
      >
        <MushafPage
          surahId={prompt.surahNumber}
          surahNameArabic={prompt.surahNameArabic}
          locative={dict(locale).locative(
            locale === 'ar' ? prompt.surahNameArabic : prompt.surahName,
            prompt.ayahNumber
          )}
        >
          <AyahLine glyphs={prompt.glyphs} text={prompt.uthmani} marker={prompt.ayahNumber} />

          {/* The next line of the same page — written on, or filled in. */}
          <div className="mt-4 flex items-start gap-2" dir="rtl">
            {typing ? (
              <WritingLine
                text={round.text}
                onText={round.setText}
                onSubmit={() => void round.submit()}
                marker={prompt.answerAyahNumber}
                label={t.writeLabel(prompt.answerAyahNumber)}
              />
            ) : (
              <RevealedLine
                recall={round.recall}
                answer={round.answer}
                marker={prompt.answerAyahNumber}
              />
            )}
          </div>
        </MushafPage>

        {typing && (
          <TypedControls
            locale={locale}
            marker={prompt.answerAyahNumber}
            text={round.text}
            submitting={round.submitting}
            onSkip={() => void round.submit({ skipped: true })}
          />
        )}
      </form>

      {phase === 'prompting' && reciting && (
        <ReciteControls
          locale={locale}
          prompt={prompt}
          listen={config.listen}
          listenOn={round.listenOn}
          fetchAnswer={round.fetchAnswer}
          onStop={round.stopClock}
          onHeard={round.heard}
          onReveal={() => void round.reveal()}
        />
      )}

      {phase === 'revealed' && reciting && !result && (
        <SelfGradeChoices
          onGrade={(grade) => void round.submit({ selfGrade: grade })}
          submitting={round.submitting}
          locale={locale}
          listened={round.listened}
        />
      )}

      {phase === 'revealed' && result && (
        <RoundSummary
          result={result}
          recall={round.recall}
          locale={locale}
          headingRef={round.headingRef}
          onAdvance={round.advance}
        />
      )}
    </div>
  );
}

/** The wait for the first round, which is one database read away. */
function Loading({ label }: { label: string }) {
  return (
    <p className="marginal py-24 text-center" role="status">
      {label}
    </p>
  );
}

/** Nothing to drill: say what happened, and offer the way back. */
function DidNotStart({ locale, reason }: { locale: Locale; reason: string | null }) {
  const t = dict(locale).drill;
  return (
    <div className="mx-auto max-w-md rounded-lg border border-night-edge bg-night-raised p-6 text-center">
      <h2 className="text-2xl">{t.didNotStart}</h2>
      <p className="mt-2 text-muted">{reason}</p>
      <Link
        href="/"
        className="mt-5 inline-block rounded-lg border border-brass px-5 py-2.5 text-brass"
      >
        {t.backToStart}
      </Link>
    </div>
  );
}
