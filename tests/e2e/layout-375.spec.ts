import {
  expect,
  horizontalOverflow,
  markRemainingRounds,
  startDrill,
  test,
  useLanguage,
} from './fixtures';

/**
 * The phone layout, at the 375px width the rules were written for.
 *
 * Nothing here compares screenshots: the assertions are on geometry, so a
 * failure names what moved rather than showing a picture that has changed.
 */

// A page may be a fraction of a pixel wider than its viewport through ordinary
// layout rounding. Two pixels is the line between rounding and a scrollbar.
const ROUNDING = 2;

const PAGES = [
  ['the home page', '/'],
  ['a typed round', '/drill?scope=surah:112&mode=type&rounds=5'],
  ['a listening round', '/drill?scope=surah:112&mode=listen&rounds=5'],
] as const;

for (const language of ['en', 'ar'] as const) {
  test.describe(`at 375px in ${language}`, () => {
    for (const [name, path] of PAGES) {
      test(`${name} does not scroll sideways`, async ({ page }) => {
        await useLanguage(page, language);
        await page.goto(path);
        await expect(page.locator('body')).toBeVisible();

        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(ROUNDING);
      });
    }

    test('the results page does not scroll sideways', async ({ page }) => {
      await useLanguage(page, language);
      await startDrill(page, 'selfCheck');

      await markRemainingRounds(page, language, 3);

      await expect(page).toHaveURL(/\/results\//);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(ROUNDING);
    });
  });
}

test.describe('the Start bar stays with the reader', () => {
  test('is pinned to the bottom of the screen while the tiles scroll past', async ({ page }) => {
    await useLanguage(page, 'en');
    await page.goto('/');

    const start = page.getByRole('button', { name: /^Start a round/ });
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('this suite runs with a fixed viewport');

    // Somewhere in the middle of the juz grid, where the button would have
    // scrolled away if it were an ordinary part of the page.
    await page.getByRole('radio', { name: /^12 / }).scrollIntoViewIfNeeded();

    const box = await start.boundingBox();
    expect(box, 'the Start button should be laid out').not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(box!.y).toBeGreaterThan(viewport.height / 2); // still at the bottom
    await expect(start).toBeInViewport();
  });

  test('names the selection and still starts the round from there', async ({ page }) => {
    await useLanguage(page, 'en');
    await page.goto('/');

    // The radio itself is visually hidden; a reader taps the tile around it.
    const twelve = page.getByRole('radio', { name: /^12 / });
    await twelve.locator('xpath=ancestor::label[1]').click();
    await expect(twelve).toBeChecked();

    const start = page.getByRole('button', { name: /^Start a round/ });
    await expect(start).toHaveText(/Juz 12/);

    await start.click();
    await expect(page).toHaveURL(/scope=juz%3A12|scope=juz:12/);
    await expect(page.getByRole('progressbar')).toBeVisible();
  });

});

test.describe('the Start bar and the tiles', () => {
  test('does not cover the tile a reader is choosing', async ({ page }) => {
    await useLanguage(page, 'en');
    await page.goto('/');

    const tile = page.getByRole('radio', { name: /^12 / });
    await tile.scrollIntoViewIfNeeded();

    const tileBox = await tile.locator('xpath=ancestor::label[1]').boundingBox();
    const startBox = await page.getByRole('button', { name: /^Start a round/ }).boundingBox();
    expect(tileBox && startBox).toBeTruthy();
    // scrollIntoViewIfNeeded puts the tile clear of the pinned bar.
    expect(tileBox!.y + tileBox!.height).toBeLessThanOrEqual(startBox!.y + 1);
  });
});

test.describe('the round itself stays usable on a phone', () => {
  test('the ayah, the writing line and the controls are all reachable', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'type');

    const width = page.viewportSize()!.width;
    const fitsAcross = async (element: ReturnType<typeof page.locator>) => {
      await element.scrollIntoViewIfNeeded();
      const box = await element.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    };

    await fitsAcross(page.locator('.mushaf-page'));
    await fitsAcross(page.getByRole('textbox'));
    await fitsAcross(page.getByRole('button', { name: 'Check my answer' }));
  });

  test('the listening panel fits the screen', async ({ page }) => {
    await useLanguage(page, 'ar');
    await startDrill(page, 'listen');

    const panel = page.getByRole('heading', { name: 'الاستماع على هذا الجهاز' }).locator('..');
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(ROUNDING);
  });
});
