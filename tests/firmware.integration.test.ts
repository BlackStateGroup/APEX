import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DeviceSession } from '../packages/core/session.ts';
import { FirmwareProcessTransport } from '../tools/process-transport.ts';
import { encode, FrameDecoder, Kind, text, utf8 } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';

async function raw(chunks: Uint8Array[], count: number): Promise<Frame[]> {
  const transport = new FirmwareProcessTransport(); const frames: Frame[] = [];
  let resolve!: (frames: Frame[]) => void; let reject!: (error: Error) => void;
  const done = new Promise<Frame[]>((a, b) => { resolve = a; reject = b; });
  const timer = setTimeout(() => reject(new Error('Raw firmware response timeout')), 2000);
  const decoder = new FrameDecoder(frame => { frames.push(frame); if (frames.length >= count) resolve(frames); });
  const stop = transport.onData(bytes => decoder.push(bytes));
  const stopClose = transport.onDisconnect(reject);
  try { await transport.connect(); for (const chunk of chunks) await transport.write(chunk); return await done; }
  finally { clearTimeout(timer); stop(); stopClose(); await transport.disconnect(); }
}
test('TypeScript session negotiates with the compiled C firmware, not the simulator', async t => {
  const session = new DeviceSession(new FirmwareProcessTransport()); t.after(() => session.close()); await session.open();
  assert.equal(session.info!.id, 'apex-host'); assert.equal(session.info!.board, 'host'); assert.equal(session.source, 'host');
  assert.deepEqual(await session.request('system.ping', utf8('C firmware')), utf8('C firmware'));
});
test('C peer accepts independent golden requests including all 256 byte values', async () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/wire.json', import.meta.url), 'utf8'));
  const replies = await raw(fixtures.map((v: { frameHex: string }) => new Uint8Array(Buffer.from(v.frameHex, 'hex'))), fixtures.length);
  assert.equal(JSON.parse(text(replies[0]!.payload)).id, 'apex-host');
  assert.equal(Buffer.from(replies[1]!.payload).toString('hex'), fixtures[1].payloadHex);
  assert.equal(Buffer.from(replies[2]!.payload).toString('hex'), fixtures[2].payloadHex);
});
test('C peer handles fragmented/coalesced frames and ignores a corrupt request', async () => {
  const first = encode({ kind: Kind.Request, id: 11, opcode: 3, payload: utf8('split') });
  const bad = first.slice(); bad[10]! ^= 1;
  const next = encode({ kind: Kind.Request, id: 12, opcode: 3, payload: utf8('next') });
  const chunks = [utf8('boot chatter\n'), bad, ...Array.from(first, b => Uint8Array.of(b)), Uint8Array.from([...next, ...next])];
  const replies = await raw(chunks, 3); assert.deepEqual(replies.map(x => text(x.payload)), ['split', 'next', 'next']);
});
test('C dispatcher rejects unsupported and invalid operations without invoking another action', async () => {
  const replies = await raw([
    encode({ kind: Kind.Request, opcode: 254, id: 1, payload: new Uint8Array() }),
    encode({ kind: Kind.Request, opcode: 1, id: 2, payload: utf8('unexpected') }),
    encode({ kind: Kind.Response, opcode: 3, id: 3, payload: utf8('not a request') }),
    encode({ kind: Kind.Request, opcode: 3, id: 4, payload: utf8('still alive') }),
  ], 3);
  assert.equal(replies[0]!.kind, Kind.Error); assert.equal(JSON.parse(text(replies[0]!.payload)).code, 'UNSUPPORTED_OPERATION');
  assert.equal(JSON.parse(text(replies[1]!.payload)).code, 'INVALID_ARGUMENT'); assert.equal(text(replies[2]!.payload), 'still alive');
});
test('parallel host requests correlate independent binary payloads', async t => {
  const session = new DeviceSession(new FirmwareProcessTransport()); t.after(() => session.close()); await session.open();
  const payloads = Array.from({ length: 8 }, (_, i) => new Uint8Array(512).fill(i));
  assert.deepEqual(await Promise.all(payloads.map(p => session.request('system.ping', p))), payloads);
});
