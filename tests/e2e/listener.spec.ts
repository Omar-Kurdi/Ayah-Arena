import { FIXTURE, MODEL_DIR } from '../../scripts/listener-fixtures.mjs';
import { verseByKey } from '@/lib/quran';
import { expect, test, useLanguage } from './fixtures';
import { routeModelRequests, startMirror, type Mirror } from './model-mirror';

/**
 * The real listening path, end to end:
 *
 *   Chromium fake microphone -> getUserMedia -> AudioContext -> the recorder
 *   -> snapshot/joinTail -> the worker -> transformers.js -> onnxruntime
 *   -> the grader -> the suggested grade the reader sees.
 *
 * Nothing in that chain is stubbed. Chromium plays a real recitation into a
 * fake capture device (configured in playwright.config.ts), the application
 * downloads and runs its real model, and the assertions are on what the reader
 * ends up seeing.
 *
 * Only the model's own downloads are served from a local mirror, so the bytes
 * are pinned and fetched once; every other off-origin request is refused.
 *
 * Backend: whatever the worker picks. On a runner with no GPU adapter that is
 * WebAssembly, which is why this project allows five minutes per test.
 */

const ANSWER_KEY = `${FIXTURE.surah}:${FIXTURE.ayah}`;
const SCOPE = `surah:${FIXTURE.surah}`;
const PROMPT_AYAH = FIXTURE.ayah - 1;

let mirror: Mirror;

test.beforeEach(async ({ context, page }) => {
  mirror = await startMirror(MODEL_DIR);
  await routeModelRequests(context, mirror);
  // The listener reports why it could not start through the console; without
  // this a failure here is just a button that never appeared.
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[browser] ${message.text()}`);
  });
});

test.afterEach(async () => {
  await mirror.close();
});

/**
 * Opens rounds until the one the fixture answers comes up. Al-'Asr offers two
 * pairs and the app picks at random, so this is choosing a round, not retrying
 * a flaky one -- and it fails loudly rather than testing the wrong ayah.
 */
async function drillAskingForTheFixture(
  page: import('@playwright/test').Page,
  attemptsLeft = 12
): Promise<void> {
  if (attemptsLeft === 0) throw new Error(`no round asked for ${ANSWER_KEY} in twelve tries`);

  await page.goto(`/drill?scope=${SCOPE}&mode=listen&rounds=5`);
  const locative = await page
    .locator('.marginal', { hasText: /ayah \d+$/ })
    .first()
    .textContent();
  if (locative?.trim().endsWith(`ayah ${PROMPT_AYAH}`)) return;

  return drillAskingForTheFixture(page, attemptsLeft - 1);
}

/** Agrees to the download, then waits for the model to be ready to listen. */
async function prepareListener(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Download and listen' }).click();
  await expect(page.getByRole('status')).toContainText(/Getting the listener ready/);
  await expect(page.getByRole('button', { name: 'Start reciting' })).toBeVisible({
    timeout: 4 * 60_000,
  });
}

test.describe('the listener, with a real microphone and a real model', () => {
  test('hears the recitation and suggests the grade it earns', async ({ page }) => {
    await useLanguage(page, 'en');
    await drillAskingForTheFixture(page);

    // Consent first: nothing is downloaded before the reader agrees.
    await expect(page.getByRole('heading', { name: 'Listen on this phone' })).toBeVisible();
    await prepareListener(page);

    // The model came from somewhere, which is evidence the worker really ran.
    expect(mirror.stats.served + mirror.stats.fetched).toBeGreaterThan(0);
    expect(mirror.stats.blocked, 'the app should need no other network').toEqual([]);

    await page.getByRole('button', { name: 'Start reciting' }).click();

    // Recording: the dots are the live state, one per word of the ayah.
    const dots = page.getByRole('img', { name: /words heard/ });
    await expect(page.getByRole('status')).toContainText('Listening.');
    await expect(dots).toBeVisible();
    await expect(dots).toHaveAttribute('aria-label', /^0 of \d+ words heard/);

    // Audio actually reached the model: words start coming back. This is the
    // whole point of the stage -- it can only happen if the fake microphone,
    // the recorder, the snapshot, the worker and inference all worked.
    await expect(dots).toHaveAttribute('aria-label', /^[1-9]\d* of \d+ words heard/, {
      timeout: 3 * 60_000,
    });

    // Every word comes back, so the panel finishes on its own and grades it.
    await expect(page.getByRole('heading', { name: 'How did that go?' })).toBeVisible({
      timeout: 3 * 60_000,
    });
    await expect(page.getByText(/Suggested from what it heard/)).toBeVisible();

    // A correct recitation earns the top suggestion, pre-selected but not
    // submitted: the reader still decides.
    const suggestion = page.getByRole('button', { name: /Got it/ });
    await expect(suggestion).toHaveClass(/border-brass/);
    await expect(page.getByText('recalled')).toHaveCount(0);

    // The marks are on the revealed ayah, and the ayah is the real one.
    await expect(page.locator('.qpc-text').last()).toHaveText(verseByKey(ANSWER_KEY).uthmani);

    await suggestion.click();
    await expect(page.getByText('recalled')).toBeVisible();
  });

});

test.describe('the transcript the model wrote', () => {
  test('never reaches the page', async ({ page }) => {
    await useLanguage(page, 'en');
    await drillAskingForTheFixture(page);
    await prepareListener(page);
    await page.getByRole('button', { name: 'Start reciting' }).click();

    await expect(page.getByRole('heading', { name: 'How did that go?' })).toBeVisible({
      timeout: 3 * 60_000,
    });

    // A transcript exists by now -- the grade came from it. In an English
    // interface the only Arabic on the page should still be this round's two
    // ayat, drawn from the data files, and nothing the model wrote.
    const quran = [verseByKey(`${FIXTURE.surah}:${PROMPT_AYAH}`), verseByKey(ANSWER_KEY)]
      .map((verse) => verse.uthmani)
      .join(' ');

    const shown = await page.locator('.qpc-text').allTextContents();
    for (const line of shown) {
      expect(quran, `text on the page that is not this round's Quran: ${line}`).toContain(
        line.trim()
      );
    }

    const strayArabic = await page.evaluate(() => {
      const arabic = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]{2,}/;
      return [...document.querySelectorAll('body *')]
        .filter((el) => !el.closest('.qpc-text, .qpc-glyphs, [aria-hidden="true"]'))
        .flatMap((el) => [...el.childNodes])
        .filter((node) => node.nodeType === Node.TEXT_NODE && arabic.test(node.textContent ?? ''))
        .map((node) => (node.textContent ?? '').trim());
    });
    expect(strayArabic).toEqual([]);
  });
});

test.describe('when the microphone is refused', () => {
  // The permission is granted to the whole project, so this context takes it
  // away again -- the browser then refuses getUserMedia exactly as it does for
  // a reader who has blocked the site.
  test.use({ permissions: [] });

  test('says so, and leaves a way to finish the round', async ({ page, context }) => {
    await context.clearPermissions();
    await useLanguage(page, 'en');
    await drillAskingForTheFixture(page);
    await prepareListener(page);

    await page.getByRole('button', { name: 'Start reciting' }).click();

    // Not a spinner that never ends: an explanation, and the reveal path.
    await expect(page.getByText(/microphone/i)).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);

    await page.getByRole('button', { name: 'Reveal the ayah' }).click();
    await page.getByRole('button', { name: /Got it/ }).click();
    await expect(page.getByText('recalled')).toBeVisible();
  });
});
