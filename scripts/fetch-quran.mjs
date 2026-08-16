#!/usr/bin/env node
/**
 * Fetches verified Quran text from the Quran.com API (v4) into data/surah/<n>.json
 * and builds data/index.json from what was fetched. Nothing in this app ever
 * generates or paraphrases ayah text -- every character displayed comes from
 * these files, and these files come only from the API response below.
 *
 *   npm run fetch:quran              # all 114 surahs
 *   npm run fetch:quran -- 2 112     # refresh those two, then rebuild the index
 *
 * Storage is by surah rather than by juz because a surah is the unit the app
 * actually works in: pairs are only ever built within one surah, and juz
 * boundaries cut straight through surahs (juz 2 starts at 2:142, mid-Baqarah).
 * Juz membership is carried per ayah by the API, so the juz view is derived
 * here rather than fetched separately -- one source of truth for both.
 */

import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.quran.com/api/v4';
const SURAH_COUNT = 114;
const TOTAL_AYAT = 6236;

const SOURCE = {
  name: 'Quran.com API v4',
  url: 'https://api.quran.com/api/v4',
  scriptEdition: 'Uthmani (Tanzil / King Fahd Complex, via Quran.com)',
  attribution: 'Quran text via Quran.com (Tanzil.net Uthmani edition)',
};

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchChapters() {
  const { chapters } = await api('/chapters?language=en');
  if (chapters.length !== SURAH_COUNT) {
    throw new Error(`expected ${SURAH_COUNT} chapters, got ${chapters.length}`);
  }
  const byId = new Map();
  for (const c of chapters) {
    byId.set(c.id, {
      id: c.id,
      nameArabic: c.name_arabic,
      nameSimple: c.name_simple,
      nameEnglish: c.translated_name?.name ?? c.name_simple,
      versesCount: c.verses_count,
      revelationPlace: c.revelation_place,
    });
  }
  return byId;
}

/** Walks every page -- silent truncation is the main failure mode here, so the
 *  result is checked against both the API's own count and the chapter metadata. */
async function fetchSurahVerses(surah, expectedCount) {
  const fields = 'text_uthmani,text_imlaei,text_imlaei_simple';
  const verses = [];
  let page = 1;
  let reported = null;

  for (;;) {
    const data = await api(
      `/verses/by_chapter/${surah}?fields=${fields}&per_page=50&page=${page}`
    );
    verses.push(...data.verses);
    reported ??= data.pagination.total_records;
    if (!data.pagination.next_page) break;
    page = data.pagination.next_page;
  }

  if (verses.length !== reported) {
    throw new Error(`surah ${surah}: fetched ${verses.length} but API reported ${reported}`);
  }
  if (verses.length !== expectedCount) {
    throw new Error(
      `surah ${surah}: fetched ${verses.length} but chapter metadata says ${expectedCount}`
    );
  }
  return verses;
}

function buildSurah(meta, rawVerses) {
  const verses = rawVerses.map((v) => {
    const [surah, ayah] = v.verse_key.split(':').map(Number);
    return {
      key: v.verse_key,
      surah,
      ayah,
      // Displayed to the reader, exactly as the API returned it.
      uthmani: v.text_uthmani.trim(),
      // The standard written spelling.
      imlaei: v.text_imlaei.trim(),
      // What a phone Arabic keyboard actually produces.
      simple: v.text_imlaei_simple.trim(),
      page: v.page_number,
      juz: v.juz_number,
    };
  });

  // Ayat must be this surah's, unique, contiguous from 1, and non-empty in
  // every spelling -- an empty field would silently become an ungradeable ayah.
  verses.forEach((v, i) => {
    if (v.surah !== meta.id) throw new Error(`surah ${meta.id}: got a verse from ${v.surah}`);
    if (v.ayah !== i + 1) throw new Error(`surah ${meta.id}: ayah ${v.ayah} out of sequence`);
    if (!v.uthmani || !v.imlaei || !v.simple) {
      throw new Error(`surah ${meta.id}: empty text for ${v.key}`);
    }
    if (!Number.isInteger(v.juz) || v.juz < 1 || v.juz > 30) {
      throw new Error(`surah ${meta.id}: ${v.key} has juz ${v.juz}`);
    }
  });

  return {
    surah: meta.id,
    fetchedAt: new Date().toISOString(),
    source: SOURCE,
    meta,
    verseCount: verses.length,
    verses,
  };
}

const surahPath = (n) => resolve(ROOT, `data/surah/${n}.json`);

/**
 * Builds the picker's index from every surah file on disk. Kept separate from
 * fetching so a partial refresh still produces an index consistent with the
 * whole set -- and so it fails loudly if a surah is missing.
 */
async function buildIndex() {
  const surahs = [];
  const juzMap = new Map();
  let verseCount = 0;

  for (let id = 1; id <= SURAH_COUNT; id++) {
    let file;
    try {
      file = JSON.parse(await readFile(surahPath(id), 'utf8'));
    } catch {
      throw new Error(`data/surah/${id}.json is missing -- run without arguments to fetch all`);
    }

    const { meta, verses } = file;
    verseCount += verses.length;

    const juzNumbers = [...new Set(verses.map((v) => v.juz))].sort((a, b) => a - b);
    surahs.push({
      ...meta,
      // Every surah pairs every ayah but its last, so this is exact.
      pairCount: verses.length - 1,
      juzFrom: juzNumbers[0],
      juzTo: juzNumbers[juzNumbers.length - 1],
    });

    for (const v of verses) {
      if (!juzMap.has(v.juz)) juzMap.set(v.juz, []);
      juzMap.get(v.juz).push(v);
    }
  }

  if (verseCount !== TOTAL_AYAT) {
    throw new Error(`expected ${TOTAL_AYAT} ayat in total, indexed ${verseCount}`);
  }

  const nameOf = (id) => surahs[id - 1].nameSimple;

  const juz = [];
  for (let n = 1; n <= 30; n++) {
    const verses = juzMap.get(n);
    if (!verses?.length) throw new Error(`no ayat found for juz ${n}`);
    verses.sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);

    // A juz slice can begin or end mid-surah, so its span is recorded per surah.
    const spans = [];
    for (const v of verses) {
      const last = spans[spans.length - 1];
      if (last && last.id === v.surah) last.to = v.ayah;
      else spans.push({ id: v.surah, nameSimple: nameOf(v.surah), from: v.ayah, to: v.ayah });
    }

    // Pairs inside a juz never cross out of it: the last ayah of the slice is
    // not a prompt, exactly as the last ayah of a surah is not.
    const pairCount = spans.reduce((sum, s) => sum + (s.to - s.from), 0);
    const first = verses[0];
    const last = verses[verses.length - 1];

    juz.push({
      number: n,
      verseCount: verses.length,
      pairCount,
      from: { key: first.key, surahId: first.surah, surahName: nameOf(first.surah), ayah: first.ayah },
      to: { key: last.key, surahId: last.surah, surahName: nameOf(last.surah), ayah: last.ayah },
      surahs: spans,
    });
  }

  return { fetchedAt: new Date().toISOString(), source: SOURCE, verseCount, surahs, juz };
}

async function main() {
  const args = process.argv.slice(2).map(Number);
  for (const n of args) {
    if (!Number.isInteger(n) || n < 1 || n > SURAH_COUNT) {
      throw new Error(`invalid surah: ${n} (expected 1-${SURAH_COUNT})`);
    }
  }
  const targets = args.length
    ? args
    : Array.from({ length: SURAH_COUNT }, (_, i) => i + 1);

  const chapters = await fetchChapters();
  await mkdir(resolve(ROOT, 'data/surah'), { recursive: true });

  for (const id of targets) {
    const meta = chapters.get(id);
    if (!meta) throw new Error(`missing chapter metadata for surah ${id}`);

    const raw = await fetchSurahVerses(id, meta.versesCount);
    const built = buildSurah(meta, raw);
    await writeFile(surahPath(id), JSON.stringify(built) + '\n', 'utf8');
    process.stdout.write(
      `\r${String(id).padStart(3)}/${SURAH_COUNT}  ${meta.nameSimple.padEnd(18)} ${String(built.verseCount).padStart(3)} ayat   `
    );
  }
  process.stdout.write('\n');

  const index = await buildIndex();
  await writeFile(resolve(ROOT, 'data/index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(
    `indexed ${index.verseCount} ayat across ${index.surahs.length} surahs and ${index.juz.length} juz -> data/index.json`
  );

  // The old by-juz layout would otherwise sit alongside this one as a second,
  // staler source of the same text.
  await rm(resolve(ROOT, 'data/juz'), { recursive: true, force: true });
}

main().catch((err) => {
  console.error(`\nfetch failed: ${err.message}`);
  process.exit(1);
});
