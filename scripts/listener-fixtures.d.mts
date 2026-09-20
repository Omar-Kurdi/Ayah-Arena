/** Types for listener-fixtures.mjs, which runs under plain Node. */

export declare const CACHE: string;
export declare const AUDIO_DIR: string;
export declare const MODEL_DIR: string;

export declare const MODEL: { id: string; revision: string };

export declare const FIXTURE: {
  surah: number;
  ayah: number;
  reciter: number;
  reciterName: string;
};

export declare function fixtureWav(): string;
export declare function cacheKey(): string;
