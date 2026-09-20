'use client';

import type { FromWorker, ToWorker } from './asr.worker';

/**
 * Main-thread side of the listener: one worker per page, kept across rounds
 * so the model loads once, plus microphone capture at 16kHz mono.
 */

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (text: string) => void; reject: (err: Error) => void }>();
const progressListeners = new Set<(fraction: number | null) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      for (const fn of progressListeners) fn(msg.total ? msg.loaded / msg.total : null);
    } else if (msg.type === 'text') {
      pending.get(msg.id)?.resolve(msg.text);
      pending.delete(msg.id);
    } else if (msg.type === 'error' && msg.id !== undefined) {
      pending.get(msg.id)?.reject(new Error(msg.message));
      pending.delete(msg.id);
    }
  };
  return worker;
}

const send = (msg: ToWorker, transfer: Transferable[] = []) => getWorker().postMessage(msg, transfer);

/** Downloads (first time) and starts the model. Progress is a 0-1 fraction,
 *  or null while the total size is not yet known. */
export function loadListener(onProgress: (fraction: number | null) => void): Promise<void> {
  progressListeners.add(onProgress);
  if (!ready) {
    const w = getWorker();
    ready = new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent<FromWorker>) => {
        const msg = event.data;
        if (msg.type === 'ready') resolve();
        else if (msg.type === 'error' && msg.id === undefined) reject(new Error(msg.message));
        else return;
        w.removeEventListener('message', onMessage);
      };
      w.addEventListener('message', onMessage);
      send({ type: 'load' });
    }).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready.finally(() => progressListeners.delete(onProgress));
}

export function transcribe(audio: Float32Array): Promise<string> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: 'transcribe', id, audio }, [audio.buffer]);
  });
}

// Copies each block of microphone samples back to the page as it arrives.
const TAP = `registerProcessor('tap', class extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
});`;

const SAMPLE_RATE = 16_000;

export interface Recording {
  /** What has been heard so far, resampled to 16kHz mono -- all of it, or
   *  only the last `tailSeconds`. */
  snapshot(tailSeconds?: number): Promise<Float32Array>;
  /** Seconds captured so far. */
  seconds(): number;
  /** Releases the microphone. */
  stop(): void;
}

export type MicProblem = 'insecure' | 'deniedSite' | 'deniedApp' | 'missing' | 'other';

/** Why the microphone could not be opened, in terms a reader can act on. A
 *  refusal with no prompt shown usually means the phone has not given the
 *  browser app itself the microphone, rather than the site being blocked --
 *  the site permission tells the two apart. */
export async function micProblem(err: unknown): Promise<MicProblem> {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'InsecureContextError') return 'insecure';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return status.state === 'denied' ? 'deniedSite' : 'deniedApp';
    } catch {
      return 'deniedSite';
    }
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'missing';
  return 'other';
}

/** Asks for the microphone -- only ever call this from a click. The capture
 *  runs at the device's own rate and is resampled on demand, because some
 *  browsers refuse to connect a microphone to a 16kHz audio context. */
export async function startRecording(): Promise<Recording> {
  // Browsers only offer the microphone to secure pages (https, or localhost).
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error('microphone needs a secure (https) page');
    err.name = 'InsecureContextError';
    throw err;
  }
  // Created before any await, while the click still counts as a user gesture:
  // Safari keeps an audio context made later suspended, and it records silence.
  const ctx = new AudioContext();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    void ctx.close();
    throw err;
  }
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

  const source = ctx.createMediaStreamSource(stream);
  const blocks: Float32Array[] = [];
  let length = 0;
  const take = (block: Float32Array) => {
    blocks.push(block);
    length += block.length;
  };

  // An AudioWorklet where the browser allows one; the older script processor
  // otherwise (some in-app browsers and older iOS refuse worklet modules).
  let node: AudioNode;
  let detach: () => void;
  try {
    const url = URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const tap = new AudioWorkletNode(ctx, 'tap');
    tap.port.onmessage = (event: MessageEvent<Float32Array>) => take(event.data);
    node = tap;
    detach = () => {
      tap.port.onmessage = null;
    };
  } catch {
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (event) => take(event.inputBuffer.getChannelData(0).slice());
    // A script processor only runs while connected through to the output; it
    // writes nothing to its output buffer, so this plays silence.
    proc.connect(ctx.destination);
    node = proc;
    detach = () => {
      proc.onaudioprocess = null;
      proc.disconnect();
    };
  }
  source.connect(node);

  return {
    seconds: () => length / ctx.sampleRate,
    async snapshot(tailSeconds) {
      const all = blocks.slice();
      const total = all.reduce((n, b) => n + b.length, 0);
      const skip = tailSeconds ? Math.max(0, total - Math.round(tailSeconds * ctx.sampleRate)) : 0;
      const raw = new Float32Array(total - skip);
      let offset = 0;
      let seen = 0;
      for (const b of all) {
        const from = Math.max(0, skip - seen);
        seen += b.length;
        if (from >= b.length) continue;
        raw.set(b.subarray(from), offset);
        offset += b.length - from;
      }
      const frames = Math.max(1, Math.round((offset / ctx.sampleRate) * SAMPLE_RATE));
      const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
      const buffer = offline.createBuffer(1, Math.max(1, offset), ctx.sampleRate);
      buffer.copyToChannel(raw.subarray(0, Math.max(1, offset)), 0);
      const node = offline.createBufferSource();
      node.buffer = buffer;
      node.connect(offline.destination);
      node.start();
      const rendered = await offline.startRendering();
      return rendered.getChannelData(0).slice();
    },
    stop() {
      source.disconnect();
      detach();
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
    },
  };
}
