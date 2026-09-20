import type { Glyph } from '@/lib/quran';
import type { ScoredWord, WordStatus } from '@/lib/score';
import { QuranGlyphs } from './QuranText';

/**
 * The ayah shown back after an attempt, word by word, in the mushaf font.
 *
 * Words that came back are parchment, near-misses are brass, and words that
 * did not come back are muted with a dotted rule under them. Nothing is red
 * and nothing is struck through: the reader is looking at an ayah, and the
 * marks are there to show where to look again, not to mark it wrong.
 *
 * Each glyph covers `n` graded words, usually one; the check script asserts
 * the spans add up to the grader's word count on every ayah. The four glyphs
 * that cover two ('بَعْدَ مَا', 'إِلْ يَاسِينَ') read as "nearly" when only half came
 * back, rather than claiming either extreme.
 *
 * Renders inline so the caller can place it on a mushaf line alongside the
 * ayah marker, rather than in a block of their own.
 */
export function AyahRecall({
  words,
  glyphs,
  text,
}: {
  words: ScoredWord[];
  glyphs: Glyph[];
  text: string;
}) {
  const statuses: WordStatus[] = [];
  let next = 0;
  for (const glyph of glyphs) {
    const covered = words.slice(next, next + (glyph.n ?? 1)).map((w) => w.status);
    next += glyph.n ?? 1;
    if (covered.every((s) => s === 'exact')) statuses.push('exact');
    else if (covered.every((s) => s === 'missed')) statuses.push('missed');
    else statuses.push('close');
  }

  return <QuranGlyphs glyphs={glyphs} text={text} statuses={statuses} />;
}

export function RecallLegend({
  words,
  labels,
}: {
  words: ScoredWord[];
  labels: Record<WordStatus, string>;
}) {
  const has = (status: ScoredWord['status']) => words.some((w) => w.status === status);
  const items = [
    has('exact') && { label: labels.exact, className: 'bg-verdant' },
    has('close') && { label: labels.close, className: 'bg-brass' },
    has('missed') && { label: labels.missed, className: 'bg-muted' },
  ].filter(Boolean) as { label: string; className: string }[];

  if (items.length < 2) return null;

  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-sm text-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${item.className}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
