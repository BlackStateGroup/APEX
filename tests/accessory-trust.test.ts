import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign, verify, randomBytes } from 'node:crypto';
import { AccessoryTrustAuthority, ACCESSORY_TRUST, accessorySignedReadTranscript } from '../packages/core/accessory-trust.ts';
import type { AccessoryTrustAdapters, PairingApproval, AccessorySignedExchange } from '../packages/core/accessory-trust.ts';
import { encode, FrameDecoder, Kind } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';

// RFC 8032 public test key material only. Never provision these seeds on devices.
const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const privateKey = createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + seed, 'hex'), format: 'der', type: 'pkcs8' });
const publicKeyHex = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const publicKey = (raw: Uint8Array) => createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
const approval: PairingApproval = { label: 'Bench receiver', publicKeyHex, confirmedPublicKeyHex: publicKeyHex,
  keyVerification: 'out-of-band', authorization: 'owned-or-authorized-lab', allowedOperations: ['system.info', 'system.capabilities', 'system.ping'] };
function setup(overrides: Partial<AccessoryTrustAdapters> = {}) {
  let clock = 100;
  const adapters: AccessoryTrustAdapters = { randomBytes: n => new Uint8Array(randomBytes(n)),
    verifyEd25519: async (key, message, signature) => verify(null, message, publicKey(key), signature), now: () => clock, ...overrides };
  const authority = new AccessoryTrustAuthority(adapters); authority.confirmPairing(approval);
  return { authority, setClock: (value: number) => { clock = value; }, reader: (exchange: AccessorySignedExchange, leaseMs = 1000, exchangeMs = 1000) => authority.createReader(approval.label, exchange, { leaseMs, exchangeMs }) };
}
function decode(wire: Uint8Array): Frame {
  const frames: Frame[] = [], decoder = new FrameDecoder(frame => frames.push(frame));
  // Exercise the unchanged AXP/1 framing through split reads, including its CRC.
  for (let offset = 0; offset < wire.length; offset += 7) decoder.push(wire.slice(offset, offset + 7));
  assert.equal(frames.length, 1); return frames[0]!;
}
// Independent peer-side layout and transcript construction, not the production helper.
function signedReply(request: Frame, body = request.payload.slice(36)): Frame {
  const prefix = new Uint8Array(36 + body.length);
  prefix[0] = 1; prefix[1] = request.payload[1]!; prefix.set(request.payload.subarray(2, 34), 2);
  new DataView(prefix.buffer).setUint16(34, body.length, true); prefix.set(body, 36);
  const message = Buffer.concat([Buffer.from('APEX/AXP1/SIGNED-READ/V1\0'), Buffer.from(publicKeyHex, 'hex'), encode(request), prefix]);
  const signature = sign(null, message, privateKey);
  return { kind: Kind.Response, opcode: 0x70, id: request.id, payload: new Uint8Array(Buffer.concat([prefix, signature])) };
}
const peer: AccessorySignedExchange = async request => decode(encode(signedReply(decode(encode(request)))));
const turn = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

test('real Ed25519 signature and existing AXP framing authenticate exact read bytes without changing AXP/1', async () => {
  const s = setup(), reader = s.reader(peer), payload = Uint8Array.of(0, 1, 255, 128);
  const result = await reader.request('system.ping', payload);
  assert.deepEqual(result.body, [0, 1, 255, 128]); assert.equal(result.publicKeyHex, publicKeyHex);
  assert.equal(result.authentication, 'paired-key-ed25519-signature'); assert.match(result.limitations, /CRC is corruption detection/);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.body)); assert.ok(Object.isFrozen(reader));
  const info = await reader.request('system.info'); assert.deepEqual(info.body, []);
  assert.equal(reader.state, 'ready'); reader.close(); await assert.rejects(reader.request('system.ping'));
});

test('unknown peers, missing approval, key mismatch, implicit grants and replacement cannot auto-pair', () => {
  const s = setup(); assert.throws(() => s.authority.createReader('unknown', peer, { leaseMs: 1000, exchangeMs: 10 }));
  for (const change of [{ keyVerification: undefined }, { authorization: undefined }, { confirmedPublicKeyHex: '0'.repeat(64) },
    { allowedOperations: [] }, { allowedOperations: ['radio.rx.start'] }, { allowedOperations: ['system.ping', 'system.ping'] },
    { publicKeyHex: publicKeyHex.toUpperCase() }, { label: '<script>' }]) {
    const authority = new AccessoryTrustAuthority({ randomBytes, verifyEd25519: async () => false, now: () => 1 });
    assert.throws(() => authority.confirmPairing({ ...approval, ...change } as PairingApproval)); assert.deepEqual(authority.listPairings(), []);
  }
  assert.throws(() => s.authority.confirmPairing(approval));
  assert.throws(() => s.authority.confirmPairing({ ...approval, label: 'Other name' }));
  const list = s.authority.listPairings(); assert.ok(Object.isFrozen(list)); assert.ok(Object.isFrozen(list[0]!.allowedOperations));
});

test('explicit per-operation grants are copied; unsupported transmit/radio and inherited names never dispatch', async () => {
  const s = setup(); s.authority.revoke(approval.label);
  const allowed: PairingApproval['allowedOperations'][number][] = ['system.info'];
  s.authority.confirmPairing({ ...approval, allowedOperations: allowed }); allowed.push('system.ping');
  let dispatched = 0; const reader = s.reader(async q => { dispatched++; return signedReply(q); });
  for (const operation of ['system.ping', 'radio.rx.start', 'radio.tx.start', 'toString', '__proto__']) {
    await assert.rejects(reader.request(operation as 'system.info'));
  }
  await assert.rejects(reader.request('system.info', new Uint8Array(129)));
  await assert.rejects(reader.request('system.info', Uint8Array.of(1))); assert.equal(dispatched, 0);
  await reader.request('system.info'); assert.equal(dispatched, 1);
});

test('legacy, unsupported, unsigned, malformed and envelope-substituted replies fail once with no downgrade', async () => {
  const variants: ((q: Frame) => Frame)[] = [
    q => ({ ...q, kind: Kind.Error, payload: new TextEncoder().encode('{"code":"UNSUPPORTED_OPERATION"}') }),
    q => ({ ...q, kind: Kind.Response, payload: new TextEncoder().encode('{"id":"spoofed","source":"accessory"}') }),
    q => ({ ...signedReply(q), id: q.id + 1 }), q => ({ ...signedReply(q), opcode: 3 }),
    q => ({ ...signedReply(q), kind: Kind.Request }),
    q => ({ ...signedReply(q), payload: signedReply(q).payload.slice(0, -1) }),
    q => { const r = signedReply(q); r.payload[0] = 2; return r; },
    q => { const r = signedReply(q); r.payload[34] = 255; return r; },
  ];
  for (const variant of variants) {
    const s = setup(); let calls = 0;
    const reader = s.reader(async q => { calls++; return decode(encode(variant(q))); });
    await assert.rejects(reader.request('system.info')); assert.equal(reader.state, 'closed');
    await assert.rejects(reader.request('system.info')); assert.equal(calls, 1);
  }
});

test('valid recomputed CRC cannot rescue modified body, challenge, operation or signature', async () => {
  for (const index of [1, 2, 35, 36, 39, 103]) {
    const s = setup(); const reader = s.reader(async q => {
      const reply = signedReply(q, Uint8Array.of(1, 2, 3, 4)); reply.payload[index]! ^= 1;
      return decode(encode(reply)); // CRC deliberately recomputed by an attacker.
    });
    await assert.rejects(reader.request('system.info')); assert.equal(reader.state, 'closed');
  }
});

test('wrong pinned key cannot verify, and a valid signature over a different request is rejected', async () => {
  const s = setup(); s.authority.revoke(approval.label);
  const otherKey = '0'.repeat(64); s.authority.confirmPairing({ ...approval, publicKeyHex: otherKey, confirmedPublicKeyHex: otherKey });
  await assert.rejects(s.reader(peer).request('system.info'));
  for (const mutation of [ (q: Frame) => { q.id++; }, (q: Frame) => { q.payload[q.payload.length - 1]! ^= 1; } ]) {
    const v = setup(); await assert.rejects(v.reader(async q => {
      const originalId = q.id; mutation(q); const reply = signedReply(q); reply.id = originalId; return reply;
    }).request('system.ping', Uint8Array.of(9)));
  }
});

test('old signed replies cannot be replayed across fresh challenges or readers', async () => {
  const s = setup(); let saved: Frame | undefined;
  await s.reader(async q => { saved = signedReply(q); return saved; }).request('system.info');
  const reader = s.reader(async q => ({ ...saved!, id: q.id }));
  await assert.rejects(reader.request('system.info')); assert.equal(reader.state, 'closed');
});

test('duplicate CSPRNG output is rejected across readers and re-pairing, before any second dispatch', async () => {
  const s = setup({ randomBytes: () => new Uint8Array(32) }); let dispatched = 0;
  const exchange: AccessorySignedExchange = async q => { dispatched++; return signedReply(q); };
  await s.reader(exchange).request('system.info');
  s.authority.revoke(approval.label); s.authority.confirmPairing(approval);
  await assert.rejects(s.reader(exchange).request('system.info'), /Repeated/); assert.equal(dispatched, 1);
});

test('revocation followed by re-pairing cannot revive an old reader or an in-flight verification', async () => {
  const verification = deferred<boolean>(), s = setup({ verifyEd25519: () => verification.promise });
  const reader = s.reader(peer), pending = reader.request('system.info'); await turn();
  s.authority.revoke(approval.label); s.authority.confirmPairing(approval); verification.resolve(true);
  await assert.rejects(pending); assert.equal(reader.state, 'closed'); await assert.rejects(reader.request('system.info'));
});

test('lease expiry, rollback, non-finite clocks and clock exceptions fail closed before dispatch', async () => {
  for (const clock of [1100, 99, NaN, Infinity, -1]) {
    const s = setup(); let calls = 0; const reader = s.reader(async q => { calls++; return signedReply(q); });
    s.setClock(clock); await assert.rejects(reader.request('system.info')); assert.equal(calls, 0);
    if (clock !== 1100) { s.setClock(100); assert.throws(() => s.authority.createReader(approval.label, peer, { leaseMs: 1, exchangeMs: 1 })); }
  }
  let fail = false; const s = setup({ now: () => { if (fail) throw Error('clock'); return 100; } });
  const reader = s.reader(peer); fail = true; await assert.rejects(reader.request('system.info'));
});

test('expiry during verification, explicit close, timeout and late completions cannot publish trust', async () => {
  for (const mode of ['expire', 'close', 'timeout'] as const) {
    const verification = deferred<boolean>(), s = setup({ verifyEd25519: () => verification.promise });
    const reader = s.reader(peer, 1000, mode === 'timeout' ? 5 : 1000), pending = reader.request('system.info');
    const rejection = assert.rejects(pending); await turn();
    if (mode === 'expire') s.setClock(1100); else if (mode === 'close') reader.close();
    if (mode === 'timeout') await rejection;
    verification.resolve(true); await rejection; await turn(); assert.equal(reader.state, 'closed');
  }
  const s = setup(); const reader = s.reader(() => new Promise(() => {}), 1000, 5);
  await assert.rejects(reader.request('system.info'), /timed out/); assert.equal(reader.state, 'closed');
});

test('one pending exchange, explicit cancellation and crypto errors never trigger retries', async () => {
  const reply = deferred<Frame>(), s = setup(); let request: Frame | undefined, calls = 0;
  const reader = s.reader(async q => { calls++; request = q; return reply.promise; });
  const first = reader.request('system.info'); await assert.rejects(reader.request('system.info'), /pending/);
  reader.close(); await assert.rejects(first, /cancelled/); reply.resolve(signedReply(request!)); await turn(); assert.equal(calls, 1);
  for (const verifyEd25519 of [async () => { throw Error('unavailable'); }, async () => false, async () => 'yes' as unknown as boolean]) {
    const v = setup({ verifyEd25519 }); await assert.rejects(v.reader(peer).request('system.info'));
  }
});

test('mutating adapter buffers cannot change privately retained request or verified reply', async () => {
  const s = setup({ verifyEd25519: async (key, message, signature) => {
    const valid = verify(null, message, publicKey(key), signature); message.fill(0); signature.fill(0); key.fill(0); return valid;
  } });
  const reader = s.reader(async q => { const reply = signedReply(q); q.payload.fill(0); return reply; });
  const input = Uint8Array.of(2, 4, 6), pending = reader.request('system.ping', input); input.fill(0);
  assert.deepEqual((await pending).body, [2, 4, 6]);
});

test('shared, resizable, detached, non-byte and shadowed large input are rejected before exchange', async () => {
  const detached = new Uint8Array(1); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  const oversized = new Uint8Array(129); Object.defineProperty(oversized, 'byteLength', { value: 1 });
  const invalid = [new Uint8Array(new SharedArrayBuffer(8)), new Uint8Array(new ArrayBuffer(8, { maxByteLength: 16 })), detached,
    new Uint16Array(1), oversized, {}];
  const s = setup(); let calls = 0; const reader = s.reader(async q => { calls++; return signedReply(q); });
  for (const input of invalid) await assert.rejects(reader.request('system.ping', input as Uint8Array));
  assert.equal(calls, 0);
});

test('request and reply maxima fit inside the existing 512-byte envelope; oversized replies reject', async () => {
  const s = setup(); const reader = s.reader(async q => {
    assert.equal(q.payload.length, 164); return signedReply(q);
  });
  assert.equal((await reader.request('system.ping', new Uint8Array(128))).body.length, 128);
  assert.equal((await s.reader(async q => signedReply(q, new Uint8Array(256))).request('system.info')).body.length, 256);
  await assert.rejects(s.reader(async q => signedReply(q, new Uint8Array(257))).request('system.info'));
});

test('pairing and lifetime challenge budgets are bounded without evicting replay history', async () => {
  const s = setup();
  for (let i = 1; i < ACCESSORY_TRUST.maxPeers; i++) {
    const k = i.toString(16).padStart(64, '0'); s.authority.confirmPairing({ ...approval, label: `Bench ${i}`, publicKeyHex: k, confirmedPublicKeyHex: k });
  }
  assert.throws(() => s.authority.confirmPairing({ ...approval, label: 'overflow', publicKeyHex: 'f'.repeat(64), confirmedPublicKeyHex: 'f'.repeat(64) }), /capacity/);
  let counter = 0, calls = 0;
  // Budget test uses a clearly fake trusted verifier, not signature evidence.
  const b = setup({ randomBytes: () => { const bytes = new Uint8Array(32); new DataView(bytes.buffer).setUint32(0, counter++); return bytes; }, verifyEd25519: async () => true });
  const reader = b.reader(async q => { calls++; const r = new Uint8Array(100); r.set(q.payload.subarray(0, 34)); return { kind: 2, opcode: q.opcode, id: q.id, payload: r }; });
  for (let i = 0; i < ACCESSORY_TRUST.maxIssuedChallenges; i++) await reader.request('system.info');
  await assert.rejects(reader.request('system.info'), /budget/); assert.equal(calls, ACCESSORY_TRUST.maxIssuedChallenges);
});

test('canonical transcript agrees byte-for-byte with independent peer construction', () => {
  const query = new Uint8Array(39); query[0] = 1; query[1] = 3; query.fill(0x42, 2, 34); query[34] = 3; query.set([1, 2, 3], 36);
  const request: Frame = { kind: 1, opcode: 0x70, id: 1234, payload: query }, response = signedReply(request);
  const actual = accessorySignedReadTranscript(publicKeyHex, request, response.payload);
  const expected = Buffer.concat([Buffer.from('APEX/AXP1/SIGNED-READ/V1\0'), Buffer.from(publicKeyHex, 'hex'), encode(request), response.payload.subarray(0, -64)]);
  assert.deepEqual(Buffer.from(actual), expected); assert.equal(verify(null, actual, publicKey(Buffer.from(publicKeyHex, 'hex')), response.payload.subarray(-64)), true);
});


test('monotonic exchange deadline rejects overdue microtasks even before the timer can run', async () => {
  for (const boundary of ['exchange', 'verify', 'random'] as const) {
    let clock = 100, dispatched = 0;
    const s = setup({ now: () => clock, randomBytes: n => { if (boundary === 'random') clock = 105; return new Uint8Array(randomBytes(n)); },
      verifyEd25519: async (key, message, signature) => {
        const valid = verify(null, message, publicKey(key), signature);
        if (boundary === 'verify') clock = 105;
        return valid;
      } });
    const reader = s.reader(async q => { dispatched++; const response = signedReply(q); if (boundary === 'exchange') clock = 105; return response; }, 1000, 5);
    await assert.rejects(reader.request('system.info'), /timed out/);
    assert.equal(reader.state, 'closed'); assert.equal(dispatched, boundary === 'random' ? 0 : 1);
  }
});
