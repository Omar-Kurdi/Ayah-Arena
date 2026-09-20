import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, markRemainingRounds, startDrill, test, useLanguage } from './fixtures';

/**
 * Accessibility checks with axe-core.
 *
 * This does not prove the app is accessible -- axe finds a subset of problems,
 * and nothing here replaces using the app with a screen reader. What it does
 * is fail the build when a state regresses against the rule sets below.
 *
 * Scope, stated rather than assumed: WCAG 2.0/2.1 levels A and AA, over the
 * whole page, with no rules disabled.
 */
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

/** Reports the rule and the element, so a failure says what to fix. */
const summarise = (violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) =>
  violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    where: violation.nodes.map((node) => node.target.join(' ')).slice(0, 4),
  }));

test.describe('the home page', () => {
  for (const language of ['en', 'ar'] as const) {
    test(`has no axe violations in ${language}`, async ({ page }) => {
      await useLanguage(page, language);
      await page.goto('/');
      const { violations } = await scan(page).analyze();
      expect(summarise(violations)).toEqual([]);
    });
  }
});

test.describe('a round in progress', () => {
  test('has no axe violations while typing', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'type');
    const { violations } = await scan(page).analyze();
    expect(summarise(violations)).toEqual([]);
  });

  test('has no axe violations once an answer is marked', async ({ page }) => {
    await useLanguage(page, 'ar');
    await startDrill(page, 'type');
    await page.getByRole('textbox').fill('لا شيء');
    await page.getByRole('button', { name: 'صحّح إجابتي' }).click();
    await expect(page.getByText('الاستحضار')).toBeVisible();

    const { violations } = await scan(page).analyze();
    expect(summarise(violations)).toEqual([]);
  });

  test('has no axe violations on the self-grade choices', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'selfCheck');
    await page.getByRole('button', { name: 'Reveal the ayah' }).click();
    await expect(page.getByRole('heading', { name: 'How did that go?' })).toBeVisible();

    const { violations } = await scan(page).analyze();
    expect(summarise(violations)).toEqual([]);
  });
});

test.describe('the listening consent panel', () => {
  test('has no axe violations', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'listen');
    await expect(page.getByRole('heading', { name: 'Listen on this phone' })).toBeVisible();

    const { violations } = await scan(page).analyze();
    expect(summarise(violations)).toEqual([]);
  });
});

test.describe('the results page', () => {
  test('has no axe violations', async ({ page }) => {
    await useLanguage(page, 'en');
    await startDrill(page, 'selfCheck');
    await markRemainingRounds(page, 'en', 3);
    await expect(page).toHaveURL(/\/results\//);

    const { violations } = await scan(page).analyze();
    expect(summarise(violations)).toEqual([]);
  });
});
