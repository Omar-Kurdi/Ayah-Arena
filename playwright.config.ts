import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { fixtureWav } from './scripts/listener-fixtures.mjs';

/**
 * End-to-end tests against a production build, never `next dev`.
 *
 * The server is started by Playwright with its own database directory and its
 * own build output, so a test run cannot touch .data/ayah-arena.db or the
 * .next a dev server is serving.
 */

const PORT = Number(process.env.E2E_PORT ?? 3399);
const HOST = process.env.E2E_HOST ?? '127.0.0.1';
// Chromium plays this file whenever the page opens the microphone.
const FIXTURE_WAV = fixtureWav();
const ORIGIN = `http://${HOST}:${PORT}`;
const DIST = process.env.NEXT_DIST_DIR ?? '.next-e2e';

// One throwaway database for the run; globalTeardown removes it.
process.env.E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'ayah-arena-e2e-'));

export default defineConfig({
  testDir: './tests/e2e',
  globalTeardown: './tests/e2e/teardown.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // No retries anywhere: a flaky test is a bug to fix, not to paper over.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(layout-375|listener)\.spec\.ts/,
    },
    {
      // The phone width the layout rules are written for. Only the layout
      // suite runs here; the journeys do not change with the viewport.
      name: 'mobile-375',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
      testMatch: /layout-375\.spec\.ts/,
    },
    {
      // The real microphone path. Chromium plays a recitation into a fake
      // capture device, and the listener downloads and runs its model, so this
      // project is slow and deliberately left out of `npm run test:e2e`.
      name: 'listener',
      testMatch: /listener\.spec\.ts/,
      // One at a time: these tests share the mirrored model in .cache/listener,
      // and on a cold cache running two of them would fetch the same ~220MB
      // twice, over one runner's bandwidth, against each test's own clock.
      workers: 1,
      timeout: 5 * 60_000,
      expect: { timeout: 60_000 },
      use: {
        ...devices['Desktop Chrome'],
        // The full browser, not chrome-headless-shell: the shell has no media
        // capture, so a fake microphone is "NotSupportedError" there.
        channel: 'chromium',
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${FIXTURE_WAV}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AYAH_ARENA_DATA_DIR: process.env.E2E_DATA_DIR,
      NEXT_DIST_DIR: DIST,
      NODE_ENV: 'production',
    },
  },
});
