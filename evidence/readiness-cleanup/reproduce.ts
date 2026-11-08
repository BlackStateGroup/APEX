// Investigation only: exact adapter + pinned installed PLX ESM, synthetic RN boundary.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { environment, verifyInstalled, hooks } from '../../tests/plx-facade-host/loader.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
verifyInstalled();
const reports: object[] = [];
for (const mode of ['sdk-event', 'sdk-initial', 'fixture-sync'] as const) {
  const id = `readiness-cleanup-${mode}`;
  const original = new Error(`synthetic remove fault: ${mode}`);
  const events: string[] = [];
  let listener: ((state: string) => void) | undefined;
  let nativeListenerPresent = false;
  let stateResolve!: (state: string) => void;
  const statePromise = new Promise<string>(resolve => { stateResolve = resolve; });
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  const nativeModule = {
    StateChangeEvent: 'state', DisconnectionEvent: 'disconnect', createClient() { events.push('create'); },
    state() { events.push('state'); return statePromise; },
    async isDeviceConnected() { return false; },
    connectToDevice() { events.push('connect'); return new Promise(() => {}); },
  };
  class Emitter {
    addListener(name: string, callback: (state: string) => void) {
      if (name === 'disconnect') return { remove() {} };
      assert.equal(name, 'state'); listener = callback; nativeListenerPresent = true;
      return { remove() { events.push('remove'); throw original; } };
    }
  }
  environment(id, { NativeModules: { BlePlx: nativeModule }, NativeEventEmitter: Emitter,
    Platform: { OS: 'android', Version: 34 }, AppState: { currentState: 'active' },
    PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect' }, RESULTS: { GRANTED: 'granted' }, async requestMultiple() { return { scan: 'granted', connect: 'granted' }; } } });
  // Use explicit owner-scoped SDK URL: loader resolves its dependency tree without rewriting bytes.
  const { BleManager } = await import(`./sdk-owner.ts?plx-case=${id}`);
  const manager = new BleManager();
  if (mode === 'fixture-sync') manager.onStateChange = (callback: (state: string) => void) => {
    events.push('synthetic-sync-callback'); callback('PoweredOn');
    return { remove() { events.push('remove'); throw original; } };
  };
  const native = await import(`../../src/platform/bluetooth.native.ts?plx-case=${id}`);
  const attempt = {};
  let outcome = 'pending', rejection: unknown;
  const opening = native.bleDriver.connect('AXP', undefined, attempt);
  void opening.then(() => { outcome = 'resolved'; }, (error: unknown) => { outcome = 'rejected'; rejection = error; });
  for (let i = 0; i < 5; i++) await tick();
  let eventThrow: unknown;
  if (mode === 'sdk-event') try { listener!('PoweredOn'); } catch (error) { eventThrow = error; }
  if (mode === 'sdk-initial') stateResolve('PoweredOn');
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(outcome, 'pending');
  assert.equal(native.bleDriver.consumeUnissuedConnection(attempt, 'AXP', original), false);
  if (mode !== 'fixture-sync') {
    assert.equal(events.includes('connect'), false);
    assert.equal(native.accessoryConnectionOwnership(), 'owned');
    assert.equal(Object.keys(manager._activeSubscriptions).length, 0);
    assert.equal(nativeListenerPresent, true);
  } else assert.equal(events.includes('connect'), true);
  if (mode === 'sdk-event') assert.equal(eventThrow, original);
  if (mode === 'sdk-initial') assert.equal(unhandled[0], original);
  reports.push({ mode, outcome, events, ownership: native.accessoryConnectionOwnership(), sdkSubscriptions: Object.keys(manager._activeSubscriptions).length,
    nativeListenerPresent, eventThrowIsOriginal: eventThrow === original, unhandledIsOriginal: unhandled[0] === original,
    rejectionIsOriginal: rejection === original, receipt: false });
  process.removeListener('unhandledRejection', onUnhandled);
}
verifyInstalled(); hooks.deregister();
const result = { sourceCommit: '4825e2c7a200ee43b5e4cd04f4545c45bc09158c', scope: 'Exact adapter and unchanged PLX 3.5.1 ESM; RN NativeEventEmitter and native bridge synthetic. Sync callback replaces SDK method only in explicitly labeled fixture case. No native runtime, device, radio, or release proof.', reports };
writeFileSync('evidence/readiness-cleanup/before.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
