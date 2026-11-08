/** Trusted-driver protocol tests only. Native provenance is tested separately. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BleTransport, AXP_READY } from '../packages/core/ble-transport.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
for (const rejection of [undefined, null, 0, 'rejected', Object.freeze({ name: 'AbortError', released: true }), new Error('original')]) {
  test(`exact raw rejection and one fresh frozen token: ${String(rejection)}`, async () => {
    const tokens: object[] = [];
    for (let n = 0; n < 2; n++) {
      let token: object | undefined, queries = 0;
      const driver = {
        async connect(id: string, signal?: AbortSignal, attempt?: object) { assert.equal(id, 'A'); assert.ok(signal); token = attempt; throw rejection; },
        consumeUnissuedConnection(attempt: object, id: string, error: unknown) {
          queries++; assert.equal(this, driver); assert.equal(attempt, token); assert.equal(id, 'A'); assert.ok(Object.is(error, rejection)); return true;
        },
      };
      const transport = new BleTransport(driver, 'A');
      const result = await transport.connect().then(() => ({ ok: true }), error => ({ error }));
      assert.ok('error' in result && Object.is(result.error, rejection));
      assert.ok(token && Object.isFrozen(token)); tokens.push(token!);
      await transport.disconnect(); await transport.disconnect(); assert.equal(queries, 1);
    }
    assert.notEqual(tokens[0], tokens[1]);
  });
}
for (const mode of ['missing', 'getter-throw', 'method-throw', 'promise', 'object', 'truthy', 'false']) test(`proof ${mode} preserves original and remains held`, async () => {
  const original = Object.freeze({ name: 'AbortError', released: true }); let queries = 0;
  const driver: any = { async connect() { throw original; } };
  if (mode === 'getter-throw') Object.defineProperty(driver, 'consumeUnissuedConnection', { get() { queries++; throw Error('getter'); } });
  else if (mode !== 'missing') driver.consumeUnissuedConnection = () => { queries++; if (mode === 'method-throw') throw Error('method'); return mode === 'promise' ? Promise.resolve(true) : mode === 'object' ? { released: true } : mode === 'truthy' ? 1 : false; };
  const transport = new BleTransport(driver, 'A');
  await assert.rejects(transport.connect(), e => e === original);
  await assert.rejects(transport.disconnect(), /unknown/); await assert.rejects(transport.disconnect(), /unknown/);
  assert.equal(queries, mode === 'missing' ? 0 : 1);
});
test('proof is never queried before dispatch or for a late returned handle', async () => {
  let calls = 0, queries = 0, closes = 0, finish!: (value: any) => void;
  const driver = { connect() { calls++; return new Promise<any>(r => { finish = r; }); }, consumeUnissuedConnection() { queries++; return true; } };
  const early = new BleTransport(driver, 'A'); const earlyOpen = early.connect().catch(e => e); await early.disconnect(); await earlyOpen;
  assert.equal(calls, 0); assert.equal(queries, 0);
  const late = new BleTransport(driver, 'A'); const opening = late.connect().catch(e => e); await tick();
  let done = false; const closing = late.disconnect().then(() => { done = true; }); await tick(); assert.equal(done, false);
  finish({ mtu: 23, async subscribe(cb: any) { cb(AXP_READY); return () => {}; }, async disconnect() { closes++; }, async writeWithResponse() {} });
  await opening; await closing; assert.equal(closes, 1); assert.equal(queries, 0);
});
test('malformed rejected Promise proof stays unknown without unhandled rejection', async () => {
  const original = new Error('original rejection');
  const transport = new BleTransport({ async connect() { throw original; }, consumeUnissuedConnection: (() => Promise.reject(new Error('proof rejection'))) as any }, 'A');
  await assert.rejects(transport.connect(), e => e === original);
  await assert.rejects(transport.disconnect(), /unknown/); await tick();
});
test('malformed thenable proof is neither inspected nor assimilated', async () => {
  let reads = 0;
  const proof = { get then() { reads++; throw Error('do not assimilate'); } };
  const original = new Error('original rejection');
  const transport = new BleTransport({ async connect() { throw original; }, consumeUnissuedConnection: (() => proof) as any }, 'A');
  await assert.rejects(transport.connect(), e => e === original);
  await assert.rejects(transport.disconnect(), /unknown/); assert.equal(reads, 0);
});
