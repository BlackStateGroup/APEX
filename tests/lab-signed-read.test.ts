import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { AccessoryTrustAuthority, accessorySignedReadTranscript } from '../packages/core/accessory-trust.ts';
import type { AccessorySignedExchange } from '../packages/core/accessory-trust.ts';
import { encode, FrameDecoder, crc16 } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';
import { validateInfo, validateCapabilities } from '../packages/core/session.ts';
import { AccessorySignedConnection } from '../packages/core/accessory-signed-connection.ts';
import { nativeAccessoryTrustAdapters } from '../packages/core/accessory-native-adapters.ts';
import { SignedReadLabController } from '../src/signed-read-lab-controller.ts';

const root = resolve(import.meta.dirname, '..');
// npm test picks up this file without changing the frozen dependency manifest.
// Rebuild actual C sources, never accept a stale normal-test executable.
if (process.env.APEX_LAB_SANITIZE !== '1') {
  const build = spawnSync('python3', ['tools/build_lab_signed_read.py'], { cwd: root, timeout: 60000 });
  assert.equal(build.status, 0, build.stderr.toString());
}
const binary = resolve(root, 'build', process.env.APEX_LAB_SANITIZE === '1' ? 'apex-lab-peer-san' : 'apex-lab-peer');
const temp = mkdtempSync(join(tmpdir(), 'apex-lab-test-'));
after(() => rmSync(temp, { recursive: true, force: true }));
function provision(name: string) {
  const directory = join(temp, name);
  const result = spawnSync(process.execPath, ['tools/provision_lab_signed_read.mjs', '--generate-new-lab-key', directory, 'Ephemeral test key'], { cwd: root });
  assert.equal(result.status, 0, result.stderr.toString());
  const manifest = JSON.parse(readFileSync(join(directory, 'public-key.json'), 'utf8')) as { publicKeyHex: string };
  return { directory, key: manifest.publicKeyHex, image: join(directory, 'lab-key-partition.bin') };
}
const first = provision('first'), second = provision('second');
const publicKey = (raw: Uint8Array) => createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
function run(input: Uint8Array, image = first.image, optIn = '--lab-opt-in') {
  const result = spawnSync(binary, [optIn, image], { input, timeout: 5000, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null, result.stderr.toString());
  assert.equal(result.stderr.length, 0, result.stderr.toString());
  return result;
}
function frames(wire: Uint8Array) {
  const result: Frame[] = [], decoder = new FrameDecoder(f => result.push(f));
  for (let i = 0; i < wire.length; i += 7) decoder.push(wire.subarray(i, i + 7));
  assert.equal(decoder.bufferedBytes, 0);
  assert.equal(decoder.discarded, 0);
  return result;
}
function one(wire: Uint8Array) { const result = frames(wire); assert.equal(result.length, 1); return result[0]!; }
function request(operation = 3, body = new Uint8Array(), id = 17): Frame {
  const payload = new Uint8Array(36 + body.length);
  payload.set([1, operation]); payload.set(randomBytes(32), 2);
  new DataView(payload.buffer).setUint16(34, body.length, true); payload.set(body, 36);
  return { kind: 1, opcode: 0x70, id, payload };
}
const exchange: AccessorySignedExchange = async q => {
  const result = run(encode(q)); assert.equal(result.status, 0); return one(result.stdout);
};
function reader(adapter: AccessorySignedExchange = exchange, key = first.key) {
  const authority = new AccessoryTrustAuthority({ randomBytes: n => new Uint8Array(randomBytes(n)), now: () => performance.now(),
    verifyEd25519: async (key, message, signature) => verify(null, message, publicKey(key), signature) });
  authority.confirmPairing({ label: 'Native C lab peer', publicKeyHex: key, confirmedPublicKeyHex: key,
    keyVerification: 'out-of-band', authorization: 'owned-or-authorized-lab',
    allowedOperations: ['system.info', 'system.capabilities', 'system.ping'] });
  return authority.createReader('Native C lab peer', adapter, { leaseMs: 30000, exchangeMs: 5000 });
}
const body = (frame: Frame) => frame.payload.subarray(36, -64);

test('compiled C peer passes existing host verifier for info, capabilities and bounded binary ping', async () => {
  const r = reader();
  const info = validateInfo(Uint8Array.from((await r.request('system.info')).body));
  assert.equal(info.id, 'apex-s3-signed-lab'); assert.equal(info.source, 'accessory');
  const capabilities = validateCapabilities(Uint8Array.from((await r.request('system.capabilities')).body));
  assert.deepEqual(capabilities, ['system.info', 'system.capabilities', 'system.ping']);
  for (const length of [0, 1, 127, 128]) {
    const input = new Uint8Array(randomBytes(length));
    assert.deepEqual((await r.request('system.ping', input)).body, Array.from(input));
  }
  r.close();
});

test('C signatures verify against the canonical host transcript for every ping length and all operations', () => {
  const queries = [request(1), request(2), ...Array.from({ length: 129 }, (_, n) => request(3, new Uint8Array(randomBytes(n)), n + 1))];
  const output = run(Buffer.concat(queries.map(q => encode(q)))); assert.equal(output.status, 0);
  const replies = frames(output.stdout); assert.equal(replies.length, queries.length);
  replies.forEach((reply, i) => {
    const q = queries[i]!;
    assert.equal(verify(null, accessorySignedReadTranscript(first.key, q, reply.payload), publicKey(Buffer.from(first.key, 'hex')), reply.payload.subarray(-64)), true);
    if (q.payload[1] === 3) assert.deepEqual(body(reply), q.payload.subarray(36));
  });
});

test('modified signed body, challenge, version, operation, length and signature fail after CRC recomputation', async () => {
  for (const index of [0, 1, 2, 33, 34, 35, 36, 40, 100]) {
    const r = reader(async q => { const response = await exchange(q); response.payload[index]! ^= 1; return one(encode(response)); });
    await assert.rejects(r.request('system.info')); assert.equal(r.state, 'closed');
  }
});

test('different pinned key and a different native peer key cannot authenticate', async () => {
  await assert.rejects(reader(exchange, second.key).request('system.info'));
  await assert.rejects(reader(async q => one(run(encode(q), second.image).stdout)).request('system.info'));
});

test('replayed C responses fail for a fresh request and after a fresh authority', async () => {
  let saved: Frame | undefined;
  const r = reader(async q => saved ??= await exchange(q));
  await r.request('system.info'); await assert.rejects(r.request('system.info')); assert.equal(r.state, 'closed');
  await assert.rejects(reader(async () => saved!).request('system.info'));
  // Even if an attacker repairs the outer ID, the old challenge/signature fails.
  await assert.rejects(reader(async q => ({ ...saved!, id: q.id })).request('system.info'));
});

test('outer substitutions and valid signature over a different request never pass', async () => {
  for (const mode of ['id', 'kind', 'opcode', 'request-id', 'request-body']) {
    const r = reader(async q => {
      const originalId = q.id;
      if (mode === 'request-id') q.id++;
      if (mode === 'request-body') q.payload[36]! ^= 1;
      const response = await exchange(q);
      if (mode === 'request-id') response.id = originalId;
      if (mode === 'id') response.id++;
      if (mode === 'kind') response.kind = 3;
      if (mode === 'opcode') response.opcode = 3;
      return one(encode(response));
    });
    await assert.rejects(r.request('system.ping', Uint8Array.of(9)));
  }
});

test('all other outer and inner opcodes including legacy and arbitrary commands are silent', () => {
  const bad: Frame[] = [];
  for (let opcode = 0; opcode < 256; opcode++) {
    if (opcode !== 0x70) bad.push({ ...request(), opcode });
    if (![1, 2, 3].includes(opcode)) bad.push(request(opcode));
  }
  const result = run(Buffer.concat(bad.map(encode))); assert.equal(result.status, 0); assert.equal(result.stdout.length, 0);
});

test('malformed signed payloads, non-requests and metadata bodies produce no response', () => {
  const bad: Frame[] = [request(1, Uint8Array.of(1)), request(2, Uint8Array.of(1)), request(3, new Uint8Array(129)),
    { ...request(), kind: 2 }, { ...request(), kind: 3 }];
  for (const length of [0, 1, 35, 37, 165, 512]) bad.push({ ...request(), payload: new Uint8Array(length) });
  for (const index of [0, 34, 35]) { const q = request(); q.payload[index]! ^= 0x80; bad.push(q); }
  const result = run(Buffer.concat(bad.map(encode))); assert.equal(result.status, 0); assert.equal(result.stdout.length, 0);
});

test('bad CRC, reserved flags, version, kind, zero ID, oversized header and truncation are rejected', () => {
  const valid = encode(request());
  const bad = [valid.slice(0, -1), valid.slice(0, 10)];
  for (const [offset, value] of [[2, 2], [3, 0], [5, 1], [6, 0], [9, 3]] as const) {
    const wire = valid.slice(); wire[offset] = value;
    new DataView(wire.buffer).setUint16(wire.length - 2, crc16(wire.subarray(0, -2)), true); bad.push(wire);
  }
  const crc = valid.slice(); crc[crc.length - 1]! ^= 1; bad.push(crc);
  for (const wire of bad) { const result = run(wire); assert.equal(result.status, 0); assert.equal(result.stdout.length, 0); }
  const recover = run(Buffer.concat([crc, valid])); assert.equal(frames(recover.stdout).length, 1);
});

test('disabled, absent, malformed, wrong-size and mismatched provisioning fail before serving', () => {
  // No stdin write to a process intentionally exiting before opening transport:
  // otherwise an expected early close races Node's pipe writer (EPIPE).
  assert.equal(run(new Uint8Array(), first.image, '--disabled').status, 2);
  assert.equal(run(new Uint8Array(), join(temp, 'missing')).status, 2);
  const original = readFileSync(first.image);
  const variants = [original.subarray(0, 72), Buffer.concat([original, Buffer.of(0)])];
  for (const offset of [0, 8, 40, 72, 4095]) { const corrupt = Buffer.from(original); corrupt[offset]! ^= 1; variants.push(corrupt); }
  for (const [i, value] of variants.entries()) {
    const path = join(temp, `invalid-${i}.bin`); writeFileSync(path, value, { mode: 0o600 });
    const result = run(new Uint8Array(), path); assert.equal(result.status, 2); assert.equal(result.stdout.length, 0);
  }
  original.fill(0); variants.forEach(v => v.fill(0));
});

test('offline provisioning generates distinct keys, private permissions and refuses overwrite', () => {
  assert.notEqual(first.key, second.key);
  assert.equal(statSync(first.directory).mode & 0o777, 0o700); assert.equal(statSync(first.image).mode & 0o777, 0o600);
  const before = readFileSync(first.image);
  const result = spawnSync(process.execPath, ['tools/provision_lab_signed_read.mjs', '--generate-new-lab-key', first.directory, 'No overwrite'], { cwd: root });
  assert.notEqual(result.status, 0); assert.equal(readFileSync(first.image).equals(before), true); before.fill(0);
});

test('persistent C process accepts fragmented sequential requests through one host reader', async () => {
  const child = spawn(binary, ['--lab-opt-in', first.image]);
  let pending: { resolve: (f: Frame) => void; reject: (e: Error) => void } | undefined;
  let stderr = '';
  const decoder = new FrameDecoder(frame => { const current = pending; pending = undefined; current?.resolve(frame); });
  child.stdout.on('data', chunk => decoder.push(new Uint8Array(chunk)));
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  child.on('error', error => pending?.reject(error));
  const closed = new Promise<number | null>(resolve => child.on('close', code => { pending?.reject(new Error('Peer exited')); resolve(code); }));
  const r = reader(q => new Promise((resolve, reject) => {
    pending = { resolve, reject }; const wire = encode(q);
    for (let offset = 0; offset < wire.length; offset += 3) child.stdin.write(wire.subarray(offset, offset + 3));
  }));
  try {
    for (let i = 0; i < 12; i++) assert.deepEqual((await r.request('system.ping', Uint8Array.of(i, 0, 255))).body, [i, 0, 255]);
  } finally { r.close(); child.stdin.end(); }
  assert.equal(await closed, 0); assert.equal(stderr, '');
});

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
const adapters = { randomBytes: (n: number) => new Uint8Array(randomBytes(n)), now: () => performance.now(),
  verifyEd25519: async (key: Uint8Array, message: Uint8Array, signature: Uint8Array) => verify(null, message, publicKey(key), signature) };
const approval = { label: 'Native C lab peer', publicKeyHex: first.key, confirmedPublicKeyHex: first.key,
  keyVerification: 'out-of-band' as const, authorization: 'owned-or-authorized-lab' as const,
  allowedOperations: ['system.info', 'system.capabilities', 'system.ping'] as const };
class PipeUsb {
  readonly source = 'usb' as const;
  data = new Set<(b: Uint8Array) => void>(); disconnected = new Set<(e: Error) => void>();
  connects = 0; writes = 0; closes = 0;
  connectGate?: Promise<void>; writeGate?: Promise<void>; closeGate?: Promise<void>;
  failClose = false; failWrite = false; failConnect = false;
  response: (bytes: Uint8Array) => Uint8Array = b => b;
  connect = async () => { this.connects++; await this.connectGate; if (this.failConnect) throw new Error('connect failure'); };
  write = async (bytes: Uint8Array) => {
    this.writes++;
    const result = run(bytes); assert.equal(result.status, 0);
    const reply = this.response(result.stdout);
    for (let offset = 0; offset < reply.length; offset += 7) this.emit(reply.subarray(offset, offset + 7));
    await this.writeGate;
    if (this.failWrite) throw new Error('write failure');
  };
  disconnect = async () => { this.closes++; await this.connectGate; await this.closeGate; if (this.failClose) throw new Error('cleanup failure'); };
  onData(fn: (bytes: Uint8Array) => void) { this.data.add(fn); return () => { this.data.delete(fn); }; }
  onDisconnect(fn: (e: Error) => void) { this.disconnected.add(fn); return () => { this.disconnected.delete(fn); }; }
  emit(bytes: Uint8Array) { for (const fn of this.data) fn(bytes); }
}
function connection(usb = new PipeUsb(), options = { leaseMs: 30000, exchangeMs: 5000 }, provider = adapters) {
  const authority = new AccessoryTrustAuthority(provider); authority.confirmPairing(approval);
  return { authority, usb, client: new AccessorySignedConnection(usb, authority, approval.label, options) };
}

test('real C signatures cross the connection adapter without a legacy handshake; close releases listeners', async () => {
  const { client, usb } = connection(); await client.open(); assert.equal(usb.writes, 0);
  assert.deepEqual((await client.request('system.ping', Uint8Array.of(1, 2))).body, [1, 2]);
  await client.close(); assert.equal(usb.closes, 1); assert.equal(client.held, false);
  assert.equal(usb.data.size, 0); assert.equal(usb.disconnected.size, 0);
  await assert.rejects(client.open()); assert.equal(usb.connects, 1);
});

test('received valid signature cannot publish before the USB write acknowledges successfully', async () => {
  for (const fail of [false, true]) {
    const { client, usb } = connection(), hold = gate(); usb.writeGate = hold.promise; usb.failWrite = fail;
    await client.open(); let settled = false;
    const pending = client.request('system.info').then(() => { settled = true; }, e => { settled = true; throw e; });
    const rejection = fail ? assert.rejects(pending, /write failure/) : null;
    await turn(); assert.equal(settled, false); hold.resolve();
    if (rejection) await rejection; else await pending;
    await client.close(); assert.equal(usb.writes, 1);
  }
});

test('malformed CRC, trailing bytes, duplicated frames and substituted IDs fence and close without retry', async () => {
  const variants = [
    (b: Uint8Array) => { const x = b.slice(); x[x.length - 1]! ^= 1; return x; },
    (b: Uint8Array) => new Uint8Array(Buffer.concat([b, Buffer.of(0)])),
    (b: Uint8Array) => new Uint8Array(Buffer.concat([b, b])),
    (b: Uint8Array) => { const f = one(b); return encode({ ...f, id: f.id + 1 }); },
  ];
  for (const mutation of variants) {
    const { client, usb } = connection(); usb.response = mutation; await client.open();
    await assert.rejects(client.request('system.info')); await client.close();
    assert.equal(usb.writes, 1); assert.equal(usb.closes, 1);
  }
});

test('cancelling acquisition prevents sends; ownership stays held until native acquisition/cleanup settle', async () => {
  const { client, usb, authority } = connection(), hold = gate(); usb.connectGate = hold.promise;
  const opening = client.open(); const rejected = assert.rejects(opening, /cancelled/); await turn();
  const closing = client.close(); assert.equal(client.held, true);
  const replacement = new AccessorySignedConnection(usb, authority, approval.label);
  await assert.rejects(replacement.open(), /owned/); hold.resolve();
  await rejected; await closing; assert.equal(usb.writes, 0); assert.equal(client.held, false);
});

test('failed cleanup permanently fences reuse; unsolicited disconnect and expiry terminate the lease', async () => {
  const { client, usb, authority } = connection(); usb.failClose = true; await client.open();
  await assert.rejects(client.close(), /cleanup/); assert.equal(client.state, 'cleanup-failed');
  await assert.rejects(new AccessorySignedConnection(usb, authority, approval.label).open(), /owned/);
  const other = connection(undefined, { leaseMs: 15, exchangeMs: 10 }); await other.client.open();
  await new Promise(r => setTimeout(r, 25)); await other.client.close(); assert.equal(other.usb.closes, 1);
  const d = connection(); await d.client.open();
  for (const fn of d.usb.disconnected) fn(new Error('detached'));
  await d.client.close(); await assert.rejects(d.client.request('system.info'));
});

test('revocation/cancellation during real verification cannot publish a late successful result', async () => {
  const hold = gate(); let entered = false;
  const x = connection(undefined, undefined, { ...adapters, verifyEd25519: async (...args) => {
    const valid = await adapters.verifyEd25519(...args); entered = true; await hold.promise; return valid;
  } });
  await x.client.open(); const pending = x.client.request('system.info'); const rejected = assert.rejects(pending);
  await turn(); assert.equal(entered, true); x.authority.revoke(approval.label);
  const closing = x.client.close(); hold.resolve(); await rejected; await closing;
});

test('native adapter uses strict bytes and preserves native verification failures', async () => {
  const provider = { isSupported: () => true, randomChallenge: () => Array.from(randomBytes(32)), monotonicMilliseconds: () => 12,
    verifyEd25519: async (key: number[], msg: number[], sig: number[]) => adapters.verifyEd25519(Uint8Array.from(key), Uint8Array.from(msg), Uint8Array.from(sig)) };
  const native = nativeAccessoryTrustAdapters(provider);
  const q = request(), reply = await exchange(q), transcript = accessorySignedReadTranscript(first.key, q, reply.payload);
  assert.equal(await native.verifyEd25519(Buffer.from(first.key, 'hex'), transcript, reply.payload.subarray(-64)), true);
  transcript[0]! ^= 1; assert.equal(await native.verifyEd25519(Buffer.from(first.key, 'hex'), transcript, reply.payload.subarray(-64)), false);
  assert.equal(native.now(), 12); assert.equal(native.randomBytes(32).length, 32); assert.throws(() => native.randomBytes(31));
  assert.throws(() => nativeAccessoryTrustAdapters({ ...provider, isSupported: () => false }));
  for (const bad of [Array(32), Array(32).fill(256), Array(31).fill(1), Array(32).fill(1.1)])
    assert.throws(() => nativeAccessoryTrustAdapters({ ...provider, randomChallenge: () => bad }).randomBytes(32));
});

test('pairing controller requires explicit enable, full independent key confirmation, grants and device selection', async () => {
  const usb = new PipeUsb(); let lists = 0;
  const controller = new SignedReadLabController({ adapters, usbUnavailable: null,
    listDevices: async () => { lists++; return [{ id: 1, vendorId: 2, productId: 3, name: 'Untrusted descriptor' }]; }, createTransport: () => usb });
  await assert.rejects(controller.refresh()); assert.throws(() => controller.confirm(approval)); assert.equal(lists, 0);
  controller.enable(); assert.throws(() => controller.confirm({ ...approval, confirmedPublicKeyHex: second.key }));
  assert.throws(() => controller.confirm({ ...approval, allowedOperations: [] }));
  controller.confirm(approval); assert.equal(usb.connects, 0); await assert.rejects(controller.connect(1));
  await controller.refresh(); await controller.connect(1); assert.equal(usb.writes, 0);
  await controller.read('system.info'); assert.match(controller.snapshot().result!, /apex-s3-signed-lab/);
  await controller.revoke(); assert.equal(controller.snapshot().pairing, null); assert.equal(controller.snapshot().result, null);
  assert.equal(controller.snapshot().enabled, false); controller.dispose();
});

test('background revokes trust, cancels verification and discards stale inventory without auto-resume', async () => {
  const hold = gate(), usb = new PipeUsb(); usb.writeGate = hold.promise;
  const controller = new SignedReadLabController({ adapters, usbUnavailable: null,
    listDevices: async () => [{ id: 1, vendorId: 2, productId: 3, name: 'Lab' }], createTransport: () => usb });
  controller.enable(); controller.confirm(approval); await controller.refresh(); await controller.connect(1);
  const pending = controller.read('system.info'), rejected = assert.rejects(pending); await turn();
  controller.setForeground(false); hold.resolve(); await rejected; await turn();
  assert.equal(controller.snapshot().pairing, null); assert.equal(controller.snapshot().result, null);
  controller.setForeground(true); assert.equal(controller.snapshot().enabled, false);
  assert.equal(usb.writes, 1); assert.equal(usb.connects, 1); controller.dispose();
  const inventoryGate = gate(); const c = new SignedReadLabController({ adapters, usbUnavailable: null,
    listDevices: async () => { await inventoryGate.promise; return [{ id: 1, vendorId: 2, productId: 3, name: 'Late' }]; }, createTransport: () => usb });
  c.enable(); const pendingList = c.refresh(); c.setForeground(false); inventoryGate.resolve(); await pendingList;
  assert.deepEqual(c.snapshot().devices, []); c.dispose();
});
