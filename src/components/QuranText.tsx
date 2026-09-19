import type { Glyph } from '@/lib/quran';
import type { WordStatus } from '@/lib/score';

/**
 * Quran text drawn in the King Fahd Complex (QPC V2) mushaf fonts.
 *
 * These are not ordinary fonts: there is one per mushaf page (604 of them),
 * and each word is a single glyph code that only means something in its own
 * page's font. So each word names its font, and the page fonts are declared
 * here, only for the pages actually on screen. React 19 hoists and
 * de-duplicates <style href precedence>, so a round loads one or two page
 * fonts (~160KB each) rather than the whole 95MB set.
 *
 * `font-display: block` matters: the glyph codes are presentation-form
 * codepoints, and any fallback font would briefly draw them as unrelated
 * Arabic letters.
 *
 * The glyphs are meaningless to a screen reader or on copy, so they are
 * aria-hidden and the real Uthmani text travels alongside as sr-only text.
 */

function PageFont({ page }: { page: number }) {
  return (
    <style href={`qpc-v2-p${page}`} precedence="qpc">
      {`@font-face{font-family:"qpc-p${page}";src:url(/fonts/qpc-v2/p${page}.woff2) format("woff2");font-display:block}`}
    </style>
  );
}

const STATUS_CLASS: Record<WordStatus, string> = {
  exact: 'text-parchment',
  close: 'text-brass',
  missed: 'text-muted underline decoration-dotted underline-offset-8',
};

export function QuranGlyphs({
  glyphs,
  text,
  statuses,
}: {
  glyphs: Glyph[];
  /** The same ayah in Unicode, for assistive tech and copy. */
  text: string;
  /** Per-word recall marks, index-aligned with `glyphs`. */
  statuses?: WordStatus[];
}) {
  const pages = [...new Set(glyphs.map((g) => g.p))];

  return (
    <>
      {pages.map((page) => (
        <PageFont key={page} page={page} />
      ))}
      {/* Read aloud by assistive tech; shown instead of the glyphs if a page
          font fails (see QuranFontGuard). */}
      <span className="qpc-text sr-only" lang="ar">
        {text}
      </span>
      <span aria-hidden="true" className="qpc-glyphs select-none">
        {glyphs.map((glyph, i) => (
          <span
            key={i}
            style={{ fontFamily: `"qpc-p${glyph.p}"` }}
            className={statuses ? STATUS_CLASS[statuses[i] ?? 'missed'] : undefined}
          >
            {glyph.c}
            {i < glyphs.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </>
  );
}

/**
 * A surah's name in the mushaf's own calligraphy. The font maps the ligature
 * "surahNNN" to the drawn name, so the Arabic name is carried for assistive
 * tech rather than drawn.
 */
export function SurahName({
  id,
  nameArabic,
  className = '',
}: {
  id: number;
  nameArabic: string;
  className?: string;
}) {
  return (
    <span className={`font-surah-name ${className}`} role="img" aria-label={nameArabic}>
      {`surah${String(id).padStart(3, '0')}`}
    </span>
  );
}

/**
 * A juz's title as the mushaf heads it -- "الجزء الأول" -- drawn by the
 * ligature "juzNNN" in the common font. Hidden from assistive tech because the
 * tile around it already states the juz number.
 */
export function JuzTitle({ juz, className = '' }: { juz: number; className?: string }) {
  return (
    <span className={`font-quran-common ${className}`} aria-hidden="true">
      {`juz${String(juz).padStart(3, '0')}`}
    </span>
  );
}
