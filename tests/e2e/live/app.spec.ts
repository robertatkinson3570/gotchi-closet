import { test, expect } from '@playwright/test';

test('home loads and shows GotchiCloset header', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      pageErrors.push(msg.text());
    }
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // The brand is the logo image (alt "GotchiCloset") in the global nav, not an
  // <h1> heading (the old markup this spec was written against).
  const header = page.getByRole('img', { name: 'GotchiCloset' }).first();
  const isVisible = await header.isVisible();

  if (!isVisible) {
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('PAGE_ERRORS:', pageErrors);
    console.log('BODY_TEXT:', bodyText.slice(0, 500));
  }

  await expect(header).toBeVisible();
});
