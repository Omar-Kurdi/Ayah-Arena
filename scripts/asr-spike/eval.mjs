/**
 * Step 0 of the recitation plan: before building any UI, can the on-device
 * Quran speech model tell a correct recitation from a wrong one, using the
 * app's own gentle grader?
 *
 *   cd scripts/asr-spike && npm install
 *   cd ../.. && node --import ./scripts/ts-resolve.mjs scripts/asr-spike/eval.mjs [ayatCount]
 *   node --import ./scripts/ts-resolve.mjs scripts/asr-spike/eval.mjs --dir ~/recordings
 *
 * The default run uses professional reciters from Quran.com. Those are very
 * likely in the model's training data (Tarteel's EveryAyah set), so a clean
 * score there proves the pipeline, not the product. The question that decides
 * the feature -- does it work for a beginner on a phone mic -- is answered by
 * --dir: a folder of your own recordings named <surah>_<ayah>.<ext>, e.g.
 * 67_2.m4a for Al-Mulk 2 (any format ffmpeg reads).
 *
 * For each sampled ayah and reciter it transcribes the audio and grades the
 * transcript two ways:
 *   - against the ayah actually recited   -> should score high (a true accept)
 *   - against the ayah that follows it    -> should score low  (a false accept
 *     if it doesn't: the likeliest mix-up in a drill is reciting one ayah on)
 *
 * The model is never shown the expected text. That would bias it toward
 * "correct" and make the check dishonest.
 *
 * Needs ffmpeg on PATH to decode mp3. Audio and model files are cached under
 * scripts/asr-spike/.cache, which is gitignored.
 */

import { pipeline, env } from '@huggingface/transformers';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradeTyped } from '../../src/lib/score.ts';
import { expectedAyah, surahVerses, verseByKey } from '../../src/lib/quran.ts';

const HERE = new URL('.', import.meta.url).pathname;
const CACHE = join(HERE, '.cache');
env.cacheDir = CACHE;

// The whisper-base Quran fine-tune from Tarteel (Apache-2.0), in the ONNX form
// transformers.js loads. The int8 encoder needs an operator onnxruntime's CPU
// backend lacks, so the encoder runs in fp32 and the decoder in 4-bit.
const MODEL = 'eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran';
const DTYPE = { encoder_model: 'fp32', decoder_model_merged: 'q4' };

// Whisper hears 30 seconds at a time. Longer ayat need chunking, which is its
// own design problem; this spike counts them and leaves them out.
const MAX_SECONDS = 29;

// The app shows "That's the ayah." at 85% and above -- the bar that matters.
const HELD = 0.85;

const RECITERS = [
  { id: 7, name: 'Alafasy', style: 'murattal' },
  { id: 6, name: 'Husary', style: 'murattal' },
  { id: 9, name: 'Minshawi', style: 'murattal' },
  { id: 1, name: 'AbdulBaset', style: 'mujawwad' },
];

/** Deterministic sample so reruns compare like with like. */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A third from juz 30 -- where most readers start -- and the rest from the
 *  whole mushaf. Every pick has a following ayah to serve as the wrong answer. */
function sample(count) {
  const rand = mulberry32(20260919);
  const all = [];
  for (let s = 1; s <= 114; s++) {
    const verses = surahVerses(s);
    for (let i = 0; i < verses.length - 1; i++) all.push({ verse: verses[i], next: verses[i + 1] });
  }
  const amma = all.filter((x) => x.verse.juz === 30);
  const rest = all.filter((x) => x.verse.juz !== 30);
  const pick = (pool, n) => {
    const chosen = new Set();
    while (chosen.size < Math.min(n, pool.length)) chosen.add(Math.floor(rand() * pool.length));
    return [...chosen].map((i) => pool[i]);
  };
  const fromAmma = Math.round(count / 3);
  return [...pick(amma, fromAmma), ...pick(rest, count - fromAmma)];
}

/** The audio host drops connections under a burst of requests; retry rather
 *  than let a flaky fetch silently shrink the sample. */
async function fetchRetry(url, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url);
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

async function audioFor(reciter, key) {
  const dir = join(CACHE, 'audio', String(reciter.id));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${key.replace(':', '_')}.mp3`);
  if (!existsSync(file)) {
    const meta = await (
      await fetchRetry(`https://api.quran.com/api/v4/recitations/${reciter.id}/by_ayah/${key}`)
    ).json();
    const rel = meta.audio_files?.[0]?.url;
    if (!rel) throw new Error(`no audio for ${key} by ${reciter.name}`);
    const url = rel.startsWith('//') ? `https:${rel}` : rel.startsWith('http') ? rel : `https://verses.quran.com/${rel}`;
    const res = await fetchRetry(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return decode(file);
}

function decode(file) {
  const pcm = execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'],
    { maxBuffer: 1 << 28 }
  );
  return new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
}

/** Your own recordings: <surah>_<ayah>.<ext>. The wrong answer is the ayah
 *  after it, or before it for a surah's last ayah. */
function ownRecordings(dir) {
  return readdirSync(dir)
    .map((name) => ({ name, m: name.match(/^(\d+)_(\d+)\.\w+$/) }))
    .filter(({ m }) => m)
    .map(({ name, m }) => {
      const verse = verseByKey(`${Number(m[1])}:${Number(m[2])}`);
      const verses = surahVerses(verse.surah);
      const next = verses[verse.ayah] ?? verses[verse.ayah - 2];
      return { verse, next, file: join(dir, name) };
    });
}

const pct = (x) => `${Math.round(x * 100)}%`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function main() {
  const dirFlag = process.argv.indexOf('--dir');
  const own = dirFlag > -1 ? ownRecordings(process.argv[dirFlag + 1]) : null;
  const picks = own ?? sample(Number(process.argv[2] ?? 30));
  const reciters = own ? [{ id: 0, name: 'you', style: 'own recordings' }] : RECITERS;
  const asr = await pipeline('automatic-speech-recognition', MODEL, { dtype: DTYPE });

  const rows = [];
  const tooLong = [];
  for (const reciter of reciters) {
    for (const { verse, next, file } of picks) {
      let audio;
      try {
        audio = file ? decode(file) : await audioFor(reciter, verse.key);
      } catch (err) {
        console.log(`  skip ${reciter.name} ${verse.key}: ${err.message}`);
        continue;
      }
      const seconds = audio.length / 16000;
      if (seconds > MAX_SECONDS) {
        tooLong.push({ reciter: reciter.name, key: verse.key, seconds: +seconds.toFixed(1) });
        continue;
      }
      const started = Date.now();
      const { text } = await asr(audio);
      const ms = Date.now() - started;

      const right = gradeTyped(expectedAyah(verse), text, 20_000).accuracy;
      const wrong = gradeTyped(expectedAyah(next), text, 20_000).accuracy;
      rows.push({
        reciter: reciter.name,
        style: reciter.style,
        key: verse.key,
        amma: verse.juz === 30,
        seconds: +seconds.toFixed(1),
        ms,
        right,
        wrong,
        transcript: text.trim(),
      });
      process.stdout.write(
        `\r${reciter.name.padEnd(11)} ${verse.key.padEnd(8)} right ${pct(right).padStart(4)}  wrong ${pct(wrong).padStart(4)}   `
      );
    }
  }
  process.stdout.write('\n\n');

  const report = (label, set) => {
    if (!set.length) return;
    const trueAccept = set.filter((r) => r.right >= HELD).length / set.length;
    const falseAccept = set.filter((r) => r.wrong >= HELD).length / set.length;
    const rtf = mean(set.map((r) => r.ms / 1000 / r.seconds));
    console.log(
      `${label.padEnd(24)} n=${String(set.length).padStart(3)}  held ${pct(trueAccept).padStart(4)}  ` +
        `mean ${pct(mean(set.map((r) => r.right))).padStart(4)}  false-accept ${pct(falseAccept).padStart(3)}  ` +
        `wrong-mean ${pct(mean(set.map((r) => r.wrong))).padStart(4)}  ${rtf.toFixed(2)}x realtime`
    );
  };

  console.log(`correct recitation scoring >= ${pct(HELD)} is "held"; the wrong-ayah column should stay low\n`);
  report('all', rows);
  for (const reciter of reciters) report(`${reciter.name} (${reciter.style})`, rows.filter((r) => r.reciter === reciter.name));
  report('juz 30 ayat', rows.filter((r) => r.amma));
  report('rest of the mushaf', rows.filter((r) => !r.amma));
  console.log(`\nleft out as over ${MAX_SECONDS}s (needs chunking): ${tooLong.length}`);

  const misses = rows.filter((r) => r.right < HELD).sort((a, b) => a.right - b.right);
  if (misses.length) {
    console.log('\nlowest-scoring correct recitations:');
    for (const r of misses.slice(0, 8)) console.log(`  ${r.reciter.padEnd(11)} ${r.key.padEnd(8)} ${pct(r.right).padStart(4)}  "${r.transcript}"`);
  }

  writeFileSync(
    join(HERE, own ? 'results-own.json' : 'results.json'),
    JSON.stringify({ model: MODEL, dtype: DTYPE, heldAt: HELD, ranAt: new Date().toISOString(), tooLong, rows }, null, 2) + '\n'
  );
  console.log(`\nfull results -> scripts/asr-spike/${own ? 'results-own.json' : 'results.json'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
