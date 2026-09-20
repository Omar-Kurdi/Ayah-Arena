import { expect, test as base, type Page } from '@playwright/test';

/**
 * Shared helpers for the browser tests.
 *
 * Every test starts from a clean browser context (Playwright's default), so
 * each one gets its own player cookie and its own sessions in the throwaway
 * database the server was started with. Nothing is shared between tests, and
 * nothing here reaches into React state: the tests drive the real UI.
 */

export type Language = 'en' | 'ar';

/** The three ways to answer, as the home form writes them into the URL. */
export const MODES = {
  listen: { url: 'listen', en: 'Recite it', ar: 'سمِّعها' },
  type: { url: 'type', en: 'Type it', ar: 'اكتبها' },
  selfCheck: { url: 'recite', en: 'Check yourself', ar: 'راجع بنفسك' },
} as const;

export type ModeName = keyof typeof MODES;

/** Al-Ikhlas: four ayat, so three rounds. Short enough to finish quickly. */
export const SHORT_SURAH = 'surah:112';

/**
 * Sets the interface language the way the app stores it -- the same cookie the
 * /locale route writes -- before the first navigation. Arabic is the app's
 * default, so every test says which language it means.
 */
export async function useLanguage(page: Page, language: Language): Promise<void> {
  // Cookies ignore the port, so the origin without one covers the test server.
  await page.context().addCookies([{ name: 'locale', value: language, url: baseUrlOf(page) }]);
}

function baseUrlOf(page: Page): string {
  const url = new URL(page.url() === 'about:blank' ? 'http://127.0.0.1' : page.url());
  return `${url.protocol}//${url.host}`;
}

export const test = base;

export { expect };

/** Starts a round straight from the URL the home form would produce. */
export async function startDrill(
  page: Page,
  mode: ModeName,
  scope = SHORT_SURAH,
  rounds = 5
): Promise<void> {
  await page.goto(`/drill?scope=${scope}&mode=${MODES[mode].url}&rounds=${rounds}`);
  await expect(page.getByRole('progressbar')).toBeVisible();
}

/** How many rounds this session actually has ("1 of 3" / "١ من ٣"). */
export async function roundCount(page: Page): Promise<number> {
  const label = (await page.getByRole('progressbar').getAttribute('aria-label')) ?? '';
  const digits = label.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).match(/\d+/g);
  return Number(digits?.[1] ?? 0);
}

/**
 * The widest the page can scroll, against the width it has to fit in. Rounded
 * to whole pixels: sub-pixel layout rounding is not a horizontal scrollbar.
 */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.round(Math.max(doc.scrollWidth, document.body.scrollWidth) - doc.clientWidth);
  });
}

/** The button names a round needs, in the language under test. */
export const LABELS = {
  en: {
    reveal: 'Reveal the ayah',
    gotIt: /Got it/,
    check: 'Check my answer',
    next: 'Next ayah',
    finish: 'See how it went',
    recalled: 'recalled',
  },
  ar: {
    reveal: 'اكشف الآية',
    gotIt: /حفظتها/,
    check: 'صحّح إجابتي',
    next: 'الآية التالية',
    finish: 'انظر كيف كانت',
    recalled: 'الاستحضار',
  },
} as const;

/**
 * Reveals and marks every remaining round, then lands on the results page.
 * Written as a recursion rather than a loop: the rounds have to happen in
 * order, one after another, and that is what this says.
 */
export async function markRemainingRounds(
  page: Page,
  language: Language,
  remaining: number
): Promise<void> {
  const labels = LABELS[language];
  if (remaining <= 0) return;

  await page.getByRole('button', { name: labels.reveal }).click();
  await page.getByRole('button', { name: labels.gotIt }).click();
  await page
    .getByRole('button', { name: remaining === 1 ? labels.finish : labels.next })
    .click();

  return markRemainingRounds(page, language, remaining - 1);
}

/** Answers every remaining typed round with `text`, then reaches the results. */
export async function answerRemainingRounds(
  page: Page,
  language: Language,
  remaining: number,
  text: string
): Promise<void> {
  const labels = LABELS[language];
  if (remaining <= 0) return;

  await page.getByRole('textbox').fill(text);
  await page.getByRole('button', { name: labels.check }).click();
  await expect(page.getByText(labels.recalled)).toBeVisible();
  await page
    .getByRole('button', { name: remaining === 1 ? labels.finish : labels.next })
    .click();

  return answerRemainingRounds(page, language, remaining - 1, text);
}
