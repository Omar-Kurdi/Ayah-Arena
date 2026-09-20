'use client';

import type { RefObject } from 'react';
import { RecallLegend } from '../AyahRecall';
import { suggestedGrade } from './listening';
import type { RoundResult } from '@/lib/drill';
import type { Grade, SelfGrade } from '@/lib/score';
import { dict, num, percent, type Locale } from '@/lib/i18n';
import { DIMMED, PRIMARY } from './buttons';
import type { Listened } from './useDrillSession';

/** What sits under the page once the ayah is out: the reader's own mark, and
 *  then how the round went. */

const SELF_GRADES: SelfGrade[] = ['got_it', 'almost', 'not_yet'];

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

/**
 * Recite-aloud mode: the ayah is revealed on the page above, and the reader
 * reports how it went. Self-report stays the grade even when the listener ran:
 * it can mishear, so it only pre-selects a suggestion and the reader decides.
 */
export function SelfGradeChoices({
  onGrade,
  submitting,
  locale,
  listened,
}: {
  onGrade: (grade: SelfGrade) => void;
  submitting: boolean;
  locale: Locale;
  listened: Listened;
}) {
  const t = dict(locale).drill;
  const heard = listened?.grade?.words.some((w) => w.status !== 'missed') ? listened.grade : null;
  const suggested = heard ? suggestedGrade(heard.accuracy) : null;
  return (
    <section className="mt-6">
      <h2 className="text-2xl">{t.howDidItGo}</h2>
      {heard && (
        <div className="mt-3">
          <RecallLegend words={heard.words} labels={t.legend} />
        </div>
      )}
      {listened && (
        <p className="mt-2 text-sm text-muted">
          {heard ? t.listen.suggestion : t.listen.heardNothing}
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {SELF_GRADES.map((grade) => (
          <button
            key={grade}
            type="button"
            disabled={submitting}
            onClick={() => onGrade(grade)}
            className={`rounded-lg border px-4 py-3 text-start transition-colors hover:border-brass ${DIMMED} ${
              grade === suggested ? 'border-brass bg-night-raised' : 'border-night-edge'
            }`}
          >
            <span className="block font-medium text-parchment">{t.selfGrades[grade].label}</span>
            <span className="block text-sm text-muted">{t.selfGrades[grade].hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** How the round went: the verdict, what held, and the way on. */
export function RoundSummary({
  result,
  recall,
  locale,
  headingRef,
  onAdvance,
}: {
  result: RoundResult;
  recall: Grade['words'] | null;
  locale: Locale;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onAdvance: () => void;
}) {
  const t = dict(locale).drill;
  return (
    <section className="mt-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-3xl outline-none" aria-live="polite">
        {verdict(result.grade.accuracy, locale)}
      </h2>

      {recall && (
        <div className="mt-3">
          <RecallLegend words={recall} labels={t.legend} />
        </div>
      )}

      <dl className="mt-5 flex flex-wrap gap-x-9 gap-y-3">
        {(
          [
            [t.recalled, percent(result.grade.accuracy, locale), ''],
            [t.points, `+${num(result.grade.points, locale)}`, 'text-brass'],
            [t.runningTotal, num(result.runningPoints, locale), ''],
          ] as const
        ).map(([label, value, tone]) => (
          <div key={label}>
            <dt className="marginal">{label}</dt>
            <dd className={`tabular font-display text-2xl ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <button type="button" onClick={onAdvance} className={`mt-6 ${PRIMARY}`}>
        {result.next ? t.next : t.finish}
      </button>
    </section>
  );
}
