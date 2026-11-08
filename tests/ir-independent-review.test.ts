import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectIrFile, IR_LIMITS } from '../packages/core/ir-offline.ts';
import { IrWorkbenchController, IR_EXAMPLE } from '../src/ir-workbench.ts';
import { bundleDigest } from '../src/platform/bundle-digest.ts';
const context = { provenance: 'synthetic-fixture' as const, sourceLabel: 'independent' };
const hash = (s: string) => createHash('sha256').update(s, 'ascii').digest('hex');
const header = 'Filetype: IR signals file\nVersion: 1\n';
const raw = (durations: string) => `name: raw\ntype: raw\nfrequency: 1000000\nduty_cycle: .99999999999999999999999\ndata: ${durations}\n`;
function frozenTree(x: unknown): void {
  if (x && typeof x === 'object') { assert.ok(Object.isFrozen(x)); for (const v of Object.values(x)) frozenTree(v); }
}
test('independent node crypto oracle: exact-byte ceiling, offset views, comments, CRLF and lexical spellings', async () => {
  let exact = IR_EXAMPLE;
  while (IR_LIMITS.bytes - exact.length > 16385) exact += '#' + 'x'.repeat(16383) + '\n';
  exact += '#' + 'x'.repeat(IR_LIMITS.bytes - exact.length - 1);
  assert.equal(exact.length, IR_LIMITS.bytes);
  const corpus = [IR_EXAMPLE, IR_EXAMPLE.replaceAll('\n', '\r\n'), IR_EXAMPLE + '# final comment',
    IR_EXAMPLE.replace('04 00', 'aF 00').replace('0.33', '000.3300'), exact];
  for (const source of corpus) {
    const backing = Buffer.from('prefix' + source + 'suffix'); const view = backing.subarray(6, -6);
    const expected = hash(source);
    const ordinary = await inspectIrFile(view, context);
    const adapter = await inspectIrFile(view, context, async s => {
      assert.equal(typeof s, 'string'); assert.equal(s, source); return hash(s);
    });
    const web = await inspectIrFile(view, context, bundleDigest);
    assert.equal(ordinary.sha256, expected); assert.deepEqual(adapter, ordinary); assert.deepEqual(web, ordinary);
    frozenTree(ordinary); frozenTree(adapter); frozenTree(web);
  }
});
test('independent total timing ceiling stays atomic and whole-array recognition stays conditional', async () => {
  const c = new IrWorkbenchController(); c.example(c.lease);
  const source = header + raw(Array(1024).fill('4294967295').join(' ')).repeat(8);
  c.edit(source, c.lease); await c.inspect(c.lease); const report = c.state.report;
  assert.ok(report); assert.equal(report.records.length, 8); frozenTree(report);
  for (const r of report.records) { assert.equal(r.type, 'raw'); if (r.type !== 'raw') throw Error();
    assert.equal(r.dutyCycle, 1); assert.equal(r.dutyCycleDecimal, '.99999999999999999999999');
    assert.equal(r.recognition.status, 'not-recognized'); assert.equal(r.repeats, 'not-represented'); }
  c.edit(source + raw('1'), c.lease); await c.inspect(c.lease); assert.equal(c.state.report, null); assert.match(c.state.message, /timing-limit/);
  const recognized = await inspectIrFile(Buffer.from(IR_EXAMPLE), context);
  const r = recognized.records[1]!; if (r.type !== 'raw') throw Error();
  for (const durations of [[1, ...r.durationsUs], [...r.durationsUs, 1], [...r.durationsUs, ...r.durationsUs]]) {
    const report = await inspectIrFile(Buffer.from(header + raw(durations.join(' '))), context);
    const item = report.records[0]!; if (item.type !== 'raw') throw Error();
    assert.equal(item.recognition.status, 'not-recognized'); assert.deepEqual(item.durationsUs, durations);
  }
});
test('independent rejected ASCII controls accepted into draft but never hashed; synchronous throws recover', async () => {
  let calls = 0;
  const c = new IrWorkbenchController(true, () => { calls++; throw Error('local hash unavailable'); });
  c.example(c.lease);
  for (const invalid of ['\t', '\u007f', '\r', '\0']) {
    c.edit(IR_EXAMPLE + invalid, c.lease); assert.equal(c.state.rejectedEdit, false);
    await c.inspect(c.lease); assert.equal(c.state.report, null); assert.equal(c.state.pending, false);
  }
  assert.equal(calls, 0); c.example(c.lease); await c.inspect(c.lease); assert.equal(calls, 1);
  assert.equal(c.state.pending, false); assert.match(c.state.message, /hashing failed/);
  c.clear(c.lease); assert.equal(c.state.provenance, null);
});
