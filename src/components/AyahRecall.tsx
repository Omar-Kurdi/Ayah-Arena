import type { ScoredWord } from '@/lib/score';

/**
 * The ayah shown back after an attempt, word by word.
 *
 * Words that came back are parchment, near-misses are brass, and words that
 * did not come back are muted with a dotted rule under them. Nothing is red
 * and nothing is struck through: the reader is looking at an ayah, and the
 * marks are there to show where to look again, not to mark it wrong.
 *
 * Renders bare spans so the caller can place them on a mushaf line alongside
 * the ayah marker, rather than in a block of their own.
 */
export function AyahRecall({ words }: { words: ScoredWord[] }) {
  return (
    <>
      {words.map((word, i) => (
        <span
          key={`${word.word}-${i}`}
          className={
            word.status === 'exact'
              ? 'text-parchment'
              : word.status === 'close'
                ? 'text-brass'
                : 'text-muted underline decoration-dotted decoration-from-font underline-offset-8'
          }
        >
          {word.word}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

export function RecallLegend({ words }: { words: ScoredWord[] }) {
  const has = (status: ScoredWord['status']) => words.some((w) => w.status === status);
  const items = [
    has('exact') && { label: 'came back', className: 'bg-verdant' },
    has('close') && { label: 'nearly', className: 'bg-brass' },
    has('missed') && { label: 'look again', className: 'bg-muted' },
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
