'use client';

import { useEffect, useRef } from 'react';
import { Rosette } from '../Rosette';
import { AyahLine, PendingMarker, MARKER_SIZE } from '../MushafPage';
import { AyahRecall } from '../AyahRecall';
import type { AnswerPayload } from '@/lib/drill';
import type { Grade } from '@/lib/score';

/**
 * The second line of the mushaf page: the one the reader fills in.
 *
 * It is written on in typed mode and filled in for them otherwise, and it is
 * the same line either way -- which is the whole point of the page. Blank
 * while a reciter is still reciting; marked once there is something to mark.
 */

/**
 * The writing line's own behaviour: it takes the cursor when a round starts,
 * and it grows to hold the whole ayah rather than scrolling inside itself.
 * Ayat outside juz 30 run long, and a reader has to be able to see what they
 * have written — a page of a mushaf adds lines, it does not scroll.
 */
function useWritingLine(text: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return ref;
}

/** Typed mode: the line is a writing line, ruled like the page above it. */
export function WritingLine({
  text,
  onText,
  onSubmit,
  marker,
  label,
}: {
  text: string;
  onText: (text: string) => void;
  onSubmit: () => void;
  marker: number;
  label: string;
}) {
  const inputRef = useWritingLine(text);

  return (
    <>
      <label htmlFor="attempt" className="sr-only">
        {label}
      </label>
      <textarea
        id="attempt"
        ref={inputRef}
        dir="rtl"
        lang="ar"
        rows={2}
        value={text}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="writing-line grow"
      />
      <PendingMarker marker={marker} />
    </>
  );
}

/**
 * Every other mode, and typed mode once the attempt is in: the ayah itself
 * with its marks, the ayah plainly, or a line still waiting for it.
 */
export function RevealedLine({
  recall,
  answer,
  marker,
}: {
  recall: Grade['words'] | null;
  answer: AnswerPayload | null;
  marker: number;
}) {
  if (recall && answer) {
    return (
      <p className="ayah grow">
        <AyahRecall words={recall} glyphs={answer.glyphs} text={answer.uthmani} />{' '}
        <span className="inline-block translate-y-[0.2em] px-1 align-baseline">
          <Rosette label={answer.ayahNumber} state="done" size={MARKER_SIZE} numerals="arabic" />
        </span>
      </p>
    );
  }

  if (answer) {
    return (
      <div className="grow">
        <AyahLine glyphs={answer.glyphs} text={answer.uthmani} marker={marker} />
      </div>
    );
  }

  return (
    <>
      <div className="writing-line grow" aria-hidden="true" />
      <PendingMarker marker={marker} />
    </>
  );
}
