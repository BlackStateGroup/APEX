import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pairedExample } from '../src/fixtures/paired-example.ts';
import { readPairedDataset, replayPairedObservations, learnPairedProfile, applyPairedProfile, readPairedProfile } from '../packages/core/paired-observations.ts';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function edit(fn: (data: any) => void) { const data = JSON.parse(pairedExample()); fn(data); return JSON.stringify(data); }
test('paired import/replay and learning preserve synthetic provenance with independent declared splits', () => {
  const text = pairedExample(), replay = replayPairedObservations(text); assert.equal(replay.counts.paired, 24); assert.equal(replay.origin, 'synthetic');
  const learned = learnPairedProfile(text, sha(text)); assert.deepEqual(learned.failures, []); assert.ok(learned.profile); assert.equal(learned.profile!.acceptance, 'declared-dataset-only');
  assert.equal(readPairedProfile(JSON.stringify(learned.profile)).sourceSha256, sha(text));
});
test('missing readings abstain and never become zero-valued features', () => {
  const text = edit(d => { d.rows[0].ble = null; d.rows[1].range = null; }); const report = replayPairedObservations(text);
  assert.equal(report.counts.abstained, 2); assert.equal(report.counts.missingBle, 1); assert.equal(report.counts.missingRange, 1);
  assert.equal(report.rows[0]!.features, null); assert.equal(learnPairedProfile(text, sha(text)).profile, null);
});
test('clock uncertainty, unknown calibration and expired calibration force abstention', () => {
  for (const mutate of [(d: any) => { d.clock.uncertaintyMs = 51; }, (d: any) => { d.clock.basis = 'unknown'; }, (d: any) => { d.clock.validToMs = 1; }, (d: any) => { d.clock.offsetMs = -100; }]) {
    const text = edit(mutate); assert.equal(replayPairedObservations(text).counts.paired, 0); assert.equal(learnPairedProfile(text, sha(text)).profile, null);
  }
});
test('timing bound includes uncertainty and accepts exact boundary only', () => {
  const yes = edit(d => { d.clock.uncertaintyMs = 50; }); assert.equal(replayPairedObservations(yes).counts.abstained, 0);
  const no = edit(d => { d.clock.uncertaintyMs = 50.001; }); assert.equal(replayPairedObservations(no).counts.paired, 0);
});
test('duplicate receipts, split leakage, malformed frames and non-monotonic clocks fail parsing', () => {
  for (const mutate of [(d: any) => { d.rows[1].id = d.rows[0].id; }, (d: any) => { d.rows[8].session = d.rows[0].session; }, (d: any) => { d.rows[0].ble.rssi = -999; }, (d: any) => { d.rows[2].ble.tMs = d.rows[0].ble.tMs; }, (d: any) => { d.rows[0].ble.extra = 1; }]) assert.throws(() => readPairedDataset(edit(mutate)));
  assert.throws(() => readPairedDataset(pairedExample().replace('"phone":', '"phone":"fake","phone":')), /Duplicate/);
  assert.throws(() => readPairedDataset(' '.repeat(65537)), /limit/);
});
test('holdout failure cannot retune the candidate or publish a profile', () => {
  const text = edit(d => { d.rows[16].ble.rssi = -40; }); const r = learnPairedProfile(text, sha(text));
  assert.equal(r.profile, null); assert.ok(r.failures.some(f => f.includes('holdout')));
  assert.equal(r.results[16]!.predicted, 'high'); assert.equal(r.results[16]!.expected, 'low');
});
test('unknown false positives, missing control/sham and insufficient sessions block promotion', () => {
  for (const mutate of [(d: any) => { d.rows[22].ble.rssi = -70; }, (d: any) => { d.rows.forEach((r: any) => r.condition = 'signal'); }, (d: any) => { d.rows.forEach((r: any) => r.session = r.split); }]) {
    const text = edit(mutate); assert.equal(learnPairedProfile(text, sha(text)).profile, null);
  }
});
test('reusable profile refuses training replay, changed phone and synthetic-to-real promotion', () => {
  const text = pairedExample(), profile = JSON.stringify(learnPairedProfile(text, sha(text)).profile);
  assert.throws(() => applyPairedProfile(profile, text), /unseen/);
  assert.throws(() => applyPairedProfile(profile, edit(d => { d.phone = 'other'; })), /scope/);
  assert.throws(() => applyPairedProfile(profile, edit(d => { d.origin = 'operator-import'; })), /scope/);
  const unseen = edit(d => { d.rows.forEach((r: any) => { r.id = 'new-' + r.id; r.session = 'new-' + r.session; }); });
  assert.equal(applyPairedProfile(profile, unseen).rows[0]!.predicted, 'low');
});
test('malformed and overlapping profile regions are rejected', () => {
  const p = learnPairedProfile(pairedExample(), sha(pairedExample())).profile!;
  const changed = structuredClone(p); changed.classes[1]!.centre = changed.classes[0]!.centre;
  assert.throws(() => readPairedProfile(JSON.stringify(changed)), /overlapping/);
  changed.classes[0]!.radius = 100; assert.throws(() => readPairedProfile(JSON.stringify(changed)), /bounds/);
});
