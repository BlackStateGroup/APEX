import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWifiReport, WIFI_REPORT_LIMIT } from '../src/wifi-security-report.ts';

const report = { version: 1, source: 'pwnagotchi-summary', deviceStatus: 'offline', security: 'transition' };
test('preserves reported offline status and identifies legacy compatibility', () => {
  const result = inspectWifiReport(JSON.stringify(report));
  assert.equal(result.deviceStatus, 'offline');
  assert.match(result.finding, /legacy WPA2/);
});
test('rejects extra data, invalid modes, and oversize input', () => {
  assert.throws(() => inspectWifiReport(JSON.stringify({ ...report, unexpected: 'extra' })));
  assert.throws(() => inspectWifiReport(JSON.stringify({ ...report, security: '__proto__' })));
  assert.throws(() => inspectWifiReport(' '.repeat(WIFI_REPORT_LIMIT + 1)));
});
