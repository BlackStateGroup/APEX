import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogue } from '../src/catalogue.ts';

test('catalogue separates offline evidence from historical builds and unverified acquisition', () => {
  const rows = new Map(catalogue.map(row => [row.domain, row]));
  assert.equal(rows.size, catalogue.length, 'capability domains must remain distinct');
  for (const domain of ['Android USB + NFC', 'ESP32-S3 accessory'] as const) {
    assert.equal(rows.get(domain)?.status, 'Historical baseline build');
    assert.match(rows.get(domain)!.detail, /current .*unrun/);
  }
  for (const domain of ['BLE interpretation / trials', 'NFC / NDEF interpretation', 'I/Q inspection', 'Flipper response inspection'] as const) {
    assert.equal(rows.get(domain)?.status, 'Offline host tested');
  }
  assert.match(rows.get('Flipper response inspection')!.detail, /browser\/phone acceptance unrun; no commands, live transport or authenticated identity/);
  assert.equal(rows.get('Foreground BLE collection')?.status, 'Native acceptance unrun');
  assert.match(rows.get('Foreground BLE collection')!.detail, /advertised-UUID.*service-data-only BTHome can be missed/);
  assert.match(rows.get('Foreground BLE collection')!.detail, /separate opt-in Android service-data.*bounded only in JS/);
  assert.match(rows.get('Foreground BLE collection')!.detail, /iOS broad mode gated.*physical delivery unverified/);
  assert.match(rows.get('Local evidence')!.detail, /browser\/phone persistence acceptance unrun/);
  assert.equal(rows.get('Wi-Fi / LoRa acquisition')?.status, 'Planned');
  assert.match(rows.get('AI protocol assistance')!.detail, /no model connected/);
});
