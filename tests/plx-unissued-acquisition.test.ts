// Installed PLX ESM and actual adapter/session. RN permission/native boundaries
// remain synthetic. Pre-manager permission exits deliberately never load PLX.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './plx-facade-host/fixture.ts';
const tick = () => new Promise<void>(r => setImmediate(r));
for (const cancel of [false, true]) for (const denied of [false, true]) {
  if (!cancel && !denied) continue;
  test(`installed PLX fixture: normal permission result denied=${denied} cancelled=${cancel} releases unissued`, async () => {
    const x = await fixture('android', 23, () => ({ scan: denied ? 'denied' : 'granted', connect: 'granted' }));
    const gate = x.hold('permissions');
    try {
      const opening = x.session.open().catch(e => e); await gate.entered;
      let done = false; const closing = cancel ? x.session.close().then(() => { done = true; }) : undefined;
      if (cancel) { await tick(); assert.equal(done, false); assert.equal(x.session.transportReleasePending, true); }
      gate.release(); const error = await opening; assert.match(String(error), denied ? /permission denied/ : /cancelled/);
      await closing; await x.session.close();
      assert.equal(x.session.transportReleasePending, false);
      assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
      assert.deepEqual(x.events, ['permissions']); assert.equal(x.listeners.size, 0);
    } finally { gate.release(); await x.finish(); }
  });
}
test('installed PLX fixture: unexpected permission rejection stays unknown with exact rejection', async () => {
  const original = Object.freeze({ name: 'AbortError', released: true });
  const x = await fixture('android', 23, () => { throw original; });
  try {
    await assert.rejects(x.transport.connect(), e => e === original);
    await assert.rejects(x.transport.disconnect(), /unknown/);
    assert.deepEqual(x.events, ['permissions']); assert.equal(x.listeners.size, 0);
  } finally { await x.finish(x.session, true); }
});
