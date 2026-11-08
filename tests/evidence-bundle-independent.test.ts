import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EvidenceBundleWorkbench } from '../src/evidence-bundle-workbench.ts';
import { MAX_BUNDLE_CHARACTERS } from '../packages/core/evidence-bundle.ts';
import { bundleFixture, sha256 } from './bundle-preview-fixture.ts';

// These guards intentionally fail on the reviewed revision. Do not weaken them to
// match mutable output: a displayed verification must describe the exact snapshot.
test('independent: returned state cannot replace the draft behind a verified report', async () => {
  const c = new EvidenceBundleWorkbench(); c.edit((await bundleFixture(1)).bundle); await c.inspect(sha256);
  const original = c.state.document;
  try { Reflect.set(c.state, 'document', '{}'); } catch { /* freezing may reject mutation */ }
  assert.equal(c.state.document, original);
});
test('independent: returned report metadata and exact documents cannot be mutated', async () => {
  const { bundle, documents } = await bundleFixture(1);
  const c = new EvidenceBundleWorkbench(); c.edit(bundle); await c.inspect(sha256);
  const report = c.state.report!;
  try { Reflect.set(report.records[0]!, 'source', 'native-ios'); } catch { /* acceptable rejection */ }
  try { Reflect.set(report.recordDocuments, '0', '{}'); } catch { /* acceptable rejection */ }
  assert.equal(c.state.report!.records[0]!.source, 'offline-import');
  assert.equal(c.state.report!.recordDocuments[0], documents[0]);
});
test('independent: nested payload and record arrays cannot mutate a verified snapshot', async () => {
  const c = new EvidenceBundleWorkbench(); c.edit((await bundleFixture(1)).bundle); await c.inspect(sha256);
  const report = c.state.report!;
  try { (report.records[0]!.payload as { note: string }).note = 'forged'; } catch { /* acceptable rejection */ }
  try { (report.records as unknown as unknown[]).push(report.records[0]!); } catch { /* acceptable rejection */ }
  assert.equal((c.state.report!.records[0]!.payload as { note: string }).note, 'not displayed');
  assert.equal(c.state.report!.records.length, 1);
});
test('independent: old hash error cannot clear newer pending state or overwrite newest success', async () => {
  const c = new EvidenceBundleWorkbench(); c.edit((await bundleFixture(1)).bundle);
  let rejectOld!: (e: Error) => void;
  const old = c.inspect(() => new Promise<string>((_, reject) => { rejectOld = reject; }));
  let releaseNew!: () => void;
  const gate = new Promise<void>(resolve => { releaseNew = resolve; });
  const newer = c.inspect(async text => { await gate; return sha256(text); });
  const pending = c.state; rejectOld(new Error('obsolete'));
  await old; assert.equal(c.state, pending); assert.equal(c.state.pending, true);
  releaseNew(); await newer; assert.ok(c.state.report); assert.doesNotMatch(c.state.message, /obsolete/);
});
test('independent: UTF-16 rejection counts surrogate pairs whole and fences pending inspection', async () => {
  const c = new EvidenceBundleWorkbench(); const { bundle } = await bundleFixture(1); c.edit(bundle);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = c.inspect(async text => { await gate; return sha256(text); });
  c.edit('😀'.repeat(MAX_BUNDLE_CHARACTERS / 2) + 'x');
  const rejected = c.state; assert.equal(rejected.document, bundle); assert.equal(rejected.report, null);
  release(); await pending; assert.equal(c.state, rejected);
});
test('independent: preview has no journal/provider/network/action imports or executable URL projection', () => {
  const controller = readFileSync(new URL('../src/evidence-bundle-workbench.ts', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../src/EvidenceBundleWorkbench.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(controller + card, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|AsyncStorage|Linking|openURL|dangerouslySetInnerHTML|evidenceStore)\b/);
  assert.doesNotMatch(card, /\b(?:href|src|onClick)\s*=/);
  assert.match(card, /records\.slice\(state\.page \* BUNDLE_PAGE_SIZE/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<EvidenceBundleWorkbench active=\{tab === 'Evidence'\} \/>/);
});
