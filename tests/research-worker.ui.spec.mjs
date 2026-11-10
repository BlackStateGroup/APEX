import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

test('research worker job controls, verified case lineage and credential clearing on a phone viewport', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const endpoint = 'https://analysis.example', token = 'x'.repeat(43), target = { sha256: 'a'.repeat(64), bytes: 128, label: 'owned.elf' };
  let job, cancelled = false, tamper = false;
  await page.route(endpoint + '/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' } });
    expect(request.headers().authorization).toBe('Bearer ' + token);
    let data;
    if (path === '/v1/catalogue') data = { targets: [target], blocked: false };
    else if (path === '/v1/jobs' && request.method() === 'POST') {
      const input = request.postDataJSON();
      job = { id: input.requestId, request: input, state: 'queued', createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z', error: null };
      data = job;
    } else if (path === '/v1/jobs') data = { jobs: job ? [job] : [] };
    else if (path.endsWith('/cancel')) { cancelled = true; job.state = 'cancelled'; data = job; }
    else if (path.endsWith('/result')) {
      const output = 'synthetic UI test pseudocode';
      data = { schema: 'apex.research-result.v1', jobId: job.id, request: job.request, target, reaVersion: '6.8.0', provider: 'ghidra/12.1.4', kind: 'pseudocode', output: tamper ? 'modified' : output, outputSha256: createHash('sha256').update(output).digest('hex'), targetExecuted: false };
    } else throw new Error('Unexpected path ' + path);
    const body = JSON.stringify(data);
    await route.fulfill({ status: 200, body, headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), 'access-control-allow-origin': '*' } });
  });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await page.getByLabel('Research worker HTTPS address', { exact: true }).fill(endpoint);
  await page.getByLabel('Research worker access token', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Connect research worker', exact: true }).click();
  await expect(page.getByText('Worker connected. Select an operation to start analysis.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Decompile apex_crc16', exact: true }).click();
  await expect(page.getByLabel('Research job state', { exact: true })).toHaveText('queued');
  await page.getByRole('button', { name: 'Cancel research job', exact: true }).click();
  await expect(page.getByLabel('Research job state', { exact: true })).toHaveText('cancelled'); expect(cancelled).toBe(true);
  await page.getByRole('button', { name: 'Decompile apex_crc16', exact: true }).click();
  await expect(page.getByLabel('Research job state', { exact: true })).toHaveText('queued');
  job.state = 'succeeded';
  await page.getByRole('button', { name: 'Refresh research jobs', exact: true }).click();
  await expect(page.getByLabel('Research job state', { exact: true })).toHaveText('succeeded');
  tamper = true;
  await page.getByRole('button', { name: 'Fetch and verify research result', exact: true }).click();
  await expect(page.getByText('Research output digest mismatch', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save research result as a new case', exact: true })).toHaveCount(0);
  tamper = false;
  await page.getByRole('button', { name: 'Fetch and verify research result', exact: true }).click();
  await expect(page.getByLabel('Verified research output', { exact: true })).toHaveValue('synthetic UI test pseudocode');
  await page.getByRole('button', { name: 'Save research result as a new case', exact: true }).click();
  await expect(page.getByText(/Saved REA owned.elf/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('review-evidence/research-worker', { recursive: true });
  await page.screenshot({ path: 'review-evidence/research-worker/phone.png', fullPage: true });
  await page.getByRole('tab', { name: 'Cases', exact: true }).click();
  await page.getByRole('button', { name: 'Open REA owned.elf / ghidra-function', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare case export', exact: true }).click();
  const exported = await page.getByLabel('Verified case export', { exact: true }).inputValue();
  const c = JSON.parse(exported); expect(c.artifacts).toHaveLength(2);
  expect(c.artifacts[1].parents).toEqual([c.artifacts[0].id]); expect(exported).not.toContain(token);
  expect(JSON.parse(c.artifacts[0].content).originalBytesPresentOnPhone).toBe(false);
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await expect(page.getByLabel('Research worker access token', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Connect research worker', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
