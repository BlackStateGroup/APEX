/** Independent host-only adversarial fixture checks. No native ordering claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nfcFacadeFixture } from './helpers/nfc-js-facade.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

for (const turbo of [true, false]) for (const first of ['ios', 'android'] as const) for (const remove of ['older', 'newer'] as const) {
  test(`${first} first, ${turbo ? 'codegen' : 'legacy'}, dispose ${remove}: lazy imports stay isolated`, async t => {
    const older = await nfcFacadeFixture(first, turbo); t.after(older.dispose);
    const second = first === 'ios' ? 'android' : 'ios';
    const newer = await nfcFacadeFixture(second, turbo); t.after(newer.dispose);
    assert.notEqual(older.sdk.default, newer.sdk.default);
    assert.notEqual(older.sdk.NfcError.UserCancel, newer.sdk.NfcError.UserCancel);
    // First dynamic imports occur only after both resolve hooks exist.
    const a = older.backend.status(), b = newer.backend.status(); await tick();
    assert.deepEqual(older.calls.map(call => call.name), ['isSupported']);
    assert.deepEqual(newer.calls.map(call => call.name), ['isSupported']);
    older.reply('isSupported', null, false); newer.reply('isSupported', null, false);
    assert.deepEqual(await a, { available: false, enabled: false, platform: first });
    assert.deepEqual(await b, { available: false, enabled: false, platform: second });
    const gone = remove === 'older' ? older : newer;
    const survivor = remove === 'older' ? newer : older;
    const survivorPlatform = remove === 'older' ? second : first;
    gone.dispose();
    const again = survivor.backend.status(); await tick(); survivor.reply('isSupported', null, false);
    assert.equal((await again).platform, survivorPlatform);
    assert.equal(gone.calls.length, 1); assert.equal(survivor.calls.length, 2);
  });
}

for (const first of ['ios', 'android'] as const) for (const remove of ['older', 'newer'] as const) {
  test(`${first} first, dispose ${remove} before any lazy SDK import`, async t => {
    const older = await nfcFacadeFixture(first); t.after(older.dispose);
    const second = first === 'ios' ? 'android' : 'ios';
    const newer = await nfcFacadeFixture(second); t.after(newer.dispose);
    const gone = remove === 'older' ? older : newer;
    const survivor = remove === 'older' ? newer : older;
    gone.dispose();
    const pending = survivor.backend.status(); await tick();
    assert.equal(gone.calls.length, 0); assert.equal(survivor.calls.length, 1);
    survivor.reply('isSupported', null, false);
    assert.equal((await pending).platform, remove === 'older' ? second : first);
  });
}

for (const platform of ['ios', 'android'] as const) for (const turbo of [true, false]) {
  test(`${platform} ${turbo ? 'codegen' : 'legacy'} exact routes and raw closure semantics`, async t => {
    const h = await nfcFacadeFixture(platform, turbo); t.after(h.dispose);
    const prefix = turbo ? 'codegen:' : 'legacy:NfcManager';
    assert.deepEqual(h.routes, ['DiscoverTag', 'DiscoverBackgroundTag', platform === 'ios' ? 'SessionClosed' : 'StateChanged'].map(event => prefix + event));
    const received: unknown[] = [];
    h.sdk.default.setEventListener(h.sdk.NfcEvents.SessionClosed, (error: unknown) => received.push(error));
    h.emit('SessionClosed', { error: platform === 'ios' ? 'NFCError:200,synthetic' : 'cancelled' });
    assert.equal(received.length, platform === 'ios' ? 1 : 0);
    if (platform === 'ios') assert.equal(received[0], null);
    if (platform === 'ios') {
      h.emit('SessionClosed', { error: 'NFCError:201,synthetic' });
      assert.ok(received[1] instanceof h.sdk.NfcError.Timeout);
    }
    h.sdk.default.setEventListener(h.sdk.NfcEvents.SessionClosed, null);
    const count = received.length;
    h.emit('SessionClosed', { error: 'NFCError:200,synthetic' });
    assert.equal(received.length, count);
  });
}

for (const platform of ['ios', 'android'] as const) {
  test(`${platform}: global delivery targets current listener, without generation identity`, async t => {
    const h = await nfcFacadeFixture(platform); t.after(h.dispose);
    const old: unknown[] = [], current: unknown[] = [];
    h.sdk.default.setEventListener(h.sdk.NfcEvents.DiscoverTag, (tag: unknown) => old.push(tag));
    h.sdk.default.setEventListener(h.sdk.NfcEvents.DiscoverTag, (tag: unknown) => current.push(tag));
    const synthetic = { id: 'public-synthetic-old-or-new-unknown' };
    h.emit('DiscoverTag', synthetic);
    assert.equal(old.length, 0); assert.equal(current.length, 1); assert.equal(current[0], synthetic);
    h.sdk.default.setEventListener(h.sdk.NfcEvents.DiscoverTag, null);
  });
}

for (const platform of ['ios', 'android'] as const) {
  test(`${platform}: converted SDK error preserves shared host Error and fixture-specific class`, async t => {
    const h = await nfcFacadeFixture(platform); t.after(h.dispose);
    const other = await nfcFacadeFixture(platform); t.after(other.dispose);
    const pending = h.sdk.default.start();
    const rejection = assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error instanceof h.sdk.NfcError.UserCancel);
      assert.ok(!(error instanceof other.sdk.NfcError.UserCancel));
      return true;
    });
    h.reply('start', platform === 'ios' ? 'NFCError:200,synthetic cancellation' : 'cancelled');
    await rejection;
  });
}
