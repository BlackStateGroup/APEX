import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('first iPhone workflow renders at phone width and refuses browser connections', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByText('Your Flipper.', { exact: false })).toBeVisible();
  const find = page.getByRole('button', { name: 'Find my Flipper', exact: true });
  await expect(find).toBeDisabled();
  await page.getByRole('checkbox').click();
  await expect(find).toBeDisabled();
  await expect(page.getByText(/This browser preview cannot connect/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await mkdir('review-evidence/iphone-flipper', { recursive: true });
  await page.screenshot({ path: 'review-evidence/iphone-flipper/preview.png', fullPage: true });
  expect(errors).toEqual([]);
});
