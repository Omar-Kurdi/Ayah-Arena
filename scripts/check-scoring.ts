/**
 * Sanity checks for normalization and scoring, run against the whole Quran.
 *   npm run check
 *
 * The coverage checks run over all 6,236 ayat rather than a sample. Juz 30 is
 * short, late-revealed surahs; it does not exercise the disconnected letters
 * that stand as whole ayat, the long madd forms, or most of the wasla the rest
 * of the mushaf is full of.
 */
import { readFileSync } from 'node:fs';
import { normalizeArabic, normalizedWords, withinOneEdit } from '../src/lib/arabic.ts';
import { gradeTyped, gradeSelfReported } from '../src/lib/score.ts';
import { expectedAyah, buildPairs, verseByKey, scopePairCount } from '../src/lib/quran.ts';
import type { Verse } from '../src/lib/quran.ts';

const SURAH_COUNT = 114;
const allVerses: Verse[] = [];
for (let id = 1; id <= SURAH_COUNT; id++) {
  const file = JSON.parse(
    readFileSync(new URL(`../data/surah/${id}.json`, import.meta.url), 'utf8')
  ) as { verses: Verse[] };
  allVerses.push(...file.verses);
}
const total = allVerses.length.toLocaleString();
const byKey = new Map(allVerses.map((v) => [v.key, v]));

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
  } else {
    console.log(`  ok    ${name}`);
  }
}

const verse = (key: string): Verse => {
  const v = byKey.get(key);
  if (!v) throw new Error(`missing ${key} in the bundled data`);
  return v;
};

console.log('data');
check('every ayah of the Quran is bundled', allVerses.length === 6236, `got ${allVerses.length}`);
check(
  'an ayah is resolvable by key alone, without knowing its juz',
  verseByKey('2:255').ayah === 255 && verseByKey('2:255').surah === 2
);

console.log('\nscope');
// Juz boundaries cut through surahs -- 19 of them -- so a scope has to slice
// the surah, and a juz drill must never ask for an ayah outside its own juz.
const juz2 = buildPairs({ type: 'juz', id: 2 });
const surah2 = buildPairs({ type: 'surah', id: 2 });
check('juz 2 starts at 2:142, not at the start of Al-Baqarah', juz2[0].prompt.key === '2:142');
check(
  'juz 2 does not reach back into juz 1',
  !juz2.some((p) => p.prompt.key === '2:141'),
  'the juz 1 / juz 2 boundary leaked'
);
check(
  'juz 2 does not spill into juz 3',
  juz2[juz2.length - 1].answer.key === '2:252',
  `ends at ${juz2[juz2.length - 1].answer.key}`
);
check(
  'the same boundary pair is available when the whole surah is the scope',
  surah2.some((p) => p.prompt.key === '2:141' && p.answer.key === '2:142')
);
check(
  'a surah scope spans all of it, across every juz it touches',
  surah2.length === 285 && surah2[surah2.length - 1].answer.key === '2:286',
  `got ${surah2.length} pairs`
);
check(
  'no pair ever crosses a surah boundary',
  buildPairs({ type: 'juz', id: 30 }).every((p) => p.prompt.surah === p.answer.surah)
);
check(
  'the index pair counts match what is actually built',
  scopePairCount({ type: 'juz', id: 2 }) === juz2.length &&
    scopePairCount({ type: 'surah', id: 2 }) === surah2.length
);
// A scope that can supply no rounds would throw at startSession.
const emptyScopes = [
  ...Array.from({ length: 30 }, (_, i) => ({ type: 'juz' as const, id: i + 1 })),
  ...Array.from({ length: 114 }, (_, i) => ({ type: 'surah' as const, id: i + 1 })),
].filter((s) => scopePairCount(s) < 1);
check(
  'every juz and every surah can supply at least one round',
  emptyScopes.length === 0,
  `${emptyScopes.length} cannot`
);

console.log('normalization');
check('normalizer strips harakat', normalizeArabic('اَلْحَمْدُ') === 'الحمد');
check('normalizer folds wasla alef', normalizeArabic('ٱلْكَوْثَرَ') === 'الكوثر');
check('normalizer drops latin and punctuation', normalizeArabic('abc الحمد, 123') === 'الحمد');
check('normalizer folds teh marbuta', normalizeArabic('الجنة') === normalizeArabic('الجنه'));
check(
  'dagger alef is restored as a long vowel, not stripped',
  normalizeArabic(verse('78:6').uthmani).includes(normalizeArabic('مهادا')),
  normalizeArabic(verse('78:6').uthmani)
);
check(
  'shadda-assimilated lam matches the doubled keyboard spelling',
  normalizeArabic('ٱلَّيْلَ') === normalizeArabic('الليل')
);
check('edit distance: identical', withinOneEdit('الحمد', 'الحمد'));
check('edit distance: one substitution', withinOneEdit('الحمد', 'الحمر'));
check('edit distance: one insertion', withinOneEdit('الحمد', 'الحمدد'));
check('edit distance: two edits rejected', !withinOneEdit('الحمد', 'الخمر'));

console.log('\nspelling coverage');
// The property that actually has to hold: whichever of the three spellings a
// reader reproduces, they are graded as fully correct.
const shortfall = {
  imlaei: [] as string[],
  simple: [] as string[],
  uthmani: [] as string[],
};
for (const v of allVerses) {
  const expected = expectedAyah(v);
  if (gradeTyped(expected, v.imlaei, 20_000).accuracy < 1) shortfall.imlaei.push(v.key);
  if (gradeTyped(expected, v.simple, 20_000).accuracy < 1) shortfall.simple.push(v.key);
  if (gradeTyped(expected, v.uthmani, 20_000).accuracy < 1) shortfall.uthmani.push(v.key);
}
check(
  `keyboard spelling scores 100% on all ${total} ayat`,
  shortfall.imlaei.length === 0,
  `${shortfall.imlaei.length} fell short, e.g. ${shortfall.imlaei.slice(0, 5).join(', ')}`
);
check(
  `undiacritized keyboard spelling scores 100% on all ${total} ayat`,
  shortfall.simple.length === 0,
  `${shortfall.simple.length} fell short, e.g. ${shortfall.simple.slice(0, 5).join(', ')}`
);
check(
  `mushaf spelling scores 100% on all ${total} ayat`,
  shortfall.uthmani.length === 0,
  `${shortfall.uthmani.length} fell short, e.g. ${shortfall.uthmani.slice(0, 5).join(', ')}`
);

// A hifz student must always be shown the spelling their mushaf uses, whichever
// spelling they typed. Run over every ayah, not a sample: if normalization ever
// splits a display word differently from a plain whitespace split, the fallback
// in gradeTyped quietly shows undiacritized words for that one ayah.
const wrongScript: string[] = [];
for (const v of allVerses) {
  const shown = gradeTyped(expectedAyah(v), v.simple, 20_000).words.map((w) => w.word);
  // Standalone pause marks are their own token in Uthmani text. They are not
  // words and carry no recall status, so they are expected to be absent.
  const words = v.uthmani.trim().split(/\s+/).filter((t) => normalizeArabic(t) !== '');
  if (shown.join(' ') !== words.join(' ')) wrongScript.push(v.key);
}
check(
  `a keyboard attempt is shown the mushaf spelling on all ${total} ayat`,
  wrongScript.length === 0,
  `${wrongScript.length} came back in the wrong script, e.g. ${wrongScript.slice(0, 5).join(', ')}`
);

console.log('\nscoring');
const kawthar = verse('108:2');
const perfect = gradeTyped(expectedAyah(kawthar), kawthar.simple, 12_000);
check('perfect recall scores 100% accuracy', perfect.accuracy === 1, `got ${perfect.accuracy}`);
check('perfect recall earns a speed bonus', perfect.points > 100, `got ${perfect.points}`);
check('every word marked exact', perfect.words.every((w) => w.status === 'exact'));

const slow = gradeTyped(expectedAyah(kawthar), kawthar.simple, 60_000);
check('slow but perfect still scores a full 100 points', slow.points === 100, `got ${slow.points}`);

const naba = verse('78:2');
const typo = gradeTyped(expectedAyah(naba), naba.simple.replace(/.$/, ''), 15_000);
check('a one-letter typo stays above 90%', typo.accuracy > 0.9, `got ${typo.accuracy.toFixed(2)}`);
check('typo word is marked close, not missed', typo.words.some((w) => w.status === 'close'));

const long = verse('78:6');
const half = normalizedWords(long.simple);
const partial = gradeTyped(
  expectedAyah(long),
  half.slice(0, Math.ceil(half.length / 2)).join(' '),
  20_000
);
check(
  'half an ayah scores roughly half',
  partial.accuracy >= 0.35 && partial.accuracy <= 0.7,
  `got ${partial.accuracy.toFixed(2)}`
);
check('partial recall still credits what was remembered', partial.exactCount > 0);

const empty = gradeTyped(expectedAyah(kawthar), '', 5_000);
check('empty attempt scores 0 without throwing', empty.accuracy === 0 && empty.points === 0);
check('empty attempt still returns the full ayah for review', empty.words.length > 0);

const wrong = gradeTyped(expectedAyah(kawthar), verse('112:1').simple, 10_000);
check('an unrelated ayah scores low', wrong.accuracy < 0.35, `got ${wrong.accuracy.toFixed(2)}`);

const latin = gradeTyped(expectedAyah(kawthar), 'fasalli lirabbika wanhar', 10_000);
check('transliteration scores 0 rather than crashing', latin.accuracy === 0);

console.log('\nself-reported grading');
const gotIt = gradeSelfReported('got_it', 9_000);
check('got_it is full credit', gotIt.accuracy === 1 && gotIt.points > 100);
const notYet = gradeSelfReported('not_yet', 9_000);
check('not_yet still scores above zero', notYet.accuracy > 0 && notYet.points > 0);
check('not_yet earns no speed bonus', notYet.points === Math.round(notYet.accuracy * 100));
check(
  'self-reported rounds invent no per-word marking',
  gotIt.words.length === 0 && notYet.words.length === 0
);

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
