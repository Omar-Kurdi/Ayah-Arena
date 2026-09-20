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
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
 * Quran.com verse audio. Six seconds, and the second ayah of a three-ayah
 * surah, so a drill scoped to Al-'Asr can ask for it.
 *
 * The URL is written out rather than looked up through the API: one fewer
 * service between CI and a fixture, and the digest below makes the bytes
 * verifiable. If either the file or the host changes, the download fails
 * loudly instead of quietly recording something else.
 */
export const FIXTURE = {
  surah: 103,
  ayah: 2,
  reciterName: 'Alafasy',
  url: 'https://verses.quran.com/Alafasy/mp3/103002.mp3',
  sha256: 'a0e02b3390e81caaf41e3db0e63d95843305fd0b28938e81d19c938e01e5b7da',
};

/** What Chromium's fake capture device needs: 16kHz mono 16-bit PCM. */
const WAV_FORMAT = { sampleRate: 16_000, channels: 1, bitsPerSample: 16 };

export const fixtureWav = () => join(AUDIO_DIR, `${FIXTURE.surah}_${FIXTURE.ayah}.wav`);

async function fetchAudio() {
  mkdirSync(AUDIO_DIR, { recursive: true });
  const wav = fixtureWav();
  if (existsSync(wav)) {
    checkWav(wav);
    console.log(`audio already there: ${wav}`);
    return;
  }

  // ffmpeg is the one tool this needs and several CI images do not ship it,
  // so say so plainly rather than failing inside a spawn.
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'ffmpeg is not installed, and the recitation has to be converted to WAV.\n' +
        '  Fedora/Bazzite: sudo dnf install ffmpeg   Debian/Ubuntu: sudo apt-get install ffmpeg'
    );
  }

  const mp3 = join(AUDIO_DIR, `${FIXTURE.surah}_${FIXTURE.ayah}.mp3`);
  writeFileSync(mp3, await downloadRecitation());

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', mp3,
    '-ac', String(WAV_FORMAT.channels),
    '-ar', String(WAV_FORMAT.sampleRate),
    '-c:a', 'pcm_s16le',
    wav,
  ]);

  checkWav(wav);
  console.log(`audio ready: ${wav}`);
}

/** The pinned recitation, checked against the digest this fixture expects. */
async function downloadRecitation() {
  const { hostname } = new URL(FIXTURE.url);
  if (hostname !== 'verses.quran.com') {
    throw new Error(`refusing to fetch audio from ${hostname}`);
  }

  const response = await fetch(FIXTURE.url);
  if (!response.ok) throw new Error(`${FIXTURE.url} -> ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());

  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== FIXTURE.sha256) {
    throw new Error(
      `the recitation at ${FIXTURE.url} is not the one this fixture pins\n` +
        `  expected ${FIXTURE.sha256}\n  received ${digest}`
    );
  }
  return bytes;
}

/** Reads the WAV header, so a wrong format fails here and not in the browser. */
function checkWav(path) {
  const header = readFileSync(path).subarray(0, 44);
  const format = {
    riff: header.toString('ascii', 0, 4),
    wave: header.toString('ascii', 8, 12),
    audioFormat: header.readUInt16LE(20),
    channels: header.readUInt16LE(22),
    sampleRate: header.readUInt32LE(24),
    bitsPerSample: header.readUInt16LE(34),
  };

  const wrong =
    format.riff !== 'RIFF' ||
    format.wave !== 'WAVE' ||
    format.audioFormat !== 1 || // 1 is uncompressed PCM
    format.channels !== WAV_FORMAT.channels ||
    format.sampleRate !== WAV_FORMAT.sampleRate ||
    format.bitsPerSample !== WAV_FORMAT.bitsPerSample;

  if (wrong) throw new Error(`${path} is not 16kHz mono 16-bit PCM: ${JSON.stringify(format)}`);
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
