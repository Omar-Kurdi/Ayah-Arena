/**
 * Arabic normalization used only for *grading*. Displayed text is always the
 * untouched Uthmani string from the data file -- this module never feeds the
 * screen, only the comparison.
 *
 * The rule that matters: the exact same normalization runs over both the
 * expected ayah and whatever the reader typed. Internal consistency beats
 * orthographic purity, because a phone Arabic keyboard cannot produce Uthmani
 * script (wasla alef, dagger alef, pause marks) at all.
 *
 * Every codepoint below is written as an escape rather than a literal. Most of
 * these are invisible combining marks, and a bidi-reordered source line is
 * impossible to review.
 */

// Honorifics (0610-061A), harakat (064B-065F), tatweel (0640), Quranic
// annotation and pause marks (06D6-06ED, 08D3-08FF).
//
// Two codepoints in this neighbourhood are deliberately NOT stripped: wasla
// alef (0671) is a letter, and superscript "dagger" alef (0670) carries a long
// vowel that Uthmani script leaves out of the letter run. Stripping 0670 turns
// "mihaadan" into m-h-d while the keyboard spelling is m-h-a-d, and then
// nothing a reader types can ever match -- 170 of juz 30's 564 ayat diverge.
const MARKS = new RegExp(
  '[\\u0610-\\u061A\\u064B-\\u065F\\u0640\\u06D6-\\u06ED\\u08D3-\\u08FF]',
  'g'
);

// Dagger alef restores the long vowel. Sitting on an alef or alef maksura it
// replaces that letter ("adraaka"); anywhere else it is written out as a full
// alef after the letter it sits on ("mihaadan").
const DAGGER_ON_ALEF = new RegExp('[\\u0627\\u0649]\\u0670', 'g');
const DAGGER = new RegExp('\\u0670', 'g');

const LETTER_MAP: Record<string, string> = {
  'آ': 'ا', // alef madda       -> alef
  'أ': 'ا', // alef hamza above -> alef
  'إ': 'ا', // alef hamza below -> alef
  'ٱ': 'ا', // alef wasla       -> alef
  'ى': 'ي', // alef maksura     -> yeh
  'ة': 'ه', // teh marbuta      -> heh
  'ؤ': 'و', // waw hamza        -> waw
  'ئ': 'ي', // yeh hamza        -> yeh
  'ء': '', //       standalone hamza    dropped
};

const FOLDABLE = new RegExp(
  '[\\u0621\\u0622\\u0623\\u0624\\u0625\\u0626\\u0629\\u0649\\u0671]',
  'g'
);

// Arabic letters alef (0627) through yeh (064A). Everything else -- Latin text,
// punctuation, Arabic-Indic digits, verse-end symbols -- becomes a word break.
const NON_LETTER = new RegExp('[^\\u0627-\\u064A]', 'g');

// Uthmani marks an assimilated lam with shadda where the keyboard spelling
// doubles the letter ("al-layl" written with one lam vs two). Collapsing runs
// of a repeated letter on both sides makes the two spellings agree.
const DOUBLED = /(.)\1+/g;

/** Collapses one ayah (or one typed attempt) to a comparable letter string. */
export function normalizeArabic(input: string): string {
  if (!input) return '';

  return input
    .normalize('NFC')
    .replace(MARKS, '')
    .replace(DAGGER_ON_ALEF, 'ا')
    .replace(DAGGER, 'ا')
    .replace(FOLDABLE, (c) => LETTER_MAP[c] ?? c)
    .replace(NON_LETTER, ' ')
    .replace(DOUBLED, '$1')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizedWords(input: string): string[] {
  const normalized = normalizeArabic(input);
  return normalized ? normalized.split(' ') : [];
}

/** Bounded Levenshtein -- we only ever care whether the distance is <= 1. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (short.length === long.length) {
      i++; // substitution
      j++;
    } else {
      j++; // insertion in the longer string
    }
  }
  return edits + (long.length - j) + (short.length - i) <= 1;
}

/** True when the attempt contains Arabic script at all. Used for a gentle hint
 *  about keyboard layout -- never to reject an attempt. */
export function looksArabic(input: string): boolean {
  return new RegExp('[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]').test(input);
}
