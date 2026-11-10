import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';


// Picker navigation is not an analysis/import/save action. Preserve the current
// selection on repeated tab visits so retention is exercised by existing tests.
async function selectAnalysisInspector(page, label) {
  const selected = page.getByRole('button', { name: `Choose Analysis inspector: ${label}`, exact: true });
  if (await selected.count()) return;
  await page.getByRole('button', { name: /^Choose Analysis inspector: / }).click();
  await page.getByRole('button', { name: `Select ${label}`, exact: true }).click();
  await expect(selected).toBeVisible();
}

// Every scenario checks uncaught application errors, not only the console smoke.
test.beforeEach(async ({ page }) => {
  page.runtimeErrors = [];
  page.on('pageerror', error => page.runtimeErrors.push(error.message));
});
test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) await page.screenshot({ path: testInfo.outputPath('final-viewport.png') });
  expect(page.runtimeErrors ?? []).toEqual([]);
});

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
  await expect(page.getByText('No active APEX session')).toBeVisible();
  await page.getByRole('tab', { name: 'Devices' }).click();
  await expect(page.getByRole('button', { name: 'Refresh USB inventory' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start NFC reader' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
  await page.getByRole('button', { name: 'Analyse recording' }).click();
  await expect(page.getByText(/"command": 52/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Recording input' }).fill('[1,2]');
  await page.getByRole('button', { name: 'Analyse recording' }).click();
  await expect(page.getByText(/Analysis error: Expected a complete 67/)).toBeVisible();
  await page.getByRole('button', { name: 'Load CAN fixture' }).click();
  await page.getByRole('button', { name: 'Analyse recording' }).click();
  await expect(page.getByText(/"frames": 2/)).toBeVisible();
  await page.getByRole('tab', { name: 'Research' }).click();
  await expect(page.getByText(/31 upstream projects registered and backed up/)).toBeVisible();
  await expect(page.getByText('AI protocol assistance', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Wi-Fi summary is inspectable at a phone viewport and clears on exit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await selectAnalysisInspector(page, 'Wi-Fi security report');
  const inspect = page.getByRole('button', { name: 'Inspect Wi-Fi report' });
  await expect(inspect).toBeDisabled();
  await page.getByRole('button', { name: 'Load example', exact: true }).click();
  await inspect.click();
  await expect(page.getByText('Review whether legacy WPA2 compatibility is still needed.')).toBeVisible();
  await page.getByRole('tab', { name: 'Console' }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(inspect).toBeDisabled();
  await expect(page.getByText('Review whether legacy WPA2 compatibility is still needed.')).toHaveCount(0);
});

test('console is usable at a phone viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: 'Connect simulator' }).click();
  await expect(page.getByText('apex-simulator / 0.1.0')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

 test('saved evidence survives reload and source catalogue searches copied projects', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
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

test('REA sample and imported reports retain provenance in saved evidence', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name:'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
  await page.getByRole('button', { name:'Load REA sample' }).click();
  await expect(page.getByText('REA ELF / RECORDED LAB SAMPLE')).toBeVisible();
  await page.getByRole('button', { name:'Analyse recording' }).click();
  await expect(page.getByText(/original artifact has not been verified on this device/)).toBeVisible();
  await page.getByRole('button', { name:'Save analysis evidence' }).click();
  await page.reload(); await page.getByRole('tab', { name:'Evidence' }).click();
  await expect(page.getByText('analysis.firmware', { exact:true })).toBeVisible();
  await expect(page.getByText('offline-fixture', { exact:true })).toBeVisible();
  await page.getByRole('tab', { name:'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
  await page.getByRole('button', { name:'Import REA report' }).click();
  await page.getByRole('textbox', { name:'Recording input' }).fill('{"operation":"execute"}');
  await page.getByRole('button', { name:'Analyse recording' }).click();
  await expect(page.getByText(/Analysis error:/)).toBeVisible();
  await expect(page.getByRole('button', { name:'Save analysis evidence' })).toBeDisabled();
});

test('offline BLE keeps synthetic provenance, invalidates edits, and reopens verified evidence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
  const save = page.getByRole('button', { name: 'Save BLE evidence locally' });
  const input = page.getByRole('textbox', { name: 'Offline BLE document' });
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Load synthetic BTHome demo' }).click();
  const original = await input.inputValue();
  await page.getByRole('button', { name: 'Interpret offline BLE' }).click();
  await expect(page.getByText('SYNTHETIC FIXTURE', { exact: true })).toBeVisible();
  const diagnostic = page.getByText('FCD2: service data present; Android UUID-list entry not present in supplied source.', { exact: true });
  await expect(diagnostic).toBeVisible();
  await expect(page.getByText(/"authenticatedIdentity": false/)).toBeVisible();
  await page.getByRole('tab', { name: 'Devices' }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
  await expect(input).toHaveValue(original);
  await input.fill(original + '\n');
  await expect(save).toBeDisabled();
  await expect(diagnostic).toHaveCount(0);
  await expect(page.getByText(/"authenticatedIdentity": false/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Interpret offline BLE' }).click();
  await save.click();
  await expect(page.getByText('BLE document saved to local evidence.')).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Interpret offline BLE' }).click();
  await expect(save).toBeDisabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('apex-evidence-v1')).map(JSON.parse));
  expect(saved).toHaveLength(1);
  expect(saved[0].source).toBe('offline-fixture');
  expect(saved[0].payload.document).toBe(original + '\n');
  await page.reload(); await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.getByText(/"authenticatedIdentity": false/)).toHaveCount(0);
  await page.getByRole('button', { name: /^Verify and reopen BLE / }).click();
  await expect(page.getByText(/Digest verified. Reinterpreted locally/)).toBeVisible();
  await expect(diagnostic).toBeVisible();
  await expect(page.getByText(/"authenticatedIdentity": false/)).toBeVisible();
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.getByText(/"authenticatedIdentity": false/)).toHaveCount(0);
});

test('offline BLE rejects malformed input and refuses to reinterpret tampered evidence', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
  await page.getByRole('button', { name: 'Import offline BLE' }).click();
  const input = page.getByRole('textbox', { name: 'Offline BLE document' });
  await input.fill('{"operation":"scan"}');
  await page.getByRole('button', { name: 'Interpret offline BLE' }).click();
  await expect(page.getByText(/BLE import error:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save BLE evidence locally' })).toBeDisabled();
  await page.getByRole('button', { name: 'Load synthetic BTHome demo' }).click();
  await page.getByRole('button', { name: 'Interpret offline BLE' }).click();
  await page.getByRole('button', { name: 'Save BLE evidence locally' }).click();
  await expect(page.getByText('BLE document saved to local evidence.')).toBeVisible();
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('apex-evidence-v1'));
    const record = JSON.parse(rows[0]);
    record.payload.document += ' ';
    rows[0] = JSON.stringify(record);
    localStorage.setItem('apex-evidence-v1', JSON.stringify(rows));
  });
  await page.reload(); await page.getByRole('tab', { name: 'Evidence' }).click();
  await page.getByRole('button', { name: /^Verify and reopen BLE / }).click();
  await expect(page.getByText(/Evidence digest mismatch. BLE interpretation was not opened/)).toBeVisible();
  await expect(page.getByText(/"authenticatedIdentity": false/)).toHaveCount(0);
});

test('pending BLE save and verification cannot overwrite edits or a newer tab visit', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
  await page.getByRole('button', { name: 'Load synthetic BTHome demo' }).click();
  await page.getByRole('button', { name: 'Interpret offline BLE' }).click();
  // Hold only digest work, after the user has explicitly chosen save/reopen.
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    window.completedBleDigests = 0;
    crypto.subtle.digest = async (...args) => {
      await new Promise(resolve => { window.releaseBleDigest = resolve; });
      const result = await original(...args);
      window.completedBleDigests++;
      return result;
    };
  });
  await page.getByRole('button', { name: 'Save BLE evidence locally' }).click();
  await expect(page.getByRole('button', { name: 'Save BLE evidence locally' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Offline BLE document' }).fill('{}');
  await page.getByRole('tab', { name: 'Devices' }).click();
  await page.evaluate(() => window.releaseBleDigest());
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('apex-evidence-v1') ?? '[]').length)).toBe(1);
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
  await expect(page.getByRole('textbox', { name: 'Offline BLE document' })).toHaveValue('{}');
  await expect(page.getByText(/Input changed. Interpret again/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save BLE evidence locally' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await page.getByRole('button', { name: /^Verify and reopen BLE / }).click();
  await expect(page.getByText('Verifying retained document…')).toBeVisible();
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await page.evaluate(() => window.releaseBleDigest());
  await expect.poll(() => page.evaluate(() => window.completedBleDigests)).toBe(2);
  // Wait for the resolved digest callback and React's following paint before
  // asserting absence; an immediate negative assertion can pass prematurely.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByText(/Digest verified. Reinterpreted locally/)).toHaveCount(0);
  await expect(page.getByText(/"authenticatedIdentity": false/)).toHaveCount(0);
});

test('offline BLE decoded output fits a phone viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
  await page.getByRole('button', { name: 'Load synthetic BTHome demo' }).click();
  await page.getByRole('button', { name: 'Interpret offline BLE' }).click();
  await expect(page.getByText(/"authenticatedIdentity": false/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByText('SYNTHETIC FIXTURE', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('ble-phone-interpretation.png') });
  await page.getByRole('button', { name: 'Save BLE evidence locally' }).click();
  await expect(page.getByText('BLE document saved to local evidence.')).toBeVisible();
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await page.getByRole('button', { name: /^Verify and reopen BLE / }).click();
  await expect(page.getByText(/Digest verified. Reinterpreted locally/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


for (const inputKind of ['android-scan-record', 'ios-advertisement-fields']) {
  test(`recorded-import ${inputKind} retains source claims across save and reopen`, async ({ page }) => {
    // Controlled test envelope exercising the imported-source label, not a real capture.
    const fixtures = JSON.parse(readFileSync(new URL('./fixtures/ble-observations.json', import.meta.url), 'utf8'));
    const envelope = fixtures.find(item => item.inputKind === inputKind);
    envelope.provenance = { origin: 'recorded-import', label: 'Browser test envelope; no RF reception claimed', capturedAt: '2026-11-07T00:00:00.000Z' };
    const document = JSON.stringify(envelope, null, 2) + '\n';
    await page.goto('/');
    await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
    await page.getByRole('button', { name: 'Import offline BLE' }).click();
    await page.getByRole('textbox', { name: 'Offline BLE document' }).fill(document);
    await page.getByRole('button', { name: 'Interpret offline BLE' }).click();
    await expect(page.getByText('RECORDED IMPORT / UNVERIFIED', { exact: true })).toBeVisible();
    await expect(page.getByText(/"physicalReceptionVerified": false/)).toBeVisible();
    await expect(page.getByText(/"authenticatedIdentity": false/)).toBeVisible();
    if (inputKind === 'ios-advertisement-fields') {
      await expect(page.getByText(/"rawAdvertising": null/)).toBeVisible();
      await expect(page.getByText(/"captureCompleteness": "not-exposed"/)).toBeVisible();
    }
    await page.getByRole('button', { name: 'Save BLE evidence locally' }).click();
    await expect(page.getByText('BLE document saved to local evidence.')).toBeVisible();
    const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('apex-evidence-v1')).map(JSON.parse));
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('offline-import');
    expect(rows[0].payload.document).toBe(document);
    await page.reload();
    await page.getByRole('tab', { name: 'Evidence' }).click();
    await expect(page.getByText('offline-import', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Verify and reopen BLE / }).click();
    await expect(page.getByText(/Digest verified. Reinterpreted locally/)).toBeVisible();
    await expect(page.getByText(/"physicalReceptionVerified": false/)).toBeVisible();
    await expect(page.getByText(/"authenticatedIdentity": false/)).toBeVisible();
  });
}

for (const platform of ['android', 'ios']) {
  test(`selected-source ${platform} preserves exact text and explicitly reopens`, async ({ page }) => {
    const document = readFileSync(new URL(`../src/fixtures/ble-plx-${platform}-source.json`, import.meta.url), 'utf8') + ' \n';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
    await page.getByRole('button', { name: 'Import phone selected-source document' }).click();
    await page.getByRole('textbox', { name: 'Offline BLE document' }).fill(document);
    await page.getByRole('button', { name: 'Interpret offline BLE' }).click();
    await expect(page.getByText('SYNTHETIC SELECTED SOURCE', { exact: true })).toBeVisible();
    await expect(page.getByText(/Preview only/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('apex-evidence-v1') ?? '[]'))).toHaveLength(0);
    await page.getByRole('button', { name: 'Save BLE evidence locally' }).click();
    await expect(page.getByText('This exact document was saved locally.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save BLE evidence locally' })).toBeDisabled();
    const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('apex-evidence-v1')).map(JSON.parse));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('analysis.ble-source');
    expect(rows[0].payload.document).toBe(document);
    await page.reload(); await page.getByRole('tab', { name: 'Evidence' }).click();
    await page.getByRole('button', { name: /^Verify and reopen BLE / }).click();
    await expect(page.getByText(/Digest verified. Reinterpreted locally/)).toBeVisible();
    await expect(page.getByText('SYNTHETIC SELECTED SOURCE', { exact: true })).toBeVisible();
    await expect(page.getByText(/Exact retained selected-source document:/)).toBeVisible();
    await expect(page.getByText(/"authenticatedIdentity": false/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

// NDEF scenarios are authored for the existing local browser runner; no hardware APIs.
test('NDEF preview, interpretation, inert URI and explicit journal reopen', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Serialized NDEF');
  const save = page.getByRole('button', { name: 'Save NDEF evidence locally' });
  await page.getByRole('button', { name: 'Load synthetic NDEF URI' }).click();
  await expect(save).toBeDisabled();
  await expect(page.getByText('SYNTHETIC NDEF FIXTURE', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Interpret offline NDEF' }).click();
  await expect(page.getByText('URI text (not actionable): "https://example.com"', { exact: true })).toBeVisible();
  await expect(page.locator('a[href="https://example.com"]')).toHaveCount(0);
  await expect(page.getByText('Preview only. NDEF document not saved.', { exact: true })).toBeVisible();
  await save.click(); await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Interpret offline NDEF' }).click(); await expect(save).toBeDisabled();
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.getByText('analysis.ndef', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: /^Verify and reopen NDEF / }).click();
  await expect(page.getByText('Digest verified. NDEF reinterpreted locally; reception and identity still unverified.', { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('tab', { name: 'Evidence' }).click();
  await page.getByRole('button', { name: /^Verify and reopen NDEF / }).click();
  await expect(page.getByText('URI text (not actionable): "https://example.com"', { exact: true })).toBeVisible();
});
test('NDEF edits and complete oversized imports invalidate save without truncation', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Serialized NDEF');
  const input = page.getByRole('textbox', { name: 'Offline NDEF document' });
  const save = page.getByRole('button', { name: 'Save NDEF evidence locally' });
  const interpret = page.getByRole('button', { name: 'Interpret offline NDEF' });
  await page.getByRole('button', { name: 'Load synthetic NDEF Text' }).click(); await interpret.click();
  await expect(save).toBeEnabled();
  const document = await input.inputValue();
  await input.fill('{}'); await expect(save).toBeDisabled();
  await expect(page.getByText('SYNTHETIC NDEF FIXTURE', { exact: true })).toHaveCount(0);
  await interpret.click(); await expect(page.getByText(/NDEF import error:/)).toBeVisible();
  const oversized = document.padEnd(4097, ' '); await input.fill(oversized); await interpret.click();
  await expect(input).toHaveValue(oversized); await expect(save).toBeDisabled();
  await expect(page.getByText(/Interpreted, but not saveable:/)).toBeVisible();
  await page.getByRole('tab', { name: 'Console' }).click(); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Serialized NDEF');
  await expect(input).toHaveValue(oversized); await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Import offline NDEF' }).click();
  await expect(input).toHaveValue(''); await expect(save).toBeDisabled();
});

test('foreground observation stays native-only and discloses limits on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('tab', { name: 'Devices' }).click();
  await expect(page.getByRole('button', { name: 'Start advertised-UUID BLE observation' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Stop advertised-UUID BLE observation' })).toBeDisabled();
  await expect(page.getByText(/Observation is unavailable in this web console/)).toBeVisible();
  // Both modes deliberately retain their own full native-validation warning.
  // Match each complete paragraph so neither absence nor duplication is hidden.
  await expect(page.getByText("10-second foreground window including permission preparation, at most 25 callbacks and 65536 serialized characters. No pairing, connections, writes or automatic saves. Leaving Devices or backgrounding stops collection. No native phone validation has been performed for this build.", { exact: true })).toBeVisible();
  await expect(page.getByText("Receipt times are app callback times, not hardware transmission times. Repeated callbacks need not be distinct radio packets. No matches does not prove absence, identity, ownership or complete capture. No native phone validation has been performed.", { exact: true })).toBeVisible();
  await expect(page.getByText(/this is not yet a general BTHome collector/)).toBeVisible();
  await page.getByRole('button', { name: 'Select Eddystone FEAA' }).click();
  await expect(page.getByText('Selected advertised UUID: Eddystone / FEAA', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
  await page.getByRole('tab', { name: 'Devices' }).click();
  await expect(page.getByText('Selected advertised UUID: Eddystone / FEAA', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.getByText(/No saved observations yet/)).toBeVisible();
});

// Definitions only in this environment; no browser or hardware execution claimed.
for (const platform of ['Android', 'iOS']) test(`phone NDEF ${platform}: separate drafts, inert values, explicit save and verified reopen`, async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Serialized NDEF');
  await page.getByRole('button', { name: 'Load synthetic NDEF Text' }).click();
  const wire = page.getByRole('textbox', { name: 'Offline NDEF document' }); const wireDraft = await wire.inputValue();
  await selectAnalysisInspector(page, 'Phone NDEF fields');
  const input = page.getByRole('textbox', { name: 'Phone NDEF selected-field document' });
  const save = page.getByRole('button', { name: 'Save phone NDEF source locally' });
  await page.getByRole('button', { name: `Load synthetic ${platform} NDEF fields` }).click();
  const draft = await input.inputValue(); await expect(save).toBeDisabled();
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.getByText('analysis.ndef-source', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Phone NDEF fields');
  await expect(input).toHaveValue(draft);
  await selectAnalysisInspector(page, 'Serialized NDEF');
  await expect(wire).toHaveValue(wireDraft);
  await selectAnalysisInspector(page, 'Phone NDEF fields');
  await page.getByRole('button', { name: 'Interpret phone NDEF fields' }).click();
  await expect(page.getByText('URI text (not actionable): "https://example.com"', { exact: true })).toBeVisible();
  await expect(page.locator('a[href="https://example.com"]')).toHaveCount(0);
  await save.click(); await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Interpret phone NDEF fields' }).click(); await expect(save).toBeDisabled();
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.getByText('analysis.ndef-source', { exact: true })).toHaveCount(1);
  await expect(page.getByText(/Journal saved at .*Source timestamp unavailable/)).toBeVisible();
  await page.reload(); await page.getByRole('tab', { name: 'Evidence' }).click();
  await page.getByRole('button', { name: /^Verify and reopen phone NDEF / }).click();
  await expect(page.getByText(/Digest verified. Selected phone NDEF fields reinterpreted locally/)).toBeVisible();
});
test('phone NDEF platform edits and oversized source invalidate saving without changing wire draft', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Phone NDEF fields');
  const input = page.getByRole('textbox', { name: 'Phone NDEF selected-field document' });
  const save = page.getByRole('button', { name: 'Save phone NDEF source locally' });
  const interpret = page.getByRole('button', { name: 'Interpret phone NDEF fields' });
  await page.getByRole('button', { name: 'Load synthetic Android NDEF fields' }).click();
  const draft = await input.inputValue(); await interpret.click(); await expect(save).toBeEnabled();
  await page.getByRole('button', { name: 'Expect iOS NDEF fields' }).click();
  await expect(save).toBeDisabled(); await expect(input).toHaveValue(draft);
  await expect(page.getByText('SYNTHETIC PHONE NDEF FIELDS', { exact: true })).toHaveCount(0);
  await interpret.click(); await expect(page.getByText(/NFC source mismatch/)).toBeVisible();
  await page.getByRole('button', { name: 'Expect Android NDEF fields' }).click();
  const oversized = draft.padEnd(4097, ' '); await input.fill(oversized); await interpret.click();
  await expect(input).toHaveValue(oversized); await expect(save).toBeDisabled();
  await expect(page.getByText(/Interpreted, but not saveable:/)).toBeVisible();
});

// Scenario definitions only for the BLE trial increment; execution requires separately permitted browser QA.
test('BLE trials require explicit analysis, separate sources, invalidate on edits and retain draft across tabs', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE trial builder & comparison');
  await page.getByRole('button', { name: 'Load synthetic BLE trials', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'BLE trial dataset', exact: true });
  const draft = await input.inputValue();
  await expect(page.getByText('BLE trial result · FCD2', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Analyze BLE trials', exact: true }).click();
  await expect(page.getByText('BLE trial result · FCD2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Payload offset 2 *', exact: true }).click();
  await expect(page.getByText('Selected payload offset 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select trial source 2: ios', exact: true }).click();
  await expect(page.getByText(/Selected source "ios" · declared platform ios/)).toBeVisible();
  await page.getByRole('tab', { name: 'Devices' }).click();
  await expect(input).toHaveCount(0);
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE trial builder & comparison'); await expect(input).toHaveValue(draft);
  await input.fill(draft + ' ');
  await expect(page.getByText('BLE trial result · FCD2', { exact: true })).toHaveCount(0);
  await input.fill('{}'); await page.getByRole('button', { name: 'Analyze BLE trials', exact: true }).click();
  await expect(page.getByText(/Trial dataset error:/)).toBeVisible();
  await page.getByRole('button', { name: 'Load synthetic BLE trials', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze BLE trials', exact: true }).dblclick();
  await expect(page.getByText('BLE trial result · FCD2', { exact: true })).toHaveCount(1);
  await page.reload(); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE trial builder & comparison');
  await expect(input).toHaveValue('');
  await expect(page.getByText('BLE trial result · FCD2', { exact: true })).toHaveCount(0);
});

test('BLE trial offset pages stay bounded, absent differs from zero and phone layout remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dataset = JSON.parse(readFileSync(new URL('./fixtures/ble-differential.json', import.meta.url), 'utf8'));
  dataset.sources = dataset.sources.filter(source => source.id === 'ios');
  dataset.trials = dataset.trials.filter(trial => trial.sourceId === 'ios');
  dataset.trials.forEach((trial, index) => {
    const source = JSON.parse(trial.document);
    source.snapshot.serviceData = { FCD2: Buffer.from('41' + '00'.repeat(index === 0 ? 33 : 32), 'hex').toString('base64') };
    trial.document = JSON.stringify(source);
  });
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'BLE trial builder & comparison');
  await page.getByRole('textbox', { name: 'BLE trial dataset', exact: true }).fill(JSON.stringify(dataset));
  await page.getByRole('button', { name: 'Analyze BLE trials', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Payload offset / })).toHaveCount(16);
  await page.getByRole('button', { name: 'Next trial offsets', exact: true }).click();
  await page.getByRole('button', { name: 'Next trial offsets', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Payload offset / })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Next trial offsets', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Payload offset 33 *', exact: true }).click();
  await expect(page.getByText(/hex values in listed group trial order: \["00",null\]/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// Authored scenarios only for the candidate increment; browser/native execution is not claimed.
test('BLE candidate explicit checks retain drafts across tabs and clear stale results', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Numeric BLE candidate');
  const input = page.getByRole('textbox', { name: 'BLE candidate document', exact: true });
  const analyze = page.getByRole('button', { name: 'Analyze BLE candidate', exact: true });
  const result = page.getByText('Declared BLE candidate result', { exact: true });
  await page.getByRole('button', { name: 'Load synthetic BLE candidate', exact: true }).click();
  const draft = await input.inputValue(); await expect(result).toHaveCount(0);
  await analyze.dblclick(); await expect(result).toHaveCount(1);
  await expect(page.getByText(/Exact value: 20\/1 \(approximate display only: 20\)/).first()).toBeVisible();
  await expect(page.getByText(/Operator-designated held-out: 2 rows/)).toBeVisible();
  await page.getByRole('button', { name: 'Select candidate source 2: ios', exact: true }).click();
  await expect(page.getByText(/Candidate source "ios" · declared platform ios/)).toBeVisible();
  await page.getByRole('tab', { name: 'Devices' }).click(); await expect(input).toHaveCount(0);
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Numeric BLE candidate'); await expect(input).toHaveValue(draft);
  await input.fill(draft + ' '); await expect(result).toHaveCount(0);
  await input.fill('{}'); await analyze.click(); await expect(page.getByText(/Candidate document error:/)).toBeVisible();
  await page.getByRole('button', { name: 'Load synthetic BLE candidate', exact: true }).click(); await analyze.click();
  await input.fill(draft.padEnd(262145, ' '));
  await expect(input).toHaveValue(draft); await expect(result).toHaveCount(0);
  await expect(page.getByText(/Paste rejected whole: maximum 262144/)).toBeVisible();
  await page.getByRole('button', { name: 'Start BLE candidate import', exact: true }).click(); await expect(input).toHaveValue('');
  await input.fill(draft); await analyze.click();
  await page.reload(); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Numeric BLE candidate');
  await expect(input).toHaveValue(''); await expect(result).toHaveCount(0);
});

test('BLE candidate source pages stay bounded and imported labels are inert on phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Numeric BLE candidate');
  await page.getByRole('button', { name: 'Load synthetic BLE candidate', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'BLE candidate document', exact: true });
  const document = JSON.parse(await input.inputValue()); const dataset = JSON.parse(document.dataset);
  for (let i = 0; i < 5; i++) {
    const trial = { ...dataset.trials[0], id: `extra-${i}`, receiptId: `extra-receipt-${i}` };
    dataset.trials.push(trial); document.assignments.push({ trialId: trial.id, subset: 'held-out', expected: '20' });
  }
  // This operator-controlled label is never an actionable URL.
  dataset.trials[0].receiptId = 'https://example.com';
  document.dataset = JSON.stringify(dataset); document.candidate.divisor = 3;
  await input.fill(JSON.stringify(document)); await page.getByRole('button', { name: 'Analyze BLE candidate', exact: true }).click();
  await expect(page.getByText(/^Candidate trial /)).toHaveCount(4);
  await expect(page.getByText(/receipt \"https:\/\/example.com\"/)).toBeVisible();
  await expect(page.getByText(/Exact value: 2000\/3 \(approximate display only:/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Next candidate rows', exact: true }).click();
  await page.getByRole('button', { name: 'Next candidate rows', exact: true }).click();
  await expect(page.getByText(/^Candidate trial /)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Next candidate rows', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Select candidate source 2: ios', exact: true }).click();
  await expect(page.getByText(/^Candidate trial /)).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Previous candidate rows', exact: true })).toBeDisabled();
  await expect(page.locator('a[href="https://example.com"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  document.candidate.byteOffset = 4; await input.fill(JSON.stringify(document));
  await page.getByRole('button', { name: 'Analyze BLE candidate', exact: true }).click();
  await expect(page.getByText(/Exact value: incomplete \(not zero\)/).first()).toBeVisible();
});

test('phone NDEF capture is unavailable on web and remains separate from explicit import', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Devices', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset APEX Bluetooth', exact: true })).toBeDisabled();
  await expect(page.getByText(/Pending native operations may still prevent recovery/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read one phone NDEF tag', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Inspect captured phone NDEF fields', exact: true })).toBeDisabled();
  await expect(page.getByText(/Inspect replaces the Offline phone NDEF/)).toBeVisible();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click(); await selectAnalysisInspector(page, 'Phone NDEF fields');
  await page.getByRole('button', { name: 'Load synthetic Android NDEF fields', exact: true }).click();
  const draft = await page.getByLabel('Phone NDEF selected-field document', { exact: true }).inputValue();
  await expect(page.getByRole('button', { name: 'Save phone NDEF source locally', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Devices', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click(); await selectAnalysisInspector(page, 'Phone NDEF fields');
  await expect(page.getByLabel('Phone NDEF selected-field document', { exact: true })).toHaveValue(draft);
  await expect(page.getByRole('button', { name: 'Save phone NDEF source locally', exact: true })).toBeDisabled();
});

// Authored for later browser validation; not executed as part of this change.
test('service-data mode is separate and disabled on web without broadening advertised-UUID mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Devices' }).click();
  await expect(page.getByText('Experimental Android service-data observation', { exact: true })).toBeVisible();
  await expect(page.getByText('Unavailable on web: this mode requires a native Android development build.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Opt in to broad SDK reception for one session', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start service-data observation', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Stop service-data observation', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start advertised-UUID BLE observation', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Select service-data FEAA', exact: true }).click();
  await expect(page.getByText('Selected service-data: FEAA', { exact: true })).toBeVisible();
  await expect(page.getByText('Selected advertised UUID: BTHome / FCD2', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
  await page.getByRole('tab', { name: 'Devices' }).click();
  await expect(page.getByRole('button', { name: 'Start service-data observation', exact: true })).toBeDisabled();
});

// Authored only: not executed in this change; no physical BLE acceptance claim.
test('BLE authoring stages exact sources and hands off only after explicit build and use', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click(); await selectAnalysisInspector(page, 'BLE / BTHome');
  const button = name => page.getByRole('button', { name, exact: true });
  const fill = (name, value) => page.getByLabel(name, { exact: true }).fill(value);
  await expect(button('Stage selected BLE source for trial')).toBeDisabled();
  await button('Load synthetic Android source').click();
  const exact = '\n' + await page.getByLabel('Offline BLE document', { exact: true }).inputValue() + '  ';
  await fill('Offline BLE document', exact);
  await button('Interpret offline BLE').click();
  await button('Stage selected BLE source for trial').click();
  await expect(button('Choose Analysis inspector: BLE trial builder & comparison')).toBeVisible();
  await expect(button('Stage selected BLE source for trial')).toHaveCount(0);
  await expect(page.getByText(/Current service: not declared/)).toBeVisible();
  await fill('Scope declaration (type owned-lab)', 'owned-lab');
  await fill('Selected service (FCD2 or FEAA)', 'FCD2');
  await button('Start new declared BLE draft').click();
  for (const id of ['baseline', 'changed']) {
    await fill('Group ID', id); await fill('Group condition', `Synthetic ${id}`);
    await button('Add declared group').click();
  }
  await fill('Source alias ID', 'lab-alias');
  await fill('Declared platform (android or ios)', 'android');
  await fill('Snapshot ID mode (null or string)', 'string');
  await fill('Declared snapshot ID string', JSON.parse(exact).snapshot.id);
  await fill('Declared origin (synthetic-fixture or recorded-import)', 'synthetic-fixture');
  await button('Add declared source').click();
  for (const id of ['baseline', 'changed']) {
    await fill('Trial ID', `trial-${id}`); await fill('Trial group ID', id);
    await fill('Trial source alias ID', 'lab-alias'); await fill('Trial receipt reference', `reference-${id}`);
    await button('Add staged trial').click();
  }
  await button('Build and validate BLE dataset').click();
  await expect(button('Use dataset in BLE comparison')).toBeEnabled();
  await fill('Group condition', 'Pending form edit');
  await expect(button('Use dataset in BLE comparison')).toBeDisabled();
  await button('Build and validate BLE dataset').click();
  await button('Use dataset in BLE comparison').click();
  await expect(button('Use dataset in BLE comparison')).toBeDisabled();
  const exported = JSON.parse(await page.getByLabel('BLE trial dataset', { exact: true }).inputValue());
  expect(exported.trials.map(row => row.document)).toEqual([exact, exact]);
  await expect(page.getByText(/BLE trial result ·/)).toHaveCount(0);
  await button('Analyze BLE trials').click();
  await expect(page.getByText('BLE trial result · FCD2', { exact: true })).toBeVisible();
  await button('Remove sources lab-alias').click();
  await expect(page.getByText(/^Authoring error:/)).toBeVisible();
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click(); await selectAnalysisInspector(page, 'BLE trial builder & comparison');
  await expect(page.getByLabel('Group condition', { exact: true })).toHaveValue('Pending form edit');
  await expect(page.getByText(/Current service: FCD2/)).toBeVisible();
  await page.reload(); await page.getByRole('tab', { name: 'Analysis', exact: true }).click(); await selectAnalysisInspector(page, 'BLE trial builder & comparison');
  await expect(page.getByText(/Current service: not declared/)).toBeVisible();
  await expect(page.getByLabel('BLE trial dataset', { exact: true })).toHaveValue('');
});

// Recording lifecycle definitions only; this host does not execute browser acceptance.
test('legacy recording edits clear stale reports and successful saves consume the current draft', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
  const input = page.getByRole('textbox', { name: 'Recording input' });
  const save = page.getByRole('button', { name: 'Save analysis evidence', exact: true });
  const analyze = page.getByRole('button', { name: 'Analyse recording', exact: true });
  await analyze.click(); await expect(page.getByText(/"command": 52/)).toBeVisible();
  await input.fill('[1,2]');
  await expect(page.getByText(/"command": 52/)).toHaveCount(0);
  await expect(page.getByText('Input changed. Analyse again before saving.')).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Load CAN fixture' }).click();
  await analyze.click(); await save.click();
  await expect(page.getByText('Analysis saved to local evidence.')).toBeVisible();
  await expect(save).toBeDisabled(); await analyze.click(); await expect(save).toBeDisabled();
  await page.getByRole('tab', { name: 'Evidence' }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording'); await expect(save).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('apex-evidence-v1')).length)).toBe(1);
});

test('legacy recording pending save preserves selected evidence without restoring a replaced report', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
  await page.getByRole('button', { name: 'Analyse recording', exact: true }).click();
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      await new Promise(resolve => { window.releaseRecordingDigest = resolve; });
      return original(...args);
    };
  });
  await page.getByRole('button', { name: 'Save analysis evidence', exact: true }).click();
  await page.getByRole('button', { name: 'Load CAN fixture' }).click();
  await page.getByRole('button', { name: 'Analyse recording', exact: true }).click();
  await expect(page.getByText(/"frames": 2/)).toBeVisible();
  await page.evaluate(() => window.releaseRecordingDigest());
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('apex-evidence-v1') ?? '[]').length)).toBe(1);
  await expect(page.getByRole('button', { name: 'Save analysis evidence', exact: true })).toBeEnabled();
  await expect(page.getByText(/"command": 52/)).toHaveCount(0);
  await expect(page.getByText(/"frames": 2/)).toBeVisible();
  const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('apex-evidence-v1')).map(JSON.parse));
  expect(rows[0].kind).toBe('analysis.nec');
});

test('legacy recording refresh failure after persistence does not invite a duplicate save', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
  await page.getByRole('button', { name: 'Analyse recording', exact: true }).click();
  await page.evaluate(() => {
    const read = Storage.prototype.getItem;
    const write = Storage.prototype.setItem;
    let failNextRead = false;
    Storage.prototype.setItem = function (key, value) {
      write.call(this, key, value);
      if (key === 'apex-evidence-v1') failNextRead = true;
    };
    Storage.prototype.getItem = function (key) {
      if (key === 'apex-evidence-v1' && failNextRead) {
        failNextRead = false;
        throw new Error('Injected post-commit list failure');
      }
      return read.call(this, key);
    };
  });
  const save = page.getByRole('button', { name: 'Save analysis evidence', exact: true });
  await save.click();
  await expect(page.getByText(/Analysis saved, but evidence refresh failed:/)).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Analyse recording', exact: true }).click();
  await expect(save).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('apex-evidence-v1')).length)).toBe(1);
});

// Authored acceptance only: no browser/native execution is claimed for this size-limit change.
test('Recording input rejects oversized whole pastes and cannot save a valid truncated prefix', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
  const input = page.getByRole('textbox', { name: 'Recording input', exact: true });
  const analyze = page.getByRole('button', { name: 'Analyse recording', exact: true });
  const save = page.getByRole('button', { name: 'Save analysis evidence', exact: true });
  for (const fixture of ['Load NEC fixture', 'Load CAN fixture', 'Load REA sample']) {
    await page.getByRole('button', { name: fixture, exact: true }).click();
    const draft = await input.inputValue();
    await analyze.click(); await expect(save).toBeEnabled();
    await expect(input).not.toHaveAttribute('maxlength', /.+/);
    await input.fill(draft.padEnd(262144, ' ') + 'invalid trailing data');
    await expect(input).toHaveValue(draft);
    await expect(page.getByText(/Paste rejected whole: maximum 262144/)).toBeVisible();
    await expect(save).toBeDisabled(); await analyze.dblclick(); await expect(save).toBeDisabled();
    await page.getByRole('tab', { name: 'Devices' }).click();
    await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Recording');
    await expect(input).toHaveValue(draft); await expect(save).toBeDisabled();
    await input.fill(draft + ' '); await analyze.click(); await expect(save).toBeEnabled();
  }
});

test('offline Flipper draft is explicit, memory-only, bounded and inert', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Flipper responses');
  const draft = page.getByRole('textbox', { name: 'Offline Flipper hex draft' });
  const inspect = page.getByRole('button', { name: 'Inspect offline Flipper responses', exact: true });
  const result = page.getByText(/Flipper inspection:/);
  await page.getByRole('button', { name: 'Load synthetic Flipper response', exact: true }).click();
  const original = await draft.inputValue();
  await expect(result).toHaveCount(0);
  await inspect.click(); await expect(result).toContainText('1 frames');
  await page.getByRole('tab', { name: 'Console' }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Flipper responses');
  await expect(draft).toHaveValue(original);
  await draft.fill('gg'); await expect(draft).toHaveValue(original); await expect(result).toHaveCount(0);
  await draft.fill('00 '.repeat(9)); await inspect.click();
  await expect(page.getByText(/^Response frame /)).toHaveCount(4);
  await page.getByRole('button', { name: 'Next Flipper frames', exact: true }).click();
  await page.getByRole('button', { name: 'Next Flipper frames', exact: true }).click();
  await expect(page.getByText(/^Response frame /)).toHaveCount(1);
  await page.getByRole('button', { name: 'Declare imported Flipper bytes', exact: true }).click();
  await expect(result).toHaveCount(0);
  const value = 'https://example.invalid/<script>\n';
  const payload = [0x8a, 2, value.length + 2, 0x12, value.length, ...new TextEncoder().encode(value)];
  await draft.fill([payload.length, ...payload].map(v => v.toString(16).padStart(2, '0')).join(' '));
  await inspect.click();
  await expect(page.getByText(`value: present true, effective ${JSON.stringify(value)}`, { exact: true })).toBeVisible();
  await expect(page.locator('a[href="https://example.invalid/<script>"]')).toHaveCount(0);
  await page.reload(); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'Flipper responses');
  await expect(draft).toHaveValue(''); await expect(result).toHaveCount(0);
});

// Authored acceptance scenario only until executed in an authorized browser environment.
// Uses synthetic records and the existing exact-string bundle/digest implementation.
test('selected evidence bundle preview is isolated, paginated and fenced across edits and tabs', async ({ page }) => {
  const { bundleFixture } = await import('./bundle-preview-fixture.ts');
  const { bundle } = await bundleFixture(9);
  await page.goto('/');
  const journal = await page.evaluate(() => localStorage.getItem('apex-evidence-v1'));
  await page.getByRole('tab', { name: 'Evidence' }).click();
  const draft = page.getByRole('textbox', { name: 'Selected evidence bundle draft' });
  const inspect = page.getByRole('button', { name: 'Inspect evidence bundle', exact: true });
  const result = page.getByText('Verified bundle summary', { exact: true });
  await draft.fill(bundle); await expect(result).toHaveCount(0); await inspect.click();
  await expect(result).toBeVisible(); await expect(page.getByText(/^Listed record /)).toHaveCount(4);
  await expect(page.getByText(/The whole-bundle digest covers/)).toContainText('not outer JSON formatting');
  await expect(page.getByText(/Digests are not signatures:/)).toContainText('does not establish a complete journal');
  await page.getByRole('button', { name: 'Next bundle records', exact: true }).click();
  await page.getByRole('button', { name: 'Next bundle records', exact: true }).click();
  await expect(page.getByText(/^Listed record /)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Next bundle records', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Console' }).click(); await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(draft).toHaveValue(bundle); await expect(result).toHaveCount(0);
  await inspect.click(); await expect(result).toBeVisible();
  await draft.fill(bundle.padEnd(2097153, ' '));
  await expect(draft).toHaveValue(bundle); await expect(result).toHaveCount(0); await expect(inspect).toBeDisabled();
  await expect(page.getByText(/Paste rejected whole: maximum 2097152/)).toBeVisible();
  await page.getByRole('tab', { name: 'Console' }).click(); await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(inspect).toBeDisabled(); await expect(draft).toHaveValue(bundle);
  await draft.fill(bundle + ' '); await expect(inspect).toBeEnabled(); await inspect.click(); await expect(result).toBeVisible();
  await draft.fill('{}'); await expect(result).toHaveCount(0); await inspect.click();
  await expect(page.getByText(/Bundle inspection failed:/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear bundle preview', exact: true }).click();
  await expect(draft).toHaveValue(''); await expect(page.getByText(/Bundle inspection failed:/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('apex-evidence-v1'))).toBe(journal);
});

test('ordinary IR inspector keeps exact memory-only draft, gates rejected edits and clears results across tabs', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'IR remote files');
  const draft = page.getByRole('textbox', { name: 'Ordinary IR remote draft' });
  const inspect = page.getByRole('button', { name: 'Inspect ordinary IR remote', exact: true });
  await page.getByRole('button', { name: 'Load synthetic IR example', exact: true }).click();
  const source = await draft.inputValue();
  await expect(page.getByText(/^IR inspection:/)).toHaveCount(0);
  await inspect.click(); await expect(page.getByText(/^IR inspection: 2 records/)).toBeVisible();
  await expect(page.getByText(/Whole-array NEC recognition: recognized/)).toBeVisible();
  await page.getByRole('button', { name: 'Declare imported IR source', exact: true }).click();
  await expect(page.getByText(/^IR inspection:/)).toHaveCount(0); await inspect.click();
  await expect(page.getByText(/^IR inspection: 2 records/)).toBeVisible();
  await draft.fill('é'); await expect(inspect).toBeDisabled(); await expect(draft).toHaveValue(source);
  await page.getByRole('tab', { name: 'Research' }).click(); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'IR remote files');
  await expect(inspect).toBeDisabled(); await expect(draft).toHaveValue(source); await expect(page.getByText(/^IR inspection:/)).toHaveCount(0);
  const header = 'Filetype: IR signals file\nVersion: 1\n';
  const record = 'name: https://example.invalid/<script>inert</script>\ntype: parsed\nprotocol: NEC\naddress: 04 00 00 00\ncommand: 08 00 00 00\n';
  const dense = header + record.repeat(9); await draft.fill(dense); await inspect.click();
  await expect(page.getByText(/^IR record [0-9]+ ·/)).toHaveCount(4);
  await page.getByRole('button', { name: 'Next IR records', exact: true }).click();
  await expect(page.getByText('IR record 5 · parsed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next IR records', exact: true }).click();
  await expect(page.getByText(/^IR record [0-9]+ ·/)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Next IR records', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Research' }).click(); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'IR remote files');
  await expect(draft).toHaveValue(dense); await expect(page.getByText(/^IR inspection:/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear IR draft', exact: true }).click(); await expect(draft).toHaveValue('');
  await page.getByRole('button', { name: 'Load synthetic IR example', exact: true }).click();
  await page.reload(); await page.getByRole('tab', { name: 'Analysis' }).click(); await selectAnalysisInspector(page, 'IR remote files'); await expect(draft).toHaveValue('');
});

// Authored-only scenario. Listed locally; not executed where browser sockets are denied.
test('memory-only HCI metadata then explicit legacy selection', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click(); await selectAnalysisInspector(page, 'HCI captures');
  await page.getByRole('button', { name: 'Load synthetic HCI example', exact: true }).click();
  await expect(page.getByText('HCI metadata:', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Inspect HCI metadata', exact: true }).click();
  await expect(page.getByText('HCI metadata: 1 records', { exact: false })).toBeVisible();
  await expect(page.getByText('Selected legacy event', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select legacy HCI event 0', exact: true }).click();
  await expect(page.getByText('Selected legacy event 0: 1 reports', { exact: true })).toBeVisible();
  await page.getByLabel('HCI hex draft', { exact: true }).fill('00 ');
  await expect(page.getByRole('button', { name: 'Inspect HCI metadata', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click(); await selectAnalysisInspector(page, 'HCI captures');
  await expect(page.getByRole('button', { name: 'Inspect HCI metadata', exact: true })).toBeDisabled();
  await expect(page.getByText('Selected legacy event', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear HCI draft', exact: true }).click();
  await expect(page.getByLabel('HCI hex draft', { exact: true })).toHaveValue('');
});

// Authored-only, list-only in this environment. No physical capture or browser execution.
test('explicit extended HCI headers stay separate and reset on tab exit', async ({ page }) => {
  const row = Buffer.alloc(24); row[2]=255; row[9]=3; row[10]=4; row[11]=255; row[12]=127; row[13]=192;
  const payload=Buffer.concat([Buffer.from([4,62,26,13,1]),row]);
  const record=Buffer.alloc(24);record.writeUInt32BE(payload.length);record.writeUInt32BE(payload.length,4);record.writeUInt32BE(3,8);
  const hex='6274736e6f6f700000000001000003ea'+record.toString('hex')+payload.toString('hex');
  await page.goto('/');await page.getByRole('tab',{name:'Analysis',exact:true}).click(); await selectAnalysisInspector(page, 'HCI captures');
  await page.getByLabel('HCI hex draft',{exact:true}).fill(hex);
  await page.getByRole('button',{name:'Declare synthetic HCI source',exact:true}).click();
  await page.getByRole('button',{name:'Inspect HCI metadata',exact:true}).click();
  await expect(page.getByText(/^Selected extended event/)).toHaveCount(0);
  await page.getByRole('button',{name:'Select extended HCI metadata 0',exact:true}).click();
  await expect(page.getByText('Selected extended event 0: 1 header reports',{exact:true})).toBeVisible();
  await expect(page.getByText(/^Selected legacy event/)).toHaveCount(0);
  await expect(page.getByText(/Terminal complete may be the last fragment only/)).toBeVisible();
  await page.getByRole('tab',{name:'Research',exact:true}).click();await page.getByRole('tab',{name:'Analysis',exact:true}).click(); await selectAnalysisInspector(page, 'HCI captures');
  await expect(page.getByText(/^Selected extended event/)).toHaveCount(0);await expect(page.getByLabel('HCI hex draft',{exact:true})).toHaveValue(hex);
});


// Authored chooser acceptance only; listing does not launch a browser.
test('Analysis chooser shows one inspector, retains selection across tabs and performs no implicit analysis', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose Analysis inspector: Recording', exact: true })).toBeVisible();
  const inspectors = [
    ['Recording', 'Analyse recording'],
    ['BLE / BTHome', 'Interpret offline BLE'],
    ['BLE trial builder & comparison', 'Analyze BLE trials'],
    ['Numeric BLE candidate', 'Analyze BLE candidate'],
    ['Flipper responses', 'Inspect offline Flipper responses'],
    ['IR remote files', 'Inspect ordinary IR remote'],
    ['HCI captures', 'Inspect HCI metadata'],
    ['HCI selected event document', 'Verify/reopen HCI document'],
    ['Serialized NDEF', 'Interpret offline NDEF'],
    ['Phone NDEF fields', 'Interpret phone NDEF fields'],
    ['Static NFC data area', 'Inspect static NFC'],
    ['HCI report byte comparison', 'Compare explicit HCI reports'],
  ];
  const journal = await page.evaluate(() => localStorage.getItem('apex-evidence-v1'));
  await page.getByRole('button', { name: 'Choose Analysis inspector: Recording', exact: true }).click();
  for (const [label] of inspectors) {
    await expect(page.getByRole('button', { name: `Select ${label}`, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Select BLE / BTHome', exact: true }).click();
  await page.getByRole('button', { name: 'Load synthetic BTHome demo', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'Offline BLE document', exact: true });
  const draft = await source.inputValue();
  for (const [label, action] of inspectors) {
    await selectAnalysisInspector(page, label);
    await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible();
    for (const [other, otherAction] of inspectors) {
      if (other !== label) await expect(page.getByRole('button', { name: otherAction, exact: true })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await selectAnalysisInspector(page, 'BLE / BTHome');
  await expect(source).toHaveValue(draft);
  await expect(page.getByRole('button', { name: 'Save BLE evidence locally', exact: true })).toBeDisabled();
  await expect(page.getByText(/"authenticatedIdentity": false/)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose Analysis inspector: BLE / BTHome', exact: true })).toBeVisible();
  await expect(source).toHaveValue(draft);
  expect(await page.evaluate(() => localStorage.getItem('apex-evidence-v1'))).toBe(journal);
  await page.reload();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose Analysis inspector: Recording', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save analysis evidence', exact: true })).toBeDisabled();
  await expect(source).toHaveCount(0);
});

// Authored/list-only: no browser or native execution claimed.
test('static NFC chooser keeps exact mode, rejection fence and drafts separate from Phone and serialized NDEF', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await selectAnalysisInspector(page, 'Static NFC data area');
  const draft = page.getByLabel('Static NFC hex draft', { exact: true });
  const inspect = page.getByRole('button', { name: 'Inspect static NFC', exact: true });
  const synthetic = '0300fe' + '00'.repeat(45);
  await page.getByRole('button', { name: 'Load synthetic empty data-area example', exact: true }).click();
  await expect(draft).toHaveValue(synthetic);
  await expect(page.getByText(/^Static result:/)).toHaveCount(0);
  await inspect.click();
  await expect(page.getByText(/^Static result: apex-static-48-v1; mode static-data-48$/)).toBeVisible();
  await expect(page.getByText(/^NDEF handoff: empty; 1 NDEF TLVs$/)).toBeVisible();
  await page.getByRole('button', { name: 'Select static-structure-64', exact: true }).click();
  await inspect.click();
  await expect(page.getByText(/^Static result:/)).toHaveCount(0);
  await expect(draft).toHaveValue(synthetic);
  await draft.fill('00 ');
  await expect(draft).toHaveValue(synthetic);
  await expect(inspect).toBeDisabled();
  await selectAnalysisInspector(page, 'Phone NDEF fields');
  await expect(draft).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Interpret phone NDEF fields', exact: true })).toBeVisible();
  await selectAnalysisInspector(page, 'Serialized NDEF');
  await expect(page.getByRole('button', { name: 'Interpret offline NDEF', exact: true })).toBeVisible();
  await selectAnalysisInspector(page, 'Static NFC data area');
  await expect(draft).toHaveValue(synthetic);
  await expect(inspect).toBeDisabled();
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(inspect).toBeDisabled();
  await page.getByRole('button', { name: 'Clear static NFC draft', exact: true }).click();
  await expect(draft).toHaveValue('');
  await page.getByRole('button', { name: 'Load synthetic Text structure example', exact: true }).click();
  await inspect.click();
  await expect(page.getByText(/^Static result: apex-static-48-v1; mode static-structure-64$/)).toBeVisible();
  await expect(page.getByText(/^Text "APEX"; language "en"; encoding utf-8\.$/)).toBeVisible();
  await selectAnalysisInspector(page, 'Recording');
  await selectAnalysisInspector(page, 'Static NFC data area');
  await expect(page.getByText(/^Static result:/)).toHaveCount(0);
  await expect(draft).toHaveValue('00'.repeat(12) + 'e1100600' + '030bd101075402656e41504558fe' + '00'.repeat(34));
  await page.reload();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await selectAnalysisInspector(page, 'Static NFC data area');
  await expect(draft).toHaveValue('');
});

// Authored scenario only for this checkpoint; list discovery is not browser acceptance.
test('HCI selected document requires explicit preparation, handoff and reopen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await selectAnalysisInspector(page, 'HCI captures');
  await page.getByRole('button', { name: 'Load synthetic HCI example', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prepare selected event document', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Inspect HCI metadata', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prepare selected event document', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select legacy HCI event 0', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open prepared HCI document', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Prepare selected event document', exact: true }).click();
  await page.getByRole('button', { name: 'Open prepared HCI document', exact: true }).click();
  const draft = page.getByLabel('HCI document JSON draft', { exact: true });
  const exact = await draft.inputValue();
  expect(JSON.parse(exact).format).toBe('APEX-HCI-selected-legacy-event');
  await expect(page.getByText('Verified derivative binary SHA-256 and legacy structure', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Verify/reopen HCI document', exact: true }).click();
  await expect(page.getByText('Verified derivative binary SHA-256 and legacy structure', { exact: true })).toBeVisible();
  await draft.fill('x'.repeat(4097));
  await expect(draft).toHaveValue(exact);
  await expect(page.getByRole('button', { name: 'Verify/reopen HCI document', exact: true })).toBeDisabled();
  await expect(page.getByText('Verified derivative binary SHA-256 and legacy structure', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(draft).toHaveValue(exact);
  await expect(page.getByRole('button', { name: 'Verify/reopen HCI document', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear HCI document', exact: true }).click();
  await expect(draft).toHaveValue('');
  await selectAnalysisInspector(page, 'HCI captures');
  await expect(page.getByLabel('HCI hex draft', { exact: true })).not.toHaveValue('');
  await expect(page.getByRole('button', { name: 'Open prepared HCI document', exact: true })).toHaveCount(0);
});

// Authored/listed only: local synthetic flow, not browser acceptance evidence.
test('HCI exact document explicit save and unverified journal reopen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await selectAnalysisInspector(page, 'HCI captures');
  await page.getByRole('button', { name: 'Load synthetic HCI example', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect HCI metadata', exact: true }).click();
  await page.getByRole('button', { name: 'Select legacy HCI event 0', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare selected event document', exact: true }).click();
  await page.getByRole('button', { name: 'Open prepared HCI document', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save exact verified HCI document', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Verify/reopen HCI document', exact: true }).click();
  await page.getByRole('button', { name: 'Save exact verified HCI document', exact: true }).click();
  await expect(page.getByText(/Exact selected document saved locally/)).toBeVisible();
  await page.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await expect(page.getByLabel('Exact HCI document JSON', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Check and reopen saved HCI document', exact: true }).click();
  await expect(page.getByLabel('Exact HCI document JSON', { exact: true })).toBeVisible();
  await expect(page.getByText(/Read-only exact saved snapshot/)).toBeVisible();
});

// Added for future isolated browser acceptance. This change was list-checked only.
test('HCI explicit comparison requires two verifications and choices, then fences on edit and exit', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
 await page.getByRole('button', { name: 'Choose Analysis inspector: Recording', exact: true }).click();
 await page.getByRole('button', { name: 'Select HCI report byte comparison', exact: true }).click();
 await page.getByRole('button', { name: 'Load synthetic comparison example', exact: true }).click();
 const compare = page.getByRole('button', { name: 'Compare explicit HCI reports', exact: true });
 await expect(compare).toBeDisabled();
 for (const side of ['left', 'right']) {
  await page.getByRole('button', { name: `Verify ${side} HCI comparison document`, exact: true }).click();
  await page.getByRole('button', { name: `Select ${side} report 0`, exact: true }).click();
 }
 await expect(page.getByText(/Data-byte offset 0:/)).toHaveCount(0);
 await compare.click();
 await expect(page.getByText(/Data-byte offset 0:/)).toBeVisible();
 const left = page.getByRole('textbox', { name: 'left HCI comparison document', exact: true });
 const exact = await left.inputValue();
 await left.fill('x'.repeat(4097));
 await expect(left).toHaveValue(exact);
 await expect(compare).toBeDisabled();
 await expect(page.getByText(/Data-byte offset 0:/)).toHaveCount(0);
 await page.getByRole('tab', { name: 'Research', exact: true }).click();
 await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
 await expect(left).toHaveValue(exact);
 await expect(page.getByRole('button', { name: 'Verify left HCI comparison document', exact: true })).toBeDisabled();
});

// Authored and list-checked only. Never executed in this change; no browser acceptance claim.
test('Offline I/Q stages local synthetic files without inspection, paginates and clears on exit', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
 await selectAnalysisInspector(page, 'Offline I/Q');
 const metadata = Buffer.from('{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":1024},"captures":[{"core:sample_start":0,"core:frequency":0}],"annotations":[]}');
 await page.getByLabel('I/Q metadata file', { exact: true }).setInputFiles({ name: 'synthetic.sigmf-meta', mimeType: 'application/json', buffer: metadata });
 await page.getByLabel('I/Q data file', { exact: true }).setInputFiles({ name: 'synthetic.sigmf-data', mimeType: 'application/octet-stream', buffer: Buffer.alloc(4096) });
 await expect(page.getByText(/Exact metadata SHA-256:/)).toHaveCount(0);
 await page.getByRole('button', { name: 'Inspect staged I/Q pair', exact: true }).click();
 await expect(page.getByText(/Exact metadata SHA-256:/)).toBeVisible();
 await expect(page.getByText(/FFT bins: page 1 of 128/)).toBeVisible();
 await page.getByRole('button', { name: 'Next I/Q FFT bins', exact: true }).click();
 await expect(page.getByText(/FFT bins: page 2 of 128/)).toBeVisible();
 await page.getByRole('tab', { name: 'Research', exact: true }).click();
 await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
 await expect(page.getByText(/Exact metadata SHA-256:/)).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Inspect staged I/Q pair', exact: true })).toBeDisabled();
});
