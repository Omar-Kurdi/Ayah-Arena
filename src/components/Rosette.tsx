/**
 * The ayah-end rosette. In a printed mushaf every ayah closes with one of
 * these, numbered — so a row of them is the truthful way to show progress
 * through a set of ayat, rather than a generic bar.
 */

type RosetteState = 'done' | 'current' | 'upcoming';

const PETALS = 8;

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** Ayah markers carry Arabic-Indic figures, as printed. Round counters stay
 *  Latin — they are a count of turns, not a place in the mushaf. */
function figures(value: number, numerals: 'latin' | 'arabic'): string {
  if (numerals === 'latin') return String(value);
  return String(value)
    .split('')
    .map((d) => ARABIC_DIGITS[Number(d)])
    .join('');
}

export function Rosette({
  label,
  state,
  size = 30,
  numerals = 'latin',
}: {
  label: number;
  state: RosetteState;
  size?: number;
  numerals?: 'latin' | 'arabic';
}) {
  const petals = Array.from({ length: PETALS }, (_, i) => {
    const angle = (i / PETALS) * Math.PI * 2;
    return { cx: 12 + Math.cos(angle) * 8.2, cy: 12 + Math.sin(angle) * 8.2 };
  });

  const stroke =
    state === 'upcoming' ? 'var(--color-night-edge)' : 'var(--color-brass-dim)';
  const text = figures(label, numerals);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={state === 'current' ? 'drop-shadow-[0_0_5px_rgba(217,180,92,0.3)]' : ''}
    >
      {petals.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={2.6}
          fill={state === 'done' ? 'var(--color-brass-dim)' : 'transparent'}
          fillOpacity={0.45}
          stroke={state === 'current' ? 'var(--color-brass)' : stroke}
          strokeWidth={0.7}
        />
      ))}
      <circle
        cx={12}
        cy={12}
        r={6.4}
        fill="var(--color-night)"
        stroke={state === 'current' ? 'var(--color-brass)' : stroke}
        strokeWidth={state === 'current' ? 1.2 : 0.8}
      />
      <text
        x={12}
        y={12.4}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={numerals === 'arabic' ? 8 : 7}
        fontFamily={
          numerals === 'arabic' ? 'var(--font-arabic)' : 'var(--font-body)'
        }
        fill={
          state === 'upcoming' ? 'var(--color-muted)' : 'var(--color-brass)'
        }
      >
        {text}
      </text>
    </svg>
  );
}

export function RosetteRow({
  total,
  currentIndex,
}: {
  total: number;
  currentIndex: number;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={currentIndex + 1}
      aria-label={`Ayah ${currentIndex + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <Rosette
          key={i}
          label={i + 1}
          state={i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming'}
        />
      ))}
    </div>
  );
}
