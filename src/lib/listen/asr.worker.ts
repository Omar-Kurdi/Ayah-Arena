/**
 * The on-device listener: Tarteel's Quran fine-tune of Whisper (Apache-2.0),
 * run by transformers.js in a worker so decoding never freezes the page.
 *
 * It is only ever asked what words it heard. It is never shown the expected
 * ayah -- that would bias it toward "correct" -- and its output is used only
 * to grade, never displayed: a machine transcript of recitation is not Quran
 * text and must not be shown as if it were.
 */

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// Models come from the Hugging Face hub and are kept in the browser's cache,
// so the download happens once. There is no local copy to look for first.
env.allowLocalModels = false;

const MODEL = 'eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran';
// The int8 encoder in this conversion uses an operator onnxruntime cannot
// run, so the encoder stays fp32 and the decoder is 4-bit.
const DTYPE = { encoder_model: 'fp32', decoder_model_merged: 'q4' } as const;

// Whisper hears 30 seconds at a time; longer ayat are heard in overlapping
// windows and stitched.
const WINDOW_SAMPLES = 30 * 16_000;

export type ToWorker = { type: 'load' } | { type: 'transcribe'; id: number; audio: Float32Array };
export type FromWorker =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'text'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };

const post = (msg: FromWorker) => self.postMessage(msg);

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asr) return asr;

  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (event: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (event.status !== 'progress' || !event.file || !event.total) return;
    files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    post({ type: 'progress', loaded, total });
  };

  // Typed loosely on purpose: pipeline()'s overloads are too wide for tsc.
  const create = pipeline as (task: string, model: string, options: object) => Promise<unknown>;
  const make = (device: 'webgpu' | 'wasm') =>
    create('automatic-speech-recognition', MODEL, {
      dtype: DTYPE,
      device,
      progress_callback,
    }) as Promise<AutomaticSpeechRecognitionPipeline>;

  // WebGPU where the browser has it, which is much faster; plain WebAssembly
  // otherwise, or if the GPU path refuses this model.
  // A browser can expose navigator.gpu and still have no usable adapter, so
  // ask for one first rather than letting onnxruntime fail on it.
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const hasGpu = gpu ? gpu.requestAdapter().then(Boolean, () => false) : Promise.resolve(false);
  asr = hasGpu.then((ok) => (ok ? make('webgpu').catch(() => make('wasm')) : make('wasm'))).catch((err) => {
    asr = null;
    throw err;
  });
  return asr;
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === 'load') {
    try {
      await load();
      post({ type: 'ready' });
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  try {
    const recognise = await load();
    const long = msg.audio.length > WINDOW_SAMPLES;
    const out = await recognise(msg.audio, long ? { chunk_length_s: 30, stride_length_s: 5 } : {});
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
    post({ type: 'text', id: msg.id, text });
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
