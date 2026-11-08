import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectIrReceiverExcerpt as inspect, IR_RECEIVER_LIMITS as LIMITS, IrReceiverImportError } from '../packages/core/ir-receiver-import.ts';
import { necFixture } from '../packages/core/analysis.ts';
import type { IrContext } from '../packages/core/ir-offline.ts';
const context: IrContext = { provenance: 'synthetic-fixture', sourceLabel: 'original generated test' };
const hash = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const raw = (values: readonly number[]) => `uint16_t rawData[${values.length}] = {${values.join(', ')}};\n`;
const valid = raw(necFixture().map(Math.round));
function frozenTree(value: unknown): void { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozenTree); } }
async function rejected(source: string, code: string) {
  let calls = 0;
  await assert.rejects(inspect(source, context, async s => { calls++; return hash(s); }), (e: unknown) => e instanceof IrReceiverImportError && e.code === code);
  assert.equal(calls, 0, 'invalid input never reaches hashing');
}
test('original NEC fixture recognizes whole unchanged array; carrier and capture stay unknown', async () => {
  const report = await inspect(valid, context), record = report.records[0]!;
  assert.equal(report.originalSource, valid); assert.equal(report.sha256, await hash(valid)); assert.equal(report.byteCount, valid.length);
  assert.deepEqual(record.durationsUs, necFixture().map(Math.round));
  assert.deepEqual(record.recognition, { status: 'recognized', decoded: { protocol: 'NEC', address: 16, command: 52, evidence: 'offline' } });
  assert.deepEqual(record.carrier, { frequencyHz: null, dutyCycle: null, status: 'unknown-not-in-source' });
  assert.equal(record.captureCompleteness, 'unverified-excerpt-may-omit-overflow-warning'); assert.equal(record.repeats, 'not-inferred');
  assert.deepEqual(report.verification, { physicalCaptureVerified: false, authenticityVerified: false, deviceCompatibilityVerified: false, provenanceIsCallerClaim: true });
  frozenTree(report);
});
test('CRLF, tabs, comments and multiline arrays retain exact source and claimed scalar spelling', async () => {
  const source = '// https://example.invalid/<script>alert(1)</script>\r\n\tuint16_t rawData[3] = {\r\n 9000, // annotation\r\n 2250, 563}; // UNKNOWN 1\r\nuint32_t address = 0x00aF;\r\nuint32_t command = 0xFFFFFFFF;\r\nuint64_t data = 0xFFFFFFFFFFFFFFFF;\r\n';
  const report = await inspect(source, context, hash), record = report.records[0]!;
  assert.equal(report.originalSource, source); assert.equal(report.sha256, await hash(source));
  assert.deepEqual(record.declaredFields, { address: '0x00aF', command: '0xFFFFFFFF', data: '0xFFFFFFFFFFFFFFFF' });
  assert.equal(record.startLine, 2); assert.equal(record.endLine, 7); assert.equal(record.recognition.status, 'not-recognized');
  assert.deepEqual(report, await inspect(source, context));
});
test('multiple excerpts preserve ordinals and all metadata as unverified claims, never override recognition', async () => {
  const report = await inspect(valid + 'uint32_t address = 0x99;\nuint64_t data = 0x123;\n' + raw([1, 65535]), context);
  assert.equal(report.records.length, 2); assert.deepEqual(report.records.map(r => r.ordinal), [1, 2]);
  const first = report.records[0]!; assert.equal(first.declaredFields.address, '0x99');
  assert.equal(first.recognition.status, 'recognized'); if (first.recognition.status === 'recognized') assert.equal(first.recognition.decoded.address, 16);
  assert.deepEqual(report.records[1]!.declaredFields, {});
});
test('does not repair leading gaps, extra timings, repeats or zero-split durations', async () => {
  const timings = necFixture().map(Math.round);
  for (const values of [[1, ...timings], [...timings, 1], [...timings, ...timings], [9000, 2250, 563]]) {
    const r = (await inspect(raw(values), context)).records[0]!;
    assert.deepEqual(r.durationsUs, values); assert.equal(r.recognition.status, 'not-recognized');
  }
  await rejected(raw([65535, 0, 100]), 'unsupported-zero-or-split-duration');
});
test('rejects code, partial input, count mismatch and unsupported serial logs/AC output atomically', async () => {
  const samples: [string, string][] = [
    ['', 'empty-excerpt'], ['// only comment', 'empty-excerpt'], ['Protocol  : NEC\n' + valid, 'expected-rawData-excerpt'],
    [valid + 'uint8_t state[1] = {0x01};\n', 'unsupported-excerpt-line'],
    [valid + 'run();', 'unsupported-excerpt-line'], [valid + 'frequency: 38000', 'unsupported-excerpt-line'],
    ['uint16_t rawData[3] = {1,2,3}; run();', 'unsupported-array-syntax'],
    ['uint16_t rawData[3] = {1,2', 'unterminated-rawData'],
    ['uint16_t rawData[2] = {1,2,3};', 'declared-count-mismatch'],
    ['uint16_t rawData[3] = {1,2,};', 'invalid-duration'],
    ['uint16_t rawData[3] = {1,2,3,};', 'declared-count-mismatch'],
    ['uint16_t rawData[03] = {1,2,3};', 'expected-rawData-excerpt'],
    [valid + 'uint32_t address = 0x1;\nuint32_t address = 0x2;', 'duplicate-declared-field'],
    [valid + 'uint64_t address = 0x1;', 'invalid-declared-field'],
    [valid + 'uint32_t data = 0x1;', 'invalid-declared-field'],
    [valid + 'uint32_t command = 0x100000000;', 'invalid-declared-field'],
    [valid + 'uint64_t data = 0x10000000000000000;', 'unsupported-excerpt-line'],
  ];
  for (const [source, code] of samples) await rejected(source, code);
  for (const value of ['-1', '+1', '1.0', '1e3', '0x12', '012', 'NaN', 'Infinity', '(1)', '1/*comment*/']) await rejected(`uint16_t rawData[1] = {${value}};`, /[+x.(/*-]/.test(value) || /[eNI]/.test(value) ? 'unsupported-array-syntax' : 'invalid-duration');
});
test('all count/timing/line/byte ceilings accept the boundary and reject beyond before hashing', async () => {
  await inspect(raw(Array(LIMITS.timings).fill(65535)).repeat(8), context);
  await rejected(raw(Array(LIMITS.timings + 1).fill(1)), 'timing-limit');
  await rejected(raw(Array(LIMITS.timings).fill(1)).repeat(8) + raw([1]), 'timing-limit');
  await inspect(raw([1]).repeat(LIMITS.records), context);
  await rejected(raw([1]).repeat(LIMITS.records + 1), 'record-limit');
  await rejected(raw([65536]), 'duration-range');
  await inspect('//' + 'x'.repeat(LIMITS.line - 2) + '\n' + valid, context);
  await rejected('//' + 'x'.repeat(LIMITS.line - 1) + '\n' + valid, 'line-limit');
  let source = valid;
  while (LIMITS.bytes - source.length > LIMITS.line + 1) source += '//' + 'x'.repeat(LIMITS.line - 2) + '\n';
  source += '//' + 'x'.repeat(LIMITS.bytes - source.length - 2);
  assert.equal(source.length, LIMITS.bytes); await inspect(source, context);
  await rejected(source + 'x', 'byte-limit');
});
test('source/control/context checks and hash adapter failures cannot manufacture a report', async () => {
  for (const control of ['é', '\0', '\x7f', '\x1b', '\ud800']) await rejected(valid + control, 'non-ascii-or-control');
  await rejected(valid + '\r', 'bare-cr');
  await assert.rejects(inspect(4 as any, context), /invalid-source/);
  let touched = false;
  const bad = { sourceLabel: 'x', get provenance() { touched = true; return 'synthetic-fixture'; } };
  for (const ctx of [null, {}, { ...context, extra: 'x' }, { ...context, provenance: 'physical' }, { ...context, sourceLabel: '\n' }, bad, Object.assign(Object.create(null), context)]) await assert.rejects(inspect(valid, ctx as any), /invalid-context/);
  assert.equal(touched, false);
  for (const value of ['', '0'.repeat(63), '0'.repeat(65), 'A'.repeat(64), null, {}]) await assert.rejects(inspect(valid, context, async () => value as string), /invalid-sha256/);
  await assert.rejects(inspect(valid, context, async () => { throw Error('hash unavailable'); }), /hash unavailable/);
});
test('context snapshot is stable before asynchronous hashing and digest is not a provenance proof', async () => {
  const mutable: IrContext = { ...context }; let release!: (s: string) => void;
  const pending = inspect(valid, mutable, async exact => { assert.equal(exact, valid); return new Promise(resolve => { release = resolve; }); });
  mutable.provenance = 'recorded-import'; mutable.sourceLabel = 'mutated'; release(await hash(valid));
  const report = await pending; assert.deepEqual(report.context, context); assert.equal(report.verification.provenanceIsCallerClaim, true); frozenTree(report);
});
