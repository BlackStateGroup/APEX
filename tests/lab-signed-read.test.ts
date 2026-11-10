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
