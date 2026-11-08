import test from 'node:test';
import assert from 'node:assert/strict';
import { runAccessoryDiscoveryAction, runForegroundDeviceAction } from '../src/foreground-device-action.ts';
import { runNfcReaderAction } from '../src/nfc-reader-action.ts';
import { NfcReader } from '../packages/core/nfc.ts';

const run = (action: () => Promise<void>) => action();
for (const lifecycleActive of [false, true]) for (const appState of ['active', 'inactive', 'background']) {
  test(`new metadata and accessory acquisition gate: lifecycle=${lifecycleActive}, app=${appState}`, async () => {
    const allowed = lifecycleActive && appState === 'active';
    let statuses = 0; let scans = 0;
    const reader = new NfcReader({ status: async () => { statuses++; return { available: true, enabled: true, platform: 'android' }; },
      begin: async () => async () => {} }, { onTag() {}, onError() {} });
    const isForeground = () => lifecycleActive && appState === 'active';
    const metadata = runNfcReaderAction(reader, action => runForegroundDeviceAction(action, run, isForeground), () => {});
    const discovery = runAccessoryDiscoveryAction(() => false, async () => {}, async () => { scans++; }, run, isForeground);
    if (allowed) await Promise.all([metadata, discovery]);
    else await Promise.all([assert.rejects(metadata, /foreground/), assert.rejects(discovery, /foreground/)]);
    assert.equal(statuses, Number(allowed)); assert.equal(scans, Number(allowed));
    await reader.stop();
  });
}

test('queued starts recheck current foreground after background cleanup has already run', async () => {
  let foreground = true; let acquisitions = 0;
  const actions: (() => Promise<void>)[] = [];
  const deferredRun = async (action: () => Promise<void>) => { actions.push(action); };
  await runForegroundDeviceAction(async () => { acquisitions++; }, deferredRun, () => foreground);
  await runAccessoryDiscoveryAction(() => false, async () => {}, async () => { acquisitions++; }, deferredRun, () => foreground);
  foreground = false; // Background callback stopped the old sessions before these starts execute.
  for (const action of actions) await assert.rejects(action(), /foreground/);
  assert.equal(acquisitions, 0);
});

test('metadata Stop during pending startup bypasses foreground start guard and the held run lock', async () => {
  let resolveStatus!: (value: { available: boolean; enabled: boolean; platform: 'android' }) => void;
  const status = new Promise<{ available: boolean; enabled: boolean; platform: 'android' }>(resolve => { resolveStatus = resolve; });
  let begins = 0; let foreground = true; let locked = false;
  const lockedRun = async (action: () => Promise<void>) => { if (locked) return; locked = true; try { await action(); } finally { locked = false; } };
  const reader = new NfcReader({ status: () => status, begin: async () => { begins++; return async () => {}; } }, { onTag() {}, onError() {} });
  const dispatch = () => runNfcReaderAction(reader, action => runForegroundDeviceAction(action, lockedRun, () => foreground), error => { throw error; });
  const starting = dispatch(); foreground = false;
  const stopping = dispatch(); assert.equal(reader.state, 'stopping'); assert.equal(locked, true);
  resolveStatus({ available: true, enabled: true, platform: 'android' });
  await Promise.all([starting, stopping]);
  assert.equal(begins, 0); assert.equal(reader.state, 'idle'); assert.equal(locked, false);
});

test('accessory Stop uses current scanning ref even when rendered label has not caught up, and works in background', async () => {
  let stops = 0; let starts = 0;
  const dispatch = (scanning: boolean, foreground: boolean) => runAccessoryDiscoveryAction(() => scanning,
    async () => { stops++; }, async () => { starts++; }, run, () => foreground);
  await dispatch(true, false);
  assert.equal(stops, 1); assert.equal(starts, 0);
  await dispatch(false, true);
  assert.equal(stops, 1); assert.equal(starts, 1);
});
