// Software integration only: real client chain and actual C data callbacks,
// joined by explicit fake GATT/scheduler/MTU/ACKs, never a browser or SDK startup.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { bridge } from './browser-c-host/bridge.ts';
import { BleTransport, AXP_READY } from '../packages/core/ble-transport.ts';
import { DeviceSession } from '../packages/core/session.ts';
import { encode, crc16, FrameDecoder, Kind, Opcode } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';

const directory = mkdtempSync(join(tmpdir(), 'apex-browser-c-'));
const binary = join(directory, 'bridge');
const sources = ['firmware/esp32s3-reviewed/main/ble_accessory.c', 'firmware/core/apex.c',
  'firmware/core/apex.h', 'firmware/esp32s3/main/ble_accessory.h', ...readdirSync('tests/esp32-reviewed-host/fakes', { recursive: true })
    .filter(path => typeof path === 'string' && path.endsWith('.h')).map(path => 'tests/esp32-reviewed-host/fakes/' + path),
  'tests/browser-c-host/bridge.c',
  'tests/browser-c-host/bridge.ts', 'tests/browser-c-roundtrip.test.ts',
  // Shared current-manifest input: verified bytes only, not executed by this browser-C suite.
  'src/platform/bluetooth.native.ts',
  'src/experimental/web-axp.ts', 'packages/core/ble-transport.ts', 'packages/core/session.ts', 'packages/protocol/index.ts'];
const hashes = Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
const args = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-misleading-indentation',
  '-DCONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=1', '-DESP_PLATFORM',
  '-Itests/esp32-reviewed-host/fakes', '-Ifirmware/core', '-Ifirmware/esp32s3/main',
  'tests/browser-c-host/bridge.c', 'firmware/core/apex.c', '-o', binary];
before(() => {
  const pinned: Record<string, string> = JSON.parse(readFileSync('tests/browser-c-host/current-inputs.sha256.json', 'utf8'));
  for (const [path, expected] of Object.entries(pinned)) assert.equal(hashes[path], expected, 'pinned input: ' + path);
  const result = spawnSync('gcc', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1048576 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
});
after(() => rmSync(directory, { recursive: true, force: true }));
function preserve(name: string, f: ReturnType<typeof bridge>) {
  // Optional local evidence, including partial traces on assertion failures.
  const output = process.env.APEX_BROWSER_C_EVIDENCE;
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, name + '.json'), JSON.stringify({
      scope: 'host-only; fake scheduling/GATT acknowledgments/MTU; no startup, SDK or physical acceptance',
      compile: ['gcc', ...args.map(x => x === binary ? '<temporary-host-binary>' : x)], hashes, trace: f.trace,
    }, null, 2) + '\n');
  }
}
async function open(f: ReturnType<typeof bridge>) {
  const candidate = await f.manager.chooseAccessory();
  const transport = new BleTransport(f.manager, candidate.id, { timeoutMs: 5000 });
  const session = new DeviceSession(transport, { timeoutMs: 3000 });
  return { transport, session };
}
function notifications(f: ReturnType<typeof bridge>) {
  return f.trace.filter(x => x.origin === 'C-notification').map(x => Uint8Array.from(Buffer.from(x.value, 'hex')));
}
function verifyFrames(bytes: Uint8Array[]) {
  const frames: Frame[] = []; const decoder = new FrameDecoder(frame => {
    // Re-encode/CRC check also proves exact bytes, not just field agreement.
    const wire = encode(frame); assert.equal(crc16(wire.slice(0, -2)), wire.at(-2)! | wire.at(-1)! << 8);
    frames.push(frame);
  });
  bytes.forEach(x => decoder.push(x)); assert.equal(decoder.discarded, 0); assert.equal(decoder.bufferedBytes, 0);
  assert.deepEqual(Buffer.concat(bytes), Buffer.concat(frames.map(x => Buffer.from(encode(x)))));
  return frames;
}
const markerPayload = Uint8Array.from(Buffer.from('80a700000000000000004158505f524541', 'hex'));
// Exact payload from the checked-in marker-collision regression; CRC supplies DY.
for (const mtu of [23, 517] as const) {
  test(`browser-to-actual-C roundtrip, fake MTU ${mtu}, explicit close and stale callbacks`, { timeout: 20000 }, async () => {
    const f = bridge(binary, mtu); const { session, transport } = await open(f);
    const published: Uint8Array[] = []; transport.onData(bytes => published.push(bytes));
    try {
      await session.open();
      assert.deepEqual(session.info, { id: 'apex-s3-dev', board: 'esp32s3', firmware: '0.1.0', protocol: 1, source: 'accessory' });
      assert.deepEqual(session.capabilities, ['system.info', 'system.capabilities', 'system.ping']);
      const payloads = [markerPayload, new Uint8Array(), Uint8Array.from({ length: 512 }, (_, i) => i % 256)];
      for (const payload of payloads) assert.deepEqual(await session.request('system.ping', payload), payload);
      const chunks = notifications(f); assert.deepEqual(chunks[0], AXP_READY);
      const replies = verifyFrames(chunks.slice(1));
      assert.deepEqual(replies.map(x => [x.kind, x.opcode, x.id]), [[2,1,1],[2,2,2],[2,3,3],[2,3,4],[2,3,5]]);
      assert.deepEqual(replies.slice(2).map(x => x.payload), payloads);
      const writes = f.trace.filter(x => x.origin === 'client-write').map(x => Uint8Array.from(Buffer.from(x.value.slice(2), 'hex')));
      assert.ok(writes.some(x => x.length === 20)); assert.ok(writes.every(x => x.length <= 20));
      const requests = verifyFrames(writes); assert.deepEqual(requests.map(x => [x.kind,x.opcode,x.id]), [[1,1,1],[1,2,2],[1,3,3],[1,3,4],[1,3,5]]);
      assert.ok(chunks.slice(1).every(x => x.length <= Math.min(mtu - 3, 244)));
      assert.ok(chunks.some(x => x.length === Math.min(mtu - 3, 244)));
      if (mtu === 23) {
        assert.deepEqual(encode(replies[2]!).slice(20), AXP_READY);
        assert.equal(chunks.filter(x => Buffer.from(x).equals(Buffer.from(AXP_READY))).length, 2);
      }
      const staleValue = [...f.values][0]!, staleDisconnect = [...f.disconnects][0]!;
      await session.close(); const retired = await f.retired();
      assert.deepEqual(retired.slice(0, 3), [0, 0, 0]); assert.equal(retired[3], retired[4]); assert.equal(retired[5], 65535);
      assert.equal(session.transportReleasePending, false); assert.equal(f.manager.snapshot().state, 'idle');
      assert.equal(f.values.size, 0); assert.equal(f.disconnects.size, 0);
      const before = published.length, notificationsBefore = notifications(f).length;
      await f.command('TICK'); f.emit(encode(replies[2]!)); staleValue(); staleDisconnect();
      assert.equal(published.length, before); assert.equal(notifications(f).length, notificationsBefore);
      assert.equal(f.manager.snapshot().state, 'idle'); await assert.rejects(session.request('system.ping', markerPayload));
      const closedWrite = await f.command('W 4158'); assert.equal(closedWrite[0], 3);
    } finally { try { await session.close(); } finally { try { await f.dispose(); } finally { preserve(`mtu-${mtu}`, f); } } }
  });
}

test('C flatten rejection propagates through fake GATT into client close and verified fixture retirement', { timeout: 20000 }, async () => {
  const f = bridge(binary, 23); const { session } = await open(f);
  try {
    await session.open(); await f.command('FAIL_FLATTEN');
    const before = notifications(f).length;
    await assert.rejects(session.request('system.ping', Uint8Array.of(7)));
    assert.ok(f.trace.some(x => x.origin === 'fixture-result' && /^R \d+ 14 /.test(x.value)));
    assert.equal(notifications(f).length, before);
    await session.close(); const retired = await f.retired();
    assert.deepEqual(retired.slice(0, 3), [0, 0, 0]); assert.equal(retired[3], retired[4]); assert.equal(retired[5], 65535);
    assert.equal(session.state, 'closed'); assert.equal(session.transportReleasePending, false);
    assert.equal(f.manager.snapshot().state, 'idle'); assert.equal(f.values.size, 0); assert.equal(f.disconnects.size, 0);
  } finally { try { await session.close(); } finally { try { await f.dispose(); } finally { preserve('rejected-write', f); } } }
});

test('CRC-corrupt framed browser write produces no C response; following session request recovers', { timeout: 20000 }, async () => {
  const f = bridge(binary, 23); const { session, transport } = await open(f);
  try {
    await session.open(); const before = notifications(f).length;
    const bad = encode({ kind: Kind.Request, opcode: Opcode.Ping, id: 500, payload: new Uint8Array(512).fill(7) });
    bad[bad.length-1]! ^= 1;
    await transport.write(bad); assert.equal(notifications(f).length, before);
    assert.deepEqual(await session.request('system.ping', markerPayload), markerPayload);
    const frames = verifyFrames(notifications(f).slice(before)); assert.equal(frames.length, 1); assert.equal(frames[0]!.id, 3);
    await session.close(); await f.retired(); assert.equal(session.transportReleasePending, false);
  } finally { try { await session.close(); } finally { try { await f.dispose(); } finally { preserve('corrupt-crc', f); } } }
});

test('host control parser rejects six malformed/over-bound inputs with bounded nonzero exit', () => {
  const inputs = ['1 UNKNOWN\n', '1 W ff', '1 W zz\n', '1 W f\n', '1 W ' + 'ff'.repeat(245) + '\n', Array.from({ length: 513 }, (_, i) => `${i+1} TICK\n`).join('')];
  for (const input of inputs) {
    const result = spawnSync(binary, ['23'], { input, encoding: 'utf8', timeout: 2000, maxBuffer: 65536 });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 2);
    assert.match(result.stderr, /bridge invariant:/); assert.doesNotMatch(result.stdout, /^N /m);
  }
});

test('unexpected host fixture failure rejects an in-flight command and reports failed process cleanup', { timeout: 10000 }, async () => {
  const f = bridge(binary, 23);
  try {
    await assert.rejects(f.command('UNKNOWN'), /bridge exited/);
    await assert.rejects(f.command('TICK'), /bridge exited/);
    await assert.rejects(f.dispose(), /bridge invariant|bridge exited/);
  } finally { preserve('expected-host-failure', f); }
});
