import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExpectedAyah } from './score';

/**
 * Loads the verified Quran text bundled by scripts/fetch-quran.mjs and builds
 * the drill pool from it. No text is ever generated, paraphrased or edited
 * here -- this module only selects and pairs what the data files contain.
 *
 * Text is stored one file per surah, because the surah is the unit the app
 * works in: a pair is only ever two consecutive ayat of the same surah. A juz
 * is a division laid across that -- 19 surahs straddle a juz boundary -- so a
 * juz scope is assembled from the surah files it spans, and an ayah is always
 * looked up by its own key rather than through whichever juz it fell in.
 */

export interface Verse {
  key: string;
  surah: number;
  ayah: number;
  /** Uthmani script, as displayed. */
  uthmani: string;
  /** The standard written spelling. */
  imlaei: string;
  /** Undiacritized spelling -- what a phone Arabic keyboard produces. */
  simple: string;
  page: number;
  juz: number;
}

export interface SurahMeta {
  id: number;
  nameArabic: string;
  nameSimple: string;
  nameEnglish: string;
  versesCount: number;
  revelationPlace: string;
}

/** Surah metadata plus what the picker needs to describe it honestly. */
export interface SurahEntry extends SurahMeta {
  /** Every ayah but the last can be a prompt, so this is exact. */
  pairCount: number;
  juzFrom: number;
  juzTo: number;
}

export interface JuzSpan {
  id: number;
  nameSimple: string;
  from: number;
  to: number;
}

export interface JuzEntry {
  number: number;
  verseCount: number;
  pairCount: number;
  from: { key: string; surahId: number; surahName: string; ayah: number };
  to: { key: string; surahId: number; surahName: string; ayah: number };
  surahs: JuzSpan[];
}

export interface SourceMeta {
  name: string;
  url: string;
  scriptEdition: string;
  attribution: string;
}

export interface QuranIndex {
  fetchedAt: string;
  source: SourceMeta;
  verseCount: number;
  surahs: SurahEntry[];
  juz: JuzEntry[];
}

interface SurahFile {
  surah: number;
  fetchedAt: string;
  source: SourceMeta;
  meta: SurahMeta;
  verseCount: number;
  verses: Verse[];
}

export type ScopeType = 'juz' | 'surah';
export interface Scope {
  type: ScopeType;
  id: number;
}

/** A drill item: show `prompt`, recall `answer`. */
export interface AyahPair {
  id: string;
  prompt: Verse;
  answer: Verse;
  surah: SurahMeta;
}

export const SURAH_COUNT = 114;
export const JUZ_COUNT = 30;

const dataDir = () => join(process.cwd(), 'data');

let indexCache: QuranIndex | null = null;
const surahCache = new Map<number, SurahFile>();

export function loadIndex(): QuranIndex {
  indexCache ??= JSON.parse(
    readFileSync(join(dataDir(), 'index.json'), 'utf8')
  ) as QuranIndex;
  return indexCache;
}

function loadSurahFile(surah: number): SurahFile {
  const cached = surahCache.get(surah);
  if (cached) return cached;

  if (!Number.isInteger(surah) || surah < 1 || surah > SURAH_COUNT) {
    throw new Error(`surah ${surah} does not exist`);
  }

  const file = JSON.parse(
    readFileSync(join(dataDir(), 'surah', `${surah}.json`), 'utf8')
  ) as SurahFile;
  surahCache.set(surah, file);
  return file;
}

export function surahVerses(surah: number): Verse[] {
  return loadSurahFile(surah).verses;
}

export function surahMeta(surah: number): SurahMeta {
  return loadSurahFile(surah).meta;
}

export function surahEntries(): SurahEntry[] {
  return loadIndex().surahs;
}

export function juzEntries(): JuzEntry[] {
  return loadIndex().juz;
}

export function juzEntry(juz: number): JuzEntry {
  const entry = loadIndex().juz[juz - 1];
  if (!entry) throw new Error(`juz ${juz} does not exist`);
  return entry;
}

export function sourceMeta(): SourceMeta {
  return loadIndex().source;
}

/**
 * Resolves an ayah from its own key. Deliberately independent of juz: a
 * session scoped to a surah that straddles a boundary has no single juz to
 * look through, and old sessions stay resolvable because the key is all it
 * ever needs.
 */
export function verseByKey(key: string): Verse {
  const [surah, ayah] = key.split(':').map(Number);
  const verse = surahVerses(surah)[ayah - 1];
  if (!verse || verse.key !== key) throw new Error(`no ayah ${key}`);
  return verse;
}

export function isValidScope(scope: Scope): boolean {
  if (!Number.isInteger(scope.id)) return false;
  return scope.type === 'juz'
    ? scope.id >= 1 && scope.id <= JUZ_COUNT
    : scope.id >= 1 && scope.id <= SURAH_COUNT;
}

/** The (surah, first ayah, last ayah) runs a scope covers. */
function scopeSpans(scope: Scope): JuzSpan[] {
  if (scope.type === 'juz') return juzEntry(scope.id).surahs;
  const meta = surahMeta(scope.id);
  return [{ id: meta.id, nameSimple: meta.nameSimple, from: 1, to: meta.versesCount }];
}

/**
 * Builds every valid (prompt, answer) pair in a scope.
 *
 * Both ayat must belong to the same surah and be consecutive. Reciting across
 * a surah boundary is a different task from continuing a passage -- juz 30 is
 * 37 mostly-short surahs, and pairing blindly by position would make a large
 * share of the pool ask for the opening of the *next* surah. The last ayah of
 * each run is therefore never a prompt, which also keeps a juz drill inside
 * its own juz: juz 2 ends at 2:252 and never asks for 2:253.
 */
export function buildPairs(scope: Scope): AyahPair[] {
  const pairs: AyahPair[] = [];

  for (const span of scopeSpans(scope)) {
    const verses = surahVerses(span.id);
    const meta = surahMeta(span.id);

    for (let ayah = span.from; ayah < span.to; ayah++) {
      const prompt = verses[ayah - 1];
      const answer = verses[ayah];
      pairs.push({
        id: `${prompt.key}->${answer.key}`,
        prompt,
        answer,
        surah: meta,
      });
    }
  }

  return pairs;
}

/** How many rounds a scope can actually supply, straight from the index. */
export function scopePairCount(scope: Scope): number {
  return scope.type === 'juz'
    ? juzEntry(scope.id).pairCount
    : surahEntries()[scope.id - 1].pairCount;
}

export function scopeLabel(scope: Scope): string {
  return scope.type === 'juz'
    ? `Juz ${scope.id}`
    : (surahEntries()[scope.id - 1]?.nameSimple ?? `Surah ${scope.id}`);
}

/**
 * The ayah as grading needs it: shown back in mushaf orthography, accepted in
 * any of the three spellings the data file carries.
 *
 * All three are needed. Uthmani covers reciting from a mushaf. Imlaei is the
 * standard written form. The undiacritized form is what a phone Arabic keyboard
 * actually produces, and it differs from Imlaei on a large share of ayat -- the
 * dagger alef in words like "dhalika" is written in one and absent in the
 * other, and no local rule reconciles them.
 */
export function expectedAyah(verse: Verse): ExpectedAyah {
  return {
    display: verse.uthmani,
    accepted: [verse.imlaei, verse.simple, verse.uthmani],
  };
}

/** Fisher-Yates over a copy, so the caller's array is left alone. */
export function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
