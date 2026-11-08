import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectIrFile as inspect, IR_LIMITS, type IrContext } from '../packages/core/ir-offline.ts';
const context: IrContext = { provenance: 'synthetic-fixture', sourceLabel: 'manual.ir' };
const header = 'Filetype: IR signals file\nVersion: 1\n';
const parsed = 'name: Same\ntype: parsed\nprotocol: NEC\naddress: 12 00 00 00\ncommand: 34 00 00 00\n';
const raw = (data = '9000 2250 563', frequency = '38000', duty = '0.33') => `name: Raw\ntype: raw\nfrequency: ${frequency}\nduty_cycle: ${duty}\ndata: ${data}\n`;
const inspectText = (s: string) => inspect(Buffer.from(s), context);
const reject = (s: string) => assert.rejects(inspectText(s));
// Synthetic pulse list only for decoder tests, never an outbound API or captured data.
const pulseFixture = (bytes = [0x12, 0xed, 0x34, 0xcb]) => [9000, 4500, ...bytes.flatMap(byte => Array.from({ length: 8 }, (_, bit) => [563, byte & (1 << bit) ? 1688 : 563]).flat()), 563];
test('manual fixture, exact bytes/hash, line ranges, adjacent duplicate names and CRLF comments', async () => {
  const fixture = await readFile(new URL('./fixtures/ir/manual-nec.ir', import.meta.url));
  const first = await inspect(fixture, context);
  assert.equal(first.sha256, createHash('sha256').update(fixture).digest('hex'));
  const source = (header + '# comment\n' + parsed + parsed).replaceAll('\n', '\r\n');
  const r = await inspectText(source);
  assert.equal(r.originalSource, source); assert.equal(r.byteCount, Buffer.byteLength(source));
  assert.deepEqual(r.records.map(x => [x.ordinal, x.startLine, x.endLine, x.name, x.repeats]), [[1, 4, 8, 'Same', 'not-represented'], [2, 9, 13, 'Same', 'not-represented']]);
  assert.equal(r.records[0]!.type === 'parsed' && r.records[0]!.address, 18);
  assert.equal(r.verification.physicalCaptureVerified, false);
});
test('intrinsic byte snapshot and context snapshot survive async mutation', async () => {
  const b = Buffer.from(header + parsed), c = { ...context };
  Object.defineProperty(b, 'byteLength', { get() { throw Error('do not call'); } });
  Object.defineProperty(b, Symbol.iterator, { value() { throw Error('do not iterate input'); } });
  const promise = inspect(b, c); b.fill(0); c.provenance = 'recorded-import'; c.sourceLabel = 'changed';
  const r = await promise; assert.equal(r.originalSource, header + parsed); assert.deepEqual(r.context, context);
  assert.equal(r.sha256, createHash('sha256').update(header + parsed).digest('hex'));
  assert.throws(() => { (r.records as unknown[]).push({}); });
  await assert.rejects(inspect(new Uint8Array(new SharedArrayBuffer(10)), context));
  await assert.rejects(inspect(new Uint8Array(new ArrayBuffer(10, { maxByteLength: 20 })), context));
  await assert.rejects(inspect(new Proxy(new Uint8Array(), {}), context));
  const accessor = { get provenance() { throw Error('getter'); }, sourceLabel: 'x' };
  await assert.rejects(inspect(Buffer.from(header + parsed), accessor as unknown as IrContext), /invalid-context/);
});
test('strict syntax rejects duplicates, missing/unknown fields and unsafe cross-record recovery', async () => {
  for (const source of [header, header + parsed + 'unknown: x', header + parsed.replace('type: parsed', 'name: extra\ntype: parsed'),
    header + parsed.replace('command: 34 00 00 00\n', '') + parsed,
    header + parsed.replace('type: parsed', 'type:parsed'), header + parsed.replace('type: parsed', 'type: parsed\ntype: parsed'),
    header.replace('IR signals file', 'IR library file') + parsed, header.replace('1', '2') + parsed,
    header + parsed.replace('NEC', 'NECext'), header + parsed.replace('NEC', 'Pioneer'), header + parsed.replace('12 00 00 00', '12 01 00 00'),
    header + parsed.replace('12 00 00 00', '12 00 00'), (header + parsed).replaceAll('\n', '\r'), header + parsed + 'repeat: 1']) await reject(source);
  for (const b of [Buffer.from([0xff]), Buffer.from('é'), Buffer.from('\ufeff' + header + parsed), Buffer.from(header + parsed + '\0')]) await assert.rejects(inspect(b, context));
});
test('bounded actual bytes, lines, names, record and timing counts', async () => {
  await assert.rejects(inspect(new Uint8Array(IR_LIMITS.bytes + 1), context), /byte-limit/);
  const room = IR_LIMITS.bytes - (header + parsed).length;
  const comment = '#' + 'x'.repeat(1022) + '\n';
  const padding = comment.repeat(Math.floor(room / 1024)) + '#' + 'x'.repeat(room % 1024 - 1);
  const boundary = header + parsed + padding;
  assert.equal((await inspectText(boundary)).byteCount, IR_LIMITS.bytes);
  await reject(boundary + 'x');
  const detached = new Uint8Array(5); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  await assert.rejects(inspect(detached, context));
  const spoof = new Uint8Array(IR_LIMITS.bytes + 1); Object.defineProperty(spoof, 'byteLength', { value: 1 });
  await assert.rejects(inspect(spoof, context), /byte-limit/);
  const exact = header + parsed + '#' + 'x'.repeat(IR_LIMITS.bytes - (header + parsed).length - 1);
  await reject(exact); // Still subject to independent line cap.
  await reject(header + parsed.replace('Same', 'a'.repeat(129)));
  await inspectText(header + parsed.replace('Same', 'a'.repeat(128)));
  await inspectText(header + parsed.repeat(128)); await reject(header + parsed.repeat(129));
  await inspectText(header + '#' + 'x'.repeat(IR_LIMITS.line - 1) + '\n' + parsed);
  await reject(header + '#' + 'x'.repeat(IR_LIMITS.line) + '\n' + parsed);
  const max = raw(Array(1024).fill('1').join(' '));
  await inspectText(header + max.repeat(8)); await reject(header + max.repeat(8) + raw('1'));
  await reject(header + raw(Array(1025).fill('1').join(' ')));
  for (const data of ['', '0', '4294967296', '-1', '+1', '1.0', '1e2', '1  2', '1 ', 'NaN']) await reject(header + raw(data));
  await inspectText(header + raw('4294967295'));
});
test('raw numerical limits and finite strict fractions', async () => {
  for (const f of ['9999', '1000001', '1e5', '38000x']) await reject(header + raw('1', f));
  for (const d of ['0', '1.01', 'NaN', 'Infinity', '+0.5', '-0.5', '1e-1', '0.5x', '0.', '1.00000000000000001', '1.0000000000000001', '0001.00000000000000001', '0.' + '0'.repeat(324) + '1']) await reject(header + raw('1', '38000', d));
  for (const d of ['0.99999999999999999', '1.00000000000000000', '0.' + '0'.repeat(323) + '5', '0'.repeat(2048) + '1.000', '0'.repeat(2048) + '.5']) {
    const r = await inspectText(header + raw('1', '38000', d));
    assert(r.originalSource.includes(d));
    assert(r.records[0]!.type === 'raw' && r.records[0]!.dutyCycle > 0);
    assert.equal(r.records[0]!.type === 'raw' && r.records[0]!.dutyCycleDecimal, d);
    assert.equal(r.records[0]!.type === 'raw' && r.records[0]!.dutyCycleProjection, 'binary64-rounded');
  }
  await inspectText(header + raw('1', '10000', '.5')); await inspectText(header + raw('1', '1000000', '1'));
});
test('raw recognition is whole standard NEC only; fields are not airframes', async () => {
  const p = pulseFixture();
  for (const [durations, expected] of [[p, 'recognized'], [[9000, 2250, 563], 'not-recognized'], [pulseFixture([0x12, 0x13, 0x34, 0xcb]), 'not-recognized'], [[...p, ...p], 'not-recognized'], [p.slice(1), 'not-recognized'], [[...p, 50000], 'not-recognized']] as const) {
    const r = (await inspectText(header + raw(durations.join(' ')))).records[0]!;
    assert.equal(r.type === 'raw' && r.recognition.status, expected);
    assert.equal(r.type === 'raw' && r.timingConvention, 'assumed-first-mark-alternating');
    assert.equal(r.type === 'raw' && r.carrierMetadata, 'declared-not-measured');
  }
  const r = await inspectText(header + parsed.replace('Same', '$(touch /tmp/never); https://example.invalid/#x'));
  assert.match(r.records[0]!.name, /^\$\(/); assert(!Object.hasOwn(r.records[0]!, 'pulses'));
});
test('CLI executes with filesystem writes denied and stdout atomic; regular-file bounds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ir-offline-'));
  try {
    const path = join(dir, 'manual.ir'); await writeFile(path, header + parsed);
    const run = (file: string, provenance = 'synthetic-fixture') => spawnSync(process.execPath,
      ['--permission', `--allow-fs-read=${resolve('.')}`, `--allow-fs-read=${dir}`, 'tools/inspect-ir-offline.ts', file, '--provenance', provenance], { encoding: 'utf8', maxBuffer: IR_LIMITS.output + 4096 });
    const ok = run(path); assert.equal(ok.status, 0, ok.stderr); assert.equal(JSON.parse(ok.stdout).context.sourceLabel, 'manual.ir');
    await writeFile(path, header + parsed + 'bad: late'); const bad = run(path); assert.equal(bad.status, 1); assert.equal(bad.stdout, '');
    await writeFile(path, Buffer.alloc(IR_LIMITS.bytes + 1)); assert.equal(run(path).status, 1);
    await symlink(path, join(dir, 'link.ir')); assert.equal(run(join(dir, 'link.ir')).status, 1);
    assert.equal(run(dir).status, 1); assert.equal(run(path, 'captured').status, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
