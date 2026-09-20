import {
  MODES,
  SHORT_SURAH,
  answerRemainingRounds,
  expect,
  markRemainingRounds,
  roundCount,
  startDrill,
  test,
  useLanguage,
} from './fixtures';

/**
 * Home -> drill -> results, through the real UI, in both languages and all
 * three answer modes.
 *
 * The listening mode is completed through its reveal-and-mark path: the
 * on-device model is a ~200MB download that the reader opts into, and nothing
 * here opts in. The real microphone path is stage 7.
 */

test.describe('the home page', () => {
  test('opens in English and offers a round', async ({ page }) => {
    await useLanguage(page, 'en');
    await page.goto('/');

    await expect(page).toHaveTitle('Arena');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Someone recites.' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Start a round/ })).toBeEnabled();
  });

  test('opens in Arabic, right to left', async ({ page }) => {
    await useLanguage(page, 'ar');
    await page.goto('/');

    await expect(page).toHaveTitle('Arena');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: /^ابدأ جولة/ })).toBeEnabled();
  });

  test('offers the three ways to answer, with reciting chosen', async ({ page }) => {
    await useLanguage(page, 'en');
    await page.goto('/');

    await expect(page.getByRole('radio', { name: new RegExp(MODES.listen.en) })).toBeVisible();
    await expect(page.getByRole('radio', { name: new RegExp(MODES.type.en) })).toBeVisible();
    await expect(page.getByRole('radio', { name: new RegExp(MODES.selfCheck.en) })).toBeVisible();
    // Reciting is the default: the mode the app is for.
    await expect(page.getByRole('radio', { name: /Recite it/ })).toBeChecked();
    await expect(page.getByText('Your voice stays on this device.').first()).toBeVisible();
  });

});

test.describe('the home page: choosing and starting', () => {
  test('switches language and stays switched', async ({ page }) => {
    await useLanguage(page, 'en');
    await page.goto('/');

    await page.getByRole('banner').getByRole('link', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('radio', { name: /سمِّعها/ })).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  });

  test('starts the round the form describes', async ({ page }) => {
    await useLanguage(page, 'en');
    await page.goto('/');

    await page.getByRole('radio', { name: /Type it/ }).check();
    await page.getByRole('button', { name: /^Start a round/ }).click();

    await expect(page).toHaveURL(/\/drill\?.*mode=type/);
    await expect(page.getByText(/·\s*typed/)).toBeVisible();
  });
});

test.describe('a typed round, end to end', () => {
  test('answers every round and reaches the results', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'type');

    const total = await roundCount(page);
    expect(total).toBe(3);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-label', `Ayah 1 of ${total}`);

    // The answer is not on the page yet, so type something and let it grade.
    await page.getByRole('textbox').fill('لا شيء');
    await page.getByRole('button', { name: 'Check my answer' }).click();
    await expect(page.getByText('recalled')).toBeVisible();
    await expect(page.getByText('points', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Next ayah' }).click();

    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-label', `Ayah 2 of ${total}`);
    await answerRemainingRounds(page, 'en', total - 1, 'لا شيء');

    await expect(page).toHaveURL(/\/results\//);
    await expect(page.getByText('average recall')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Another round' })).toBeVisible();
  });

  test('can ask to be shown an ayah instead of answering', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'type');

    await page.getByRole('button', { name: 'Show me this one' }).click();
    await expect(page.getByText('Here it is.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Next ayah|See how it went/ })).toBeVisible();
  });
});

test.describe('a self-checked round', () => {
  test('reveals the ayah and takes the reader mark', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'selfCheck');

    await expect(page.getByText(/·\s*self-checked/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check by listening' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Reveal the ayah' }).click();
    await expect(page.getByRole('heading', { name: 'How did that go?' })).toBeVisible();

    await page.getByRole('button', { name: /Got it/ }).click();
    await expect(page.getByText('recalled')).toBeVisible();
  });

  test('finishes the set and shows what held', async ({ page }) => {
    await useLanguage(page, 'ar');
    await startDrill(page, 'selfCheck');

    await markRemainingRounds(page, 'ar', await roundCount(page));

    await expect(page).toHaveURL(/\/results\//);
    await expect(page.getByText('متوسط الاستحضار')).toBeVisible();
  });
});

test.describe('a listening round, without the microphone', () => {
  test('asks before downloading anything', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'listen');

    await expect(page.getByRole('heading', { name: 'Listen on this phone' })).toBeVisible();
    await expect(page.getByText(/about 200MB/)).toBeVisible();
    await expect(page.getByText(/Your voice is never uploaded or saved/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download and listen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Not now' })).toBeVisible();
  });

  test('leaves the reader a way through when they decline', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'listen');

    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByRole('button', { name: 'Check by listening' })).toBeVisible();

    await page.getByRole('button', { name: 'Reveal the ayah' }).click();
    await page.getByRole('button', { name: /Got it/ }).click();
    await expect(page.getByText('recalled')).toBeVisible();
  });

  test('offers the same panel in Arabic', async ({ page }) => {
    await useLanguage(page, 'ar');
    await startDrill(page, 'listen');

    await expect(page.getByRole('heading', { name: 'الاستماع على هذا الجهاز' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'نزّله واستمع' })).toBeVisible();
  });
});

test.describe('the results page', () => {
  test('sums up the set and can start another', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'selfCheck', SHORT_SURAH, 5);

    await markRemainingRounds(page, 'en', await roundCount(page));

    await expect(page.getByText('points', { exact: true })).toBeVisible();
    await expect(page.getByText('average recall')).toBeVisible();
    await expect(page.getByText('ayat', { exact: true })).toBeVisible();
    await expect(page.getByText('Held firm')).toBeVisible();

    await page.getByRole('link', { name: 'Another round' }).click();
    await expect(page).toHaveURL(/\/drill\?/);
    await expect(page.getByRole('progressbar')).toBeVisible();
  });
});
