/**
 * Provisions what the listener end-to-end test needs, outside Git:
 *
 *   .cache/listener/audio/<surah>_<ayah>.wav   a recitation for the fake mic
 *   .cache/listener/model/                      the speech model, mirrored
 *
 * Neither belongs in the repository: the audio is someone else's recording and
 * the model is ~196MB. Both are fetched from pinned sources and are identical
 * on every machine, so CI can cache them by the key this script prints.
 *
 *   node scripts/listener-fixtures.mjs audio    # ~100KB, needs ffmpeg
 *   node scripts/listener-fixtures.mjs key      # the cache key for CI
 *
 * The model itself is mirrored lazily by the test run (tests/e2e/model-mirror),
 * because only the browser knows which files this dtype combination needs.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE = join(ROOT, '.cache', 'listener');
export const AUDIO_DIR = join(CACHE, 'audio');
export const MODEL_DIR = join(CACHE, 'model');

/**
 * The model the worker loads, pinned to a commit so the test cannot change
 * underneath us. Production asks for the default branch; the test mirror
 * serves this revision for those requests, and the cache key names it.
 */
export const MODEL = {
  id: 'eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran',
  revision: '86aa2ae915f3b11c60b4c031774a7b5123477ba5',
};

/**
 * Al-'Asr 2 -- "inna al-insana lafee khusr" -- recited by Alafasy, from the
 * Quran.com verse audio. Four seconds, and the second ayah of a three-ayah
 * surah, so a drill scoped to Al-'Asr can ask for it.
 */
export const FIXTURE = { surah: 103, ayah: 2, reciter: 7, reciterName: 'Alafasy' };

export const fixtureWav = () => join(AUDIO_DIR, `${FIXTURE.surah}_${FIXTURE.ayah}.wav`);

async function fetchAudio() {
  mkdirSync(AUDIO_DIR, { recursive: true });
  const wav = fixtureWav();
  if (existsSync(wav)) {
    console.log(`audio already there: ${wav}`);
    return;
  }

  const key = `${FIXTURE.surah}:${FIXTURE.ayah}`;
  const meta = await (
    await fetch(`https://api.quran.com/api/v4/recitations/${FIXTURE.reciter}/by_ayah/${key}`)
  ).json();
  const relative = meta.audio_files?.[0]?.url;
  if (!relative) throw new Error(`no recitation for ${key}`);
  const url = relative.startsWith('http') ? relative : `https://verses.quran.com/${relative}`;

  // The host comes back from an API response, so it is checked rather than
  // trusted: this script only ever fetches Quran.com's own verse audio.
  const { hostname } = new URL(url);
  if (!['verses.quran.com', 'audio.qurancdn.com', 'download.quranicaudio.com'].includes(hostname)) {
    throw new Error(`refusing to fetch audio from ${hostname}`);
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  const mp3 = join(AUDIO_DIR, `${FIXTURE.surah}_${FIXTURE.ayah}.mp3`);
  writeFileSync(mp3, Buffer.from(await response.arrayBuffer()));

  // Chromium's fake microphone reads 16-bit PCM WAV and loops it.
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
  console.log(`audio ready: ${wav}`);
}

/** Stable across machines, and changes when the model revision does. */
export const cacheKey = () => `listener-${MODEL.id.replace('/', '--')}-${MODEL.revision}-${FIXTURE.surah}_${FIXTURE.ayah}`;

const commands = {
  audio: fetchAudio,
  key: async () => console.log(cacheKey()),
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = commands[process.argv[2] ?? 'audio'];
  if (!command) {
    console.error(`usage: node scripts/listener-fixtures.mjs [${Object.keys(commands).join('|')}]`);
    process.exit(2);
  }
  await command();
}
