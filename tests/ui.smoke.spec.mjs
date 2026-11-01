import { test, expect } from '@playwright/test';

test('console, equipment, offline workbench and research work in a real browser', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('UNIVERSAL MASTER KEY')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ping device' })).toBeDisabled();
  await page.getByRole('button', { name: 'Connect simulator' }).click();
  await expect(page.getByText('apex-simulator / 0.1.0')).toBeVisible();
  await expect(page.getByText('Simulator · software only')).toBeVisible();
  await page.getByRole('button', { name: 'Ping device' }).click();
  await expect(page.getByText(/Ping received: APEX round trip \[simulator\]/)).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByText('No device connected')).toBeVisible();
  await page.getByRole('tab', { name: 'Devices' }).click();
  await expect(page.getByRole('button', { name: 'Refresh USB inventory' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start NFC reader' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.getByRole('button', { name: 'Analyse recording' }).click();
  await expect(page.getByText(/"command": 52/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Recording input' }).fill('[1,2]');
  await page.getByRole('button', { name: 'Analyse recording' }).click();
  await expect(page.getByText(/Analysis error: Expected a complete 67/)).toBeVisible();
  await page.getByRole('button', { name: 'Load CAN fixture' }).click();
  await page.getByRole('button', { name: 'Analyse recording' }).click();
  await expect(page.getByText(/"frames": 2/)).toBeVisible();
  await page.getByRole('tab', { name: 'Research' }).click();
  await expect(page.getByText(/30 upstream projects copied and pinned/)).toBeVisible();
  await expect(page.getByText('AI protocol assistance', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('console is usable at a phone viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: 'Connect simulator' }).click();
  await expect(page.getByText('apex-simulator / 0.1.0')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

 test('saved evidence survives reload and source catalogue searches copied projects', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByRole('button', { name: 'Save analysis evidence' })).toBeDisabled();
  await page.getByRole('button', { name: 'Analyse recording' }).click();
  await page.getByRole('button', { name: 'Save analysis evidence' }).click();
  await expect(page.getByText('Analysis saved to local evidence.')).toBeVisible();
  await page.reload(); await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.getByText('analysis.nec', { exact: true })).toBeVisible();
  await expect(page.getByText('offline-fixture', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Verify / }).click();
  await expect(page.getByText('Evidence digest verified.')).toBeVisible();
  await page.getByRole('tab', { name: 'Research' }).click();
  await page.getByRole('textbox', { name: 'Search source projects' }).fill('mayhem');
  await expect(page.getByText('R29 / RocketGod-git/mayhem-mobile', { exact: true })).toBeVisible();
  await expect(page.getByText('R30 / portapack-mayhem/mayhem-firmware', { exact: true })).toBeVisible();
});
