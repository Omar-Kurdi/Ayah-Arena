import type { ReactNode } from 'react';
import { Rosette } from './Rosette';

/**
 * A page of the mushaf: the double-ruled frame, the surah banner, and the
 * ayah lines inside it.
 *
 * Everything a round consists of lives on one of these — the ayah you are
 * given and the line you answer on. They were two separate boxes before, which
 * said nothing about how they relate. On one page, the blank line reads as the
 * next line of the same passage, which is what it is.
 */
export function MushafPage({
  surahNameArabic,
  locative,
  children,
}: {
  surahNameArabic: string;
  locative: string;
  children: ReactNode;
}) {
  return (
    <section className="mushaf-page px-4 pb-6 pt-3 sm:px-7 sm:pb-8">
      <header className="cartouche pb-3">
        <p className="cartouche-name" lang="ar">
          {surahNameArabic}
        </p>
        <p className="marginal mt-0.5">{locative}</p>
      </header>
      <div className="pt-5">{children}</div>
    </section>
  );
}

/**
 * One ayah, closed by its numbered rosette. In right-to-left text the line ends
 * on the left, so that is where the marker lands — inline, exactly as printed.
 */
export function AyahLine({ text, marker }: { text: string; marker: number }) {
  return (
    <p className="ayah" lang="ar">
      {text}{' '}
      <span className="inline-block translate-y-1 px-1 align-baseline">
        <Rosette label={marker} state="done" size={26} numerals="arabic" />
      </span>
    </p>
  );
}

/** The rosette waiting at the end of the line still being written. */
export function PendingMarker({ marker }: { marker: number }) {
  return (
    <span className="line-marker">
      <Rosette label={marker} state="current" size={26} numerals="arabic" />
    </span>
  );
}
