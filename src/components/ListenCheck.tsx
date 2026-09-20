'use client';

import type { AnswerPayload } from '@/lib/drill';
import type { Grade } from '@/lib/score';
import { dict, type Locale } from '@/lib/i18n';
import { DIMMED, PRIMARY, SECONDARY } from './drill/buttons';
import { heardWord } from './drill/listening';
import { useListening } from './drill/useListening';

/**
 * Recite-aloud mode, checked by ear: an on-device speech model listens while
 * the reader recites, lights a dot per word as it comes back, and suggests a
 * self-grade when they finish. The reader always has the last word -- the
 * suggestion is pre-selected, never submitted for them.
 *
 * This is the panel. `drill/useListening` is what it is doing; nothing the
 * model wrote reaches the markup here, because a machine transcript of
 * recitation is not Quran text and is never shown.
 */

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
  /** A listening round: open straight away rather than waiting for a tap. */
  autoOpen: boolean;
  /** The ayah to grade against. Held here, never drawn, until the reader finishes. */
  fetchAnswer: () => Promise<AnswerPayload>;
  /** The reader stopped reciting: the round's clock stops here. */
  onStop: () => void;
  onHeard: (answer: AnswerPayload, grade: Grade | null) => void;
}) {
  const t = dict(locale).drill.listen;
  const listening = useListening({ locale, autoOpen, fetchAnswer, onStop, onHeard });
  const { stage, words } = listening;

  switch (stage.name) {
    case 'idle':
      return (
        <div>
          <button type="button" onClick={listening.open} className={SECONDARY}>
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
            <button type="button" className={PRIMARY} onClick={listening.agree}>
              {t.agree}
            </button>
            <button
              type="button"
              className={`${SECONDARY} ${DIMMED}`}
              onClick={listening.dismiss}
            >
              {t.notNow}
            </button>
          </div>
        </section>
      );

    case 'loading':
      return <Downloading fraction={stage.fraction} locale={locale} />;

    case 'ready':
      return (
        <div className="w-full">
          <p className="text-muted">{t.ready(answerAyahNumber)}</p>
          <button
            type="button"
            onClick={() => void listening.start()}
            className={`mt-3 ${PRIMARY}`}
          >
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
            onClick={() => void listening.finish()}
            disabled={stage.name === 'finishing'}
            className={`mt-4 ${PRIMARY} ${DIMMED}`}
          >
            {t.done}
          </button>
        </div>
      );

    case 'unavailable':
      return <p className="w-full text-sm text-muted">{stage.message}</p>;
  }
}

/** The one-time model download, as far along as it has told us. */
function Downloading({ fraction, locale }: { fraction: number | null; locale: Locale }) {
  const t = dict(locale).drill.listen;
  return (
    <div className="w-full" role="status">
      <p className="text-sm text-muted">
        {fraction === null ? t.preparingNoSize : t.preparing(Math.floor(fraction * 100))}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-night-edge">
        <div
          className="h-full bg-brass transition-[width]"
          style={{ width: `${Math.round((fraction ?? 0) * 100)}%` }}
        />
      </div>
    </div>
  );
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
