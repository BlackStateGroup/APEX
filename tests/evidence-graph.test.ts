import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeEvidenceGraph, parseEvidenceGraph, MAX_EVIDENCE_GRAPH_CHARACTERS } from '../packages/core/evidence-graph.ts';

const fixture = readFileSync(new URL('./fixtures/evidence-graph.json', import.meta.url), 'utf8');
const input = () => JSON.parse(fixture);
function changed(change: (value: any) => void) { const value = input(); change(value); return JSON.stringify(value); }
const report = (change: (value: any) => void) => analyzeEvidenceGraph(changed(change));

test('synthetic graph deterministically links all four node kinds and retains contrary evidence', () => {
  const result = analyzeEvidenceGraph(fixture);
  assert.deepEqual(result, analyzeEvidenceGraph(fixture));
  assert.equal(result.edges.length, 9);
  assert.deepEqual(result.edges.map(x => x.relation), ['includes-device', 'recorded-in', 'attributed-to', 'recorded-in', 'attributed-to', 'about-device', 'tested-in', 'supports', 'contradicts']);
  assert.deepEqual(result.edges.at(-1), { from: 'recording-counterexample', to: 'hypothesis-temperature', relation: 'contradicts', subset: 'held-out' });
  const h = result.hypotheses[0]!;
  assert.equal(h.evidenceState, 'mixed'); assert.equal(h.distinctDeclaredArtifacts, 2);
  assert.equal(h.supportingArtifacts, 1); assert.equal(h.contradictingArtifacts, 1);
  assert.equal(h.declaredConfidence.value, 0.6); assert.equal(h.status, 'hypothesis');
  assert.ok(h.warnings.some(w => w.includes('Contradicting')));
});
test('confidence remains a declaration and native labels cannot authenticate devices or bytes', () => {
  const result = report(x => { x.hypotheses[0].confidence.value = 1; x.hypotheses[0].confidence.source = 'model-declared'; x.recordings[0].origin = 'native-capture'; });
  assert.equal(result.hypotheses[0]!.declaredConfidence.value, 1);
  assert.equal(result.hypotheses[0]!.confidenceCalibration, 'not-established');
  assert.equal(result.identityStatus, 'not-authenticated'); assert.equal(result.artifactIntegrity, 'not-verified');
  assert.equal(result.sampleIndependence, 'not-established'); assert.match(result.caveat, /never increased/);
});
test('same declared content is grouped, contradictory interpretations and subset leakage stay visible', () => {
  const result = report(x => { x.recordings[1].artifact.sha256 = x.recordings[0].artifact.sha256; x.recordings[1].origin = 'native-capture'; });
  const h = result.hypotheses[0]!;
  assert.equal(h.recordingReferences, 2); assert.equal(h.distinctDeclaredArtifacts, 1);
  assert.equal(h.evidenceState, 'mixed'); assert.equal(h.supportingArtifacts, 1); assert.equal(h.contradictingArtifacts, 1);
  assert.equal(h.discoveryHeldOutOverlap.length, 1); assert.equal(h.conflictingInterpretations.length, 1);
  assert.equal(h.conflictingOrigins.length, 1); assert.equal(h.warnings.length, 5);
});
test('duplicate content cannot inflate support or declared confidence', () => {
  const result = report(x => { x.recordings[1].artifact.sha256 = x.recordings[0].artifact.sha256; x.hypotheses[0].evidence[1].relation = 'supports'; });
  assert.equal(result.hypotheses[0]!.supportingArtifacts, 1);
  assert.equal(result.hypotheses[0]!.declaredConfidence.value, 0.6);
});
test('empty graph and unevidenced hypotheses remain useful without claiming support', () => {
  const empty = analyzeEvidenceGraph(JSON.stringify({ schemaVersion: 1, devices: [], experiments: [], recordings: [], hypotheses: [] }));
  assert.deepEqual(empty.edges, []); assert.deepEqual(empty.hypotheses, []);
  const h = report(x => { x.hypotheses[0].evidence = []; x.hypotheses[0].confidence.value = null; }).hypotheses[0]!;
  assert.equal(h.evidenceState, 'no-evidence'); assert.equal(h.declaredConfidence.value, null);
  assert.deepEqual(h.warnings, ['No linked recording evidence.']);
});
test('support-only, contradiction-only and inconclusive evidence states are distinct', () => {
  for (const [relation, state] of [['supports', 'support-linked'], ['contradicts', 'contradiction-linked'], ['inconclusive', 'inconclusive-only']]) {
    const h = report(x => { for (const e of x.hypotheses[0].evidence) e.relation = relation; }).hypotheses[0]!;
    assert.equal(h.evidenceState, state); assert.equal(h.declaredConfidence.value, 0.6);
  }
});
test('equal labels never merge device handles or transfer support between hypotheses', () => {
  const result = report(x => {
    x.devices.push({ ...x.devices[0], id: 'other-device' });
    x.experiments[0].deviceIds.push('other-device');
    x.hypotheses.push({ ...x.hypotheses[0], id: 'other-hypothesis', deviceIds: ['other-device'], evidence: [] });
  });
  assert.equal(result.graph.devices.length, 2); assert.equal(result.hypotheses[1]!.evidenceState, 'no-evidence');
  assert.equal(result.hypotheses[0]!.supportingArtifacts, 1);
});
test('unreferenced recordings do not affect a hypothesis', () => {
  const result = report(x => x.recordings.push({ ...x.recordings[0], id: 'unused' }));
  assert.equal(result.hypotheses[0]!.recordingReferences, 2);
  assert.equal(result.hypotheses[0]!.distinctDeclaredArtifacts, 2);
});
test('graph and every nested result are frozen, including returned edge and warning arrays', () => {
  function inspect(value: unknown) { if (!value || typeof value !== 'object') return; assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) inspect(child); }
  inspect(analyzeEvidenceGraph(fixture));
});
test('global node IDs, list references and per-hypothesis evidence must be unique', () => {
  for (const change of [
    (x: any) => x.devices.push({ ...x.devices[0] }),
    (x: any) => { x.recordings[0].id = x.devices[0].id; },
    (x: any) => x.experiments[0].deviceIds.push(x.devices[0].id),
    (x: any) => x.hypotheses[0].deviceIds.push(x.devices[0].id),
    (x: any) => x.hypotheses[0].experimentIds.push(x.experiments[0].id),
    (x: any) => x.hypotheses[0].evidence.push({ ...x.hypotheses[0].evidence[0], relation: 'contradicts' }),
  ]) assert.throws(() => parseEvidenceGraph(changed(change)), /Duplicate/);
});
test('dangling and wrong-kind references reject rather than inventing nodes', () => {
  for (const change of [
    (x: any) => { x.experiments[0].deviceIds[0] = 'missing'; },
    (x: any) => { x.recordings[0].experimentId = x.devices[0].id; },
    (x: any) => { x.recordings[0].deviceId = x.experiments[0].id; },
    (x: any) => { x.hypotheses[0].deviceIds[0] = 'missing'; },
    (x: any) => { x.hypotheses[0].experimentIds[0] = x.devices[0].id; },
    (x: any) => { x.hypotheses[0].evidence[0].recordingId = x.devices[0].id; },
  ]) assert.throws(() => parseEvidenceGraph(changed(change)), /Unknown|scope/);
});
test('recording and hypothesis links cannot escape explicitly declared device/experiment scopes', () => {
  const outside = (x: any) => {
    x.devices.push({ ...x.devices[0], id: 'outside-device' });
    x.experiments.push({ ...x.experiments[0], id: 'outside-experiment', deviceIds: ['outside-device'] });
  };
  for (const change of [
    (x: any) => { x.recordings[0].deviceId = 'outside-device'; },
    (x: any) => { x.hypotheses[0].deviceIds = ['outside-device']; },
    (x: any) => { x.hypotheses[0].experimentIds = ['outside-experiment']; },
    (x: any) => { x.recordings[0].deviceId = 'outside-device'; x.recordings[0].experimentId = 'outside-experiment'; },
  ]) assert.throws(() => parseEvidenceGraph(changed(x => { outside(x); change(x); })), /scope/);
});
test('unknown fields cannot smuggle identity, verification, confidence propagation, commands or paths', () => {
  for (const [target, key] of [['root', 'authenticated'], ['device', 'identityStatus'], ['recording', 'verified'], ['artifact', 'path'], ['hypothesis', 'status'], ['confidence', 'calibrated'], ['evidence', 'execute']]) {
    assert.throws(() => parseEvidenceGraph(changed(x => {
      const targets: any = { root: x, device: x.devices[0], recording: x.recordings[0], artifact: x.recordings[0].artifact, hypothesis: x.hypotheses[0], confidence: x.hypotheses[0].confidence, evidence: x.hypotheses[0].evidence[0] };
      targets[target!][key!] = true;
    })), /schema/);
  }
});
test('duplicate decoded JSON keys and prototype-shaped unknown fields reject', () => {
  assert.throws(() => parseEvidenceGraph(fixture.replace('"schemaVersion": 1', '"schemaVersion": 1, "schema\\u0056ersion": 1')), /Duplicate JSON/);
  assert.throws(() => parseEvidenceGraph(fixture.replace('"schemaVersion": 1', '"schemaVersion": 1, "__proto__": {}')), /schema/);
});
test('missing fields, wrong object kinds and unsupported schemas reject', () => {
  for (const change of [
    (x: any) => { delete x.devices[0].scope; }, (x: any) => { x.schemaVersion = 2; },
    (x: any) => { x.recordings[0].artifact = []; }, (x: any) => { x.hypotheses[0].confidence = null; },
    (x: any) => { x.devices = {}; }, (x: any) => { x.devices[0] = null; },
  ]) assert.throws(() => parseEvidenceGraph(changed(change)));
});
test('confidence rejects nonfinite, out-of-range, negative-zero and nonnumeric values', () => {
  for (const value of [-0.01, 1.01, '1', true, {}, []]) assert.throws(() => parseEvidenceGraph(changed(x => { x.hypotheses[0].confidence.value = value; })), /confidence/);
  for (const value of ['-0', '1e400']) assert.throws(() => parseEvidenceGraph(fixture.replace('"value": 0.6', `"value": ${value}`)), /confidence/);
  for (const value of [0, 1, null]) assert.equal(report(x => { x.hypotheses[0].confidence.value = value; }).hypotheses[0]!.declaredConfidence.value, value);
});
test('artifact hashes, lengths and equal-digest lengths are checked as declarations only', () => {
  for (const value of ['', 'A'.repeat(64), 'a'.repeat(63), 'x'.repeat(64), null]) assert.throws(() => parseEvidenceGraph(changed(x => { x.recordings[0].artifact.sha256 = value; })), /artifact/);
  for (const value of [-1, 0.1, 1073741825, '4']) assert.throws(() => parseEvidenceGraph(changed(x => { x.recordings[0].artifact.byteLength = value; })), /artifact/);
  assert.throws(() => parseEvidenceGraph(fixture.replace('"byteLength": 4', '"byteLength": -0')), /artifact/);
  assert.throws(() => parseEvidenceGraph(changed(x => { x.recordings[1].artifact.sha256 = x.recordings[0].artifact.sha256; x.recordings[1].artifact.byteLength = 9; })), /Conflicting lengths/);
});
test('declaration enums cannot be promoted to identity, proof or automatic execution claims', () => {
  for (const change of [
    (x: any) => { x.recordings[0].origin = 'verified-device'; },
    (x: any) => { x.hypotheses[0].confidence.source = 'authenticated'; },
    (x: any) => { x.hypotheses[0].evidence[0].relation = 'proves'; },
    (x: any) => { x.hypotheses[0].evidence[0].subset = 'independent-ground-truth'; },
  ]) assert.throws(() => parseEvidenceGraph(changed(change)), /declaration/);
});
test('identifiers and text are bounded, nonempty and free of control characters', () => {
  for (const value of ['', ' bad', 'a/b', 'a'.repeat(81), '__proto__']) assert.throws(() => parseEvidenceGraph(changed(x => { x.devices[0].id = value; })), /ID/);
  for (const value of ['', '  ', '\n', 'label\u0000', 'a'.repeat(257)]) assert.throws(() => parseEvidenceGraph(changed(x => { x.devices[0].label = value; })), /text/);
  assert.doesNotThrow(() => parseEvidenceGraph(changed(x => { x.devices[0].label = '温度センサー'; })));
});
test('required scope lists and total per-node lists are bounded', () => {
  for (const change of [
    (x: any) => { x.experiments[0].deviceIds = []; }, (x: any) => { x.hypotheses[0].deviceIds = []; },
    (x: any) => { x.hypotheses[0].experimentIds = []; },
    (x: any) => { x.experiments[0].deviceIds = Array.from({ length: 33 }, (_, n) => `d${n}`); },
    (x: any) => { x.hypotheses[0].evidence = Array(65).fill(x.hypotheses[0].evidence[0]); },
  ]) assert.throws(() => parseEvidenceGraph(changed(change)), /count/);
});
test('global node and reference budgets reject across separately bounded arrays', () => {
  assert.throws(() => parseEvidenceGraph(changed(x => {
    x.devices = Array.from({ length: 253 }, (_, n) => ({ ...x.devices[0], id: `d${n}` }));
  })), /total node/);
  assert.throws(() => parseEvidenceGraph(changed(x => {
    x.devices = Array.from({ length: 32 }, (_, n) => ({ ...x.devices[0], id: `d${n}` }));
    x.experiments = Array.from({ length: 33 }, (_, n) => ({ ...x.experiments[0], id: `e${n}`, deviceIds: x.devices.map((d: any) => d.id) }));
    x.recordings = []; x.hypotheses = [];
  })), /total reference/);
});
test('exact global node and reference budget boundaries remain usable', () => {
  const devices = Array.from({ length: 256 }, (_, n) => ({ id: `d${n}`, label: `Device ${n}`, scope: 'Synthetic handles only' }));
  assert.equal(parseEvidenceGraph(JSON.stringify({ schemaVersion: 1, devices, experiments: [], recordings: [], hypotheses: [] })).devices.length, 256);
  const selected = devices.slice(0, 32);
  const experiments = Array.from({ length: 32 }, (_, n) => ({ id: `e${n}`, question: 'Synthetic question', method: 'No physical operation', deviceIds: selected.map(d => d.id) }));
  const result = analyzeEvidenceGraph(JSON.stringify({ schemaVersion: 1, devices: selected, experiments, recordings: [], hypotheses: [] }));
  assert.equal(result.edges.length, 1024);
});
test('document character/depth budgets and malformed JSON reject atomically', () => {
  assert.throws(() => parseEvidenceGraph(' '.repeat(MAX_EVIDENCE_GRAPH_CHARACTERS + 1)), /character/);
  assert.throws(() => parseEvidenceGraph('[[[[[[]]]]]]'), /depth/);
  for (const value of ['', fixture + 'false', fixture.slice(0, -3), 'null']) assert.throws(() => parseEvidenceGraph(value));
  assert.throws(() => parseEvidenceGraph(null as any), /character/);
});
test('CLI reproduces report without modifying source and rejects bad UTF-8 and bad arguments', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-evidence-graph-'));
  const path = join(directory, 'graph.json');
  const cli = new URL('../tools/validate-evidence-graph.ts', import.meta.url);
  const run = (...args: string[]) => spawnSync(process.execPath, [cli.pathname, ...args], { encoding: 'utf8', timeout: 10000 });
  try {
    writeFileSync(path, fixture);
    const good = run(path); assert.equal(good.status, 0, good.stderr);
    assert.deepEqual(JSON.parse(good.stdout), analyzeEvidenceGraph(fixture));
    assert.equal(readFileSync(path, 'utf8'), fixture);
    for (const args of [[], [path, path], ['--help'], [directory]]) { const result = run(...args); assert.equal(result.status, 1); assert.equal(result.stdout, ''); }
    writeFileSync(path, Buffer.from([0xff])); assert.equal(run(path).status, 1);
    writeFileSync(path, ' '.repeat(MAX_EVIDENCE_GRAPH_CHARACTERS * 4 + 1)); assert.equal(run(path).status, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('CLI rejects a FIFO without waiting for another process to write', { skip: process.platform === 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'apex-evidence-graph-fifo-'));
  const path = join(directory, 'graph.pipe');
  try {
    assert.equal(spawnSync('mkfifo', [path], { encoding: 'utf8' }).status, 0);
    const result = spawnSync(process.execPath, [new URL('../tools/validate-evidence-graph.ts', import.meta.url).pathname, path], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1, String(result.error)); assert.equal(result.stdout, '');
    assert.match(result.stderr, /regular evidence graph file/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
