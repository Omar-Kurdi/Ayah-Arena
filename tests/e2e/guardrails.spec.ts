import { verseByKey } from '@/lib/quran';
import { expect, markRemainingRounds, startDrill, test, useLanguage } from './fixtures';
import { forbiddenReds, paintedElements } from './red';

/**
 * The product rules that only a browser can check: what the tab is called,
 * what the page is allowed to show, and what colour it is allowed to be.
 */

/** Which ayah the round is asking for, read from the page rather than assumed. */
async function askedAyah(page: import('@playwright/test').Page) {
  const locative = (await page.locator('.marginal', { hasText: /ayah|الآية/ }).first().textContent()) ?? '';
  const [, surah, ayah] = /Al-Ikhlas · ayah (\d+)/.exec(locative.replace(/\s+/g, ' ')) ?? [
    '',
    '112',
    '0',
  ];
  const prompt = Number(ayah || surah);
  return { prompt, answer: verseByKey(`112:${prompt + 1}`) };
}

test.describe('the tab is called Arena, and nothing else', () => {
  for (const [name, path] of [
    ['home', '/'],
    ['drill', '/drill?scope=surah:112&mode=type&rounds=5'],
  ] as const) {
    test(`on ${name}`, async ({ page }) => {
      await useLanguage(page, 'en');
      await page.goto(path);
      // An exact match: "Ayah Arena" or "Arena — drill" would fail here, which
      // is the point. Readers share phones.
      await expect(page).toHaveTitle('Arena');
    });
  }

  test('on the results page, in Arabic', async ({ page }) => {
    await useLanguage(page, 'ar');
    await startDrill(page, 'selfCheck');

    await markRemainingRounds(page, 'ar', 3);

    await expect(page).toHaveURL(/\/results\//);
    await expect(page).toHaveTitle('Arena');
  });
});

test.describe('a typed round does not give the answer away', () => {
  test('the answer reaches the page only after the attempt', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'type');

    const { answer } = await askedAyah(page);
    // Every spelling the grader accepts, so a leak in any form is caught. The
    // ayah is carried as real text for screen readers, so this reads the DOM
    // the reader's assistive tech sees, not a private variable.
    const spellings = [answer.uthmani, answer.imlaei, answer.simple];

    const before = await page.content();
    for (const spelling of spellings) {
      expect(before, `answer leaked before submitting: ${spelling}`).not.toContain(spelling);
    }

    await page.getByRole('textbox').fill('لا شيء');
    await page.getByRole('button', { name: 'Check my answer' }).click();
    await expect(page.getByText('recalled')).toBeVisible();

    expect(await page.content()).toContain(answer.uthmani);
  });

  test('asking to be shown it is the reader choosing to see it', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'type');

    const { answer } = await askedAyah(page);
    expect(await page.content()).not.toContain(answer.uthmani);

    await page.getByRole('button', { name: 'Show me this one' }).click();
    await expect(page.getByText('Here it is.')).toBeVisible();
    expect(await page.content()).toContain(answer.uthmani);
  });
});

test.describe('no machine transcript is ever drawn', () => {
  // The listener's transcript is machine-written quasi-Quranic text, and the
  // app must never display it. The heard state itself needs the model, which
  // is stage 7; what is reachable here is every listening state before it, and
  // those are checked for Arabic that is not Quran.
  test('every Arabic word on a listening round comes from the mushaf', async ({ page }) => {
    await useLanguage(page, 'en'); // an English interface: any Arabic is Quran
    await startDrill(page, 'listen');

    await expect(page.getByRole('heading', { name: 'Listen on this phone' })).toBeVisible();
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByRole('button', { name: 'Check by listening' })).toBeVisible();

    await page.getByRole('button', { name: 'Reveal the ayah' }).click();
    await expect(page.getByRole('heading', { name: 'How did that go?' })).toBeVisible();

    const { prompt, answer } = await askedAyah(page);
    const quran = [verseByKey(`112:${prompt}`).uthmani, answer.uthmani].join(' ');
    // Glyph codepoints are drawn from the mushaf fonts and are aria-hidden;
    // the text layer beside them is the real ayah.
    const shown = await page.locator('.qpc-text').allTextContents();
    expect(shown.length).toBeGreaterThan(0);
    for (const line of shown) {
      expect(quran, `text on the page that is not this round's Quran: ${line}`).toContain(line.trim());
    }

    // And nothing anywhere else on the page is Arabic prose.
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

test.describe('nothing in the interface is red', () => {
  // "Nothing marks what did not come back beyond going quiet" is a product
  // rule, so red is checked on the rendered elements rather than by comparing
  // screenshots. Covered per element: color, background-color, the four border
  // colours, outline-color, text-decoration-color, and SVG fill and stroke.
  for (const [name, open] of [
    ['the home page', async (page: import('@playwright/test').Page) => page.goto('/')],
    [
      'a drill in progress',
      async (page: import('@playwright/test').Page) => startDrill(page, 'type'),
    ],
  ] as const) {
    test(`${name} paints no red`, async ({ page }) => {
      await useLanguage(page, 'en');
      await open(page);
      expect(await forbiddenReds(page)).toEqual([]);
    });
  }

  test('a graded answer paints no red, however it went', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'type');

    // A wrong answer is the state most likely to reach for red.
    await page.getByRole('textbox').fill('لا شيء');
    await page.getByRole('button', { name: 'Check my answer' }).click();
    await expect(page.getByText('recalled')).toBeVisible();

    expect(await forbiddenReds(page)).toEqual([]);
  });

  test('the check looks at the whole page, not a handful of elements', async ({ page }) => {
    await useLanguage(page, 'en');
    await page.goto('/');
    // A guard on the guard: if the sweep ever stopped finding elements, the
    // tests above would pass while checking nothing.
    expect(await paintedElements(page)).toBeGreaterThan(50);
  });
});
