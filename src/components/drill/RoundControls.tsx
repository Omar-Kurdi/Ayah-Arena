'use client';

import { ListenCheck } from '../ListenCheck';
import type { AnswerPayload, PromptPayload } from '@/lib/drill';
import type { Grade } from '@/lib/score';
import { looksArabic } from '@/lib/arabic';
import { dict, type Locale } from '@/lib/i18n';
import { DIMMED, PRIMARY, SECONDARY } from './buttons';

/** What sits under the page while the reader is still answering: the buttons
 *  for the mode they chose, and nothing belonging to the other two. */

/** Typed mode: submit, or ask to be shown the ayah instead. */
export function TypedControls({
  locale,
  marker,
  text,
  submitting,
  onSkip,
}: {
  locale: Locale;
  marker: number;
  /** What is on the line so far, for the hint underneath it. */
  text: string;
  submitting: boolean;
  onSkip: () => void;
}) {
  const t = dict(locale).drill;
  // Arabic was expected and Latin script arrived: a keyboard, not a mistake.
  const latinHint = text.trim().length > 0 && !looksArabic(text);
  return (
    <>
      <p className="mt-3 text-sm text-muted">{latinHint ? t.latinHint : t.writeHint(marker)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className={`${PRIMARY} ${DIMMED}`}
        >
          {submitting ? t.checking : t.check}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="text-sm text-muted underline underline-offset-4 hover:text-parchment"
        >
          {t.showMe}
        </button>
      </div>
    </>
  );
}

/**
 * Recite-aloud, with or without the listener. The reveal button is always
 * there: in a listening round it is the way out when the microphone is not an
 * option, so it steps back to a quieter button.
 */
export function ReciteControls({
  locale,
  prompt,
  listen,
  listenOn,
  fetchAnswer,
  onStop,
  onHeard,
  onReveal,
}: {
  locale: Locale;
  prompt: PromptPayload;
  listen: boolean;
  listenOn: boolean;
  fetchAnswer: () => Promise<AnswerPayload>;
  onStop: () => void;
  onHeard: (answer: AnswerPayload, grade: Grade | null) => void;
  onReveal: () => void;
}) {
  const t = dict(locale).drill;
  return (
    <div className="mt-5">
      {/* A listening round carries its own instructions in the panel. */}
      {!listen && <p className="mb-4 text-muted">{t.reciteHint(prompt.answerAyahNumber)}</p>}
      <div className="flex flex-wrap items-start gap-3">
        {listen && (
          <ListenCheck
            key={prompt.index}
            locale={locale}
            answerAyahNumber={prompt.answerAyahNumber}
            autoOpen={listenOn}
            fetchAnswer={fetchAnswer}
            onStop={onStop}
            onHeard={onHeard}
          />
        )}
        <button
          type="button"
          onClick={onReveal}
          className={listen ? SECONDARY : PRIMARY}
        >
          {t.reveal}
        </button>
      </div>
    </div>
  );
}
