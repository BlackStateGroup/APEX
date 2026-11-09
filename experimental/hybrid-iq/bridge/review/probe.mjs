// Independent review probes, separate from the primary proof/CI gate.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { snapshot, encode, project, MAX_RESPONSE } from '../codec.ts';
import { OptionalIqExecutor, Cancelled } from '../client.ts';
import { fixtures } from '../../../cpp-iq/proof-codec.mjs';
const host = process.argv[2];
assert.equal(typeof host, 'string', 'Supply the independently instrumented host path');
const f = fixtures()[0];
let checks = 0;
function rejects(data) { assert.throws(() => snapshot({ ...f, data })); checks++; }
function native(bytes) {
  const r = spawnSync(host, [], {
    input: bytes, timeout: 10000, maxBuffer: MAX_RESPONSE + 65536,
    env: { ...process.env, ASAN_OPTIONS: 'detect_leaks=0:abort_on_error=1', UBSAN_OPTIONS: 'halt_on_error=1:print_stacktrace=1' },
  });
  assert.equal(r.error, undefined);
  assert.equal(r.status, 0, r.stderr.toString());
  assert.equal(r.stderr.length, 0);
  return new Uint8Array(r.stdout);
}
const shared = new Uint8Array(new SharedArrayBuffer(f.data.length));
Object.defineProperty(shared, 'buffer', { value: new ArrayBuffer(f.data.length) });
rejects(shared);
const oversized = new Uint8Array(262148);
Object.defineProperty(oversized, 'length', { value: f.data.length });
rejects(oversized);
const resizable = new Uint8Array(new ArrayBuffer(f.data.length, { maxByteLength: f.data.length * 2 }));
Object.defineProperty(resizable, 'buffer', { value: new ArrayBuffer(f.data.length) });
rejects(resizable);
const fake16 = new Uint16Array(f.data.length / 2);
Object.setPrototypeOf(fake16, Uint8Array.prototype);
rejects(fake16);
rejects(new Proxy(new Uint8Array(f.data.length), {}));
const offset = new Uint8Array(f.data.length + 10);
offset.set(f.data, 5);
const view = offset.subarray(5, 5 + f.data.length);
Object.defineProperties(view, {
  length: { get() { throw Error('Must not read shadowed length'); } },
  buffer: { get() { throw Error('Must not read shadowed buffer'); } },
  byteOffset: { get() { throw Error('Must not read shadowed offset'); } },
});
assert.deepEqual(snapshot({ ...f, data: view }).data, new Uint8Array(f.data)); checks++;
const crossRealm = vm.runInNewContext('new Uint8Array(1024)');
assert.equal(snapshot({ ...f, data: crossRealm }).data.length, 1024); checks++;
const request = encode(f, { session: 901, request: 1 });
const good = native(request.bytes);
const sharedResponse = new Uint8Array(new SharedArrayBuffer(good.length));
sharedResponse.set(good);
Object.defineProperty(sharedResponse, 'buffer', { value: good.buffer });
assert.throws(() => project(sharedResponse, request.context)); checks++;
const oversizedResponse = new Uint8Array(MAX_RESPONSE + 1);
oversizedResponse.set(good);
Object.defineProperty(oversizedResponse, 'length', { value: good.length });
assert.throws(() => project(oversizedResponse, request.context)); checks++;
const bridge = { session: 901, execute: async bytes => native(bytes), cancel() {} };
const first = new OptionalIqExecutor(() => { throw Error('Unexpected fallback'); }, bridge);
assert.equal((await first.run(f)).backend, 'native'); checks++;
assert.throws(() => new OptionalIqExecutor(() => ({}), { ...bridge }), /already claimed/); checks++;
first.dispose();
assert.throws(() => new OptionalIqExecutor(() => ({}), { ...bridge }), /already claimed/); checks++;
let resolve;
const drain = new Promise(r => { resolve = r; });
let nativeInput, cancels = 0, fallbacks = 0;
const second = new OptionalIqExecutor(() => { fallbacks++; throw Error('Unexpected fallback'); }, {
  session: 902, execute(bytes) { nativeInput = bytes; return drain; }, cancel() { cancels++; },
});
const pending = second.run(f);
const rejected = assert.rejects(pending, Cancelled);
second.cancel(); second.cancel();
assert.equal(second.busy, true);
await assert.rejects(second.run(f), /busy/);
resolve(native(nativeInput));
await rejected;
assert.equal(second.busy, false);
assert.equal(cancels, 1);
assert.equal(fallbacks, 0); checks++;
for (const action of ['cancel', 'dispose']) {
  let reject;
  const deferred = new Promise((_, r) => { reject = r; });
  const executor = new OptionalIqExecutor(() => deferred);
  const checked = assert.rejects(executor.run(f), Cancelled);
  executor[action]();
  assert.equal(executor.busy, true);
  reject(Error('Late fallback failure'));
  await checked;
  assert.equal(executor.busy, false); checks++;
}
const detached = new Uint8Array(f.data.length);
structuredClone(detached.buffer, { transfer: [detached.buffer] });
rejects(detached);
for (let id = 1000; id < 2022; id++) new OptionalIqExecutor(() => ({}), { ...bridge, session: id });
assert.throws(() => new OptionalIqExecutor(() => ({}), { ...bridge, session: 9999 }), /registry exhausted/); checks++;
assert.equal(checks, 17);
console.log(`PASS ${checks} independent codec/session/cancellation check groups; native subprocess ASan+UBSan instrumented`);
