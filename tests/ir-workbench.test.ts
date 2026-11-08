import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IrWorkbenchController as Controller, IR_EXAMPLE, irExcerpt, irVisibleRecords } from '../src/ir-workbench.ts';
import { inspectIrFile, IR_LIMITS } from '../packages/core/ir-offline.ts';
import type { IrContext } from '../packages/core/ir-offline.ts';
import { bundleDigest } from '../src/platform/bundle-digest.ts';
const hash = async (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const header = 'Filetype: IR signals file\nVersion: 1\n';
const record = 'name: Same\ntype: parsed\nprotocol: NEC\naddress: 04 00 00 00\ncommand: 08 00 00 00\n';
const raw = (duty = '.5', count = 67) => `name: Raw\ntype: raw\nfrequency: 38000\nduty_cycle: ${duty}\ndata: ${Array(count).fill(563).join(' ')}\n`;
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const current = (c: Controller) => c.state;
function ready() { const c = new Controller(); c.example(c.lease); return c; }

test('string adapter parity, exact CRLF bytes, immutable argument, input/context async mutation', async () => {
  const source = IR_EXAMPLE.replaceAll('\n', '\r\n');
  const input = Buffer.from(source), context: IrContext = { provenance: 'synthetic-fixture', sourceLabel: 'x.ir' };
  const gate = deferred<string>(); let seen = '';
  const pending = inspectIrFile(input, context, exact => { assert.equal(typeof exact, 'string'); seen = exact; return gate.promise; });
  input.fill(0); context.sourceLabel = 'changed'; context.provenance = 'recorded-import';
  assert.equal(seen, source); gate.resolve(await hash(source));
  const report = await pending;
  assert.equal(report.originalSource, source); assert.equal(report.context.sourceLabel, 'x.ir'); assert.equal(report.context.provenance, 'synthetic-fixture');
  const originalContext: IrContext = { provenance: 'synthetic-fixture', sourceLabel: 'x.ir' };
  assert.deepEqual(report, await inspectIrFile(Buffer.from(source), originalContext));
  assert.deepEqual(report, await inspectIrFile(Buffer.from(source), originalContext, bundleDigest));
  assert.equal(report.sha256, await hash(source));
});
test('adapter malformed results/rejections never produce a report or alter strict parsing', async () => {
  const ctx: IrContext = { provenance: 'recorded-import', sourceLabel: 'pasted' };
  for (const invalid of ['', 'x'.repeat(64), 'A'.repeat(64), '0'.repeat(63), '0'.repeat(65), null, {}, new Uint8Array(32)]) {
    await assert.rejects(inspectIrFile(Buffer.from(IR_EXAMPLE), ctx, async () => invalid as string), /invalid-sha256/);
  }
  const gate = deferred<string>(), bytes = Buffer.from(IR_EXAMPLE);
  const p = inspectIrFile(bytes, ctx, () => gate.promise); bytes.fill(0); ctx.sourceLabel = 'later';
  gate.reject(new Error('hash failed')); await assert.rejects(p, /hash failed/);
  let calls = 0;
  await assert.rejects(inspectIrFile(Buffer.from(IR_EXAMPLE.replace('protocol: NEC', 'protocol: NECext')), ctx, async () => { calls++; return '0'.repeat(64); }), /unsupported-protocol/);
  assert.equal(calls, 0);
});
test('state and nested report are frozen and inaccessible to alias corruption; declaration is explicit', async () => {
  const c = new Controller(); const before = c.state;
  assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(before));
  assert.throws(() => { (before as any).draft = IR_EXAMPLE; });
  c.edit(IR_EXAMPLE, c.lease); await c.inspect(c.lease); assert.equal(c.state.report, null); assert.match(c.state.message, /Declare/);
  c.declare('recorded-import', c.lease); assert.equal(c.state.report, null); await c.inspect(c.lease);
  const report = c.state.report!;
  assert.equal(report.context.provenance, 'recorded-import'); assert.equal(report.originalSource, IR_EXAMPLE);
  assert.throws(() => { (report.context as any).provenance = 'synthetic-fixture'; });
  assert.throws(() => { (report.records as any).push({}); });
  const r = report.records[1]!; assert.equal(r.type, 'raw');
  if (r.type === 'raw') {
    assert.throws(() => { (r.durationsUs as any)[0] = 1; });
    assert.throws(() => { (r.recognition as any).status = 'fake'; });
    assert.equal(r.recognition.status, 'recognized');
    if (r.recognition.status === 'recognized') { const decoded = r.recognition.decoded; assert.throws(() => { (decoded as any).address = 1; }); }
  }
  irVisibleRecords(c.state).pop(); assert.equal(current(c).report?.records.length, 2);
  c.declare('synthetic-fixture', c.lease); assert.equal(c.state.report, null);
  assert.equal(report.context.provenance, 'recorded-import'); assert.equal(before.draft, '');
  c.example(c.lease); assert.equal(c.state.report, null); assert.equal(c.state.provenance, 'synthetic-fixture');
});
test('whole edit bounds preserve exact source; rejected edit remains blocked across declarations/tabs', async () => {
  const c = ready(); await c.inspect(c.lease);
  for (const bad of ['x'.repeat(IR_LIMITS.bytes + 1), 'é', '\ud800', 123 as any]) {
    c.edit(bad, c.lease); assert.equal(c.state.draft, IR_EXAMPLE); assert.equal(c.state.report, null); assert.equal(c.state.rejectedEdit, true);
    c.declare('recorded-import', c.lease); await c.inspect(c.lease); assert.equal(c.state.report, null); assert.equal(c.state.pending, false);
    c.deactivate(); c.activate(); await c.inspect(c.lease); assert.equal(c.state.rejectedEdit, true);
  }
  const exact = 'x'.repeat(IR_LIMITS.bytes); c.edit(exact, c.lease); assert.equal(c.state.draft, exact); assert.equal(c.state.rejectedEdit, false);
  await c.inspect(c.lease); assert.equal(c.state.report, null); assert.match(c.state.message, /line-limit/);
  const source = IR_EXAMPLE.replaceAll('\n', '\r\n'); c.edit(source, c.lease); await c.inspect(c.lease); assert.equal(current(c).report?.originalSource, source);
  c.edit('\0', c.lease); assert.equal(c.state.draft, '\0'); await c.inspect(c.lease); assert.match(c.state.message, /non-ascii-or-control/);
  c.clear(c.lease); assert.equal(c.state.draft, ''); assert.equal(c.state.provenance, null); assert.equal(c.state.rejectedEdit, false);
});
test('success and error completions are fenced by edits, rejected edits, declarations, clear, example and tab transitions', async () => {
  for (const settle of ['resolve', 'reject'] as const) for (const mutation of ['edit', 'reject-edit', 'declare', 'clear', 'example', 'tab'] as const) {
    const gate = deferred<string>(); const c = new Controller(true, () => gate.promise); c.example(c.lease);
    const p = c.inspect(c.lease); assert.equal(c.state.pending, true);
    switch (mutation) {
      case 'edit': c.edit(header + record, c.lease); break;
      case 'reject-edit': c.edit('é', c.lease); break;
      case 'declare': c.declare('recorded-import', c.lease); break;
      case 'clear': c.clear(c.lease); break;
      case 'example': c.example(c.lease); break;
      case 'tab': c.deactivate(); c.activate(); break;
    }
    const state = c.state;
    if (settle === 'resolve') gate.resolve(await hash(IR_EXAMPLE)); else gate.reject(Error('late failure'));
    await p; assert.equal(c.state, state, `${settle}/${mutation}`); assert.equal(c.state.pending, false); assert.equal(c.state.report, null);
  }
});
test('new inspection survives old success/error and duplicate pending inspection is ignored', async () => {
  for (const outcome of ['success', 'error']) {
    const first = deferred<string>(), second = deferred<string>(); let calls = 0;
    const c = new Controller(true, () => ++calls === 1 ? first.promise : second.promise); c.example(c.lease);
    const old = c.inspect(c.lease); await c.inspect(c.lease); assert.equal(calls, 1);
    c.edit(header + record, c.lease); const next = c.inspect(c.lease); assert.equal(calls, 2);
    second.resolve(await hash(header + record)); await next; const state = c.state;
    if (outcome === 'success') first.resolve(await hash(IR_EXAMPLE)); else first.reject(Error('stale'));
    await old; assert.equal(c.state, state); assert.equal(state.report?.originalSource, header + record);
  }
});
test('queued callbacks from prior activation cannot edit, clear, declare, load, page or inspect after reentry', async () => {
  let hashes = 0; const c = new Controller(true, async s => { hashes++; return hash(s); }); c.example(c.lease);
  const lease = c.lease;
  const actions = [() => c.edit('old', lease), () => c.clear(lease), () => c.declare('recorded-import', lease), () => c.example(lease), () => c.page(1, lease), () => c.inspect(lease)];
  c.deactivate(); for (const action of actions) await action(); assert.equal(c.state.draft, IR_EXAMPLE);
  c.activate(); c.edit(header + record.repeat(9), c.lease); await c.inspect(c.lease); const state = c.state;
  for (const action of actions) await action(); assert.equal(c.state, state); assert.equal(hashes, 1);
  c.deactivate(); assert.equal(c.state.report, null); assert.equal(c.state.draft, header + record.repeat(9));
});
test('bounded four-record pages; original long names/duty survive display excerpts and numeric summaries', async () => {
  const c = ready(); c.edit(header + record.repeat(9), c.lease); await c.inspect(c.lease);
  for (let page = 0; page < 3; page++) { c.page(page, c.lease); assert.deepEqual(irVisibleRecords(c.state).map(r => r.ordinal), page === 0 ? [1, 2, 3, 4] : page === 1 ? [5, 6, 7, 8] : [9]); }
  for (const page of [-1, 3, Infinity, NaN, .5]) { c.page(page, c.lease); assert.equal(c.state.page, 2); }
  const duty = '0'.repeat(8000) + '.5', name = 'x'.repeat(128);
  c.edit(header + raw(duty, 1024).replace('name: Raw', 'name: ' + name), c.lease); await c.inspect(c.lease);
  const r = c.state.report!.records[0]!; assert.equal(r.name, name);
  assert.match(irExcerpt(name), /first 64 of 128 ASCII characters/); assert.ok(irExcerpt(duty).length < 130);
  if (r.type !== 'raw') assert.fail(); assert.equal(r.dutyCycleDecimal, duty); assert.equal(r.dutyCycle, .5); assert.equal(r.durationsUs.length, 1024);
});
test('malformed and unsupported sources rejected whole without partial records', async () => {
  const c = ready();
  for (const source of [header, header + record + raw('1.00000000000000000001'), header + record.replace('NEC', 'Pioneer'), IR_EXAMPLE + 'extra: ignored\n', header + raw('.5', 1025)]) {
    c.edit(source, c.lease); await c.inspect(c.lease); assert.equal(c.state.report, null); assert.match(c.state.message, /Subset rejected/);
  }
});
