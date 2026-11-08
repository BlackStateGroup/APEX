import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BleTrialAuthoring } from '../packages/core/ble-trial-authoring.ts';
import { MAX_DIFFERENTIAL_CHARACTERS } from '../packages/core/ble-differential.ts';
import { prepareBlePlxSourceEvidenceInput } from '../packages/core/ble-plx-source-evidence.ts';
// Named synthetic cross-platform fixture, never a claim of live reception.
const synthetic = JSON.parse(readFileSync(new URL('./fixtures/ble-differential.json', import.meta.url), 'utf8'));
function draft() {
  const result = new BleTrialAuthoring('owned-lab', 'FCD2');
  synthetic.groups.forEach((row: any) => result.addGroup(row));
  synthetic.sources.forEach((row: any) => result.addSource(row));
  synthetic.trials.forEach((row: any) => result.addTrial(row));
  return result;
}
function unchanged(author: BleTrialAuthoring, action: () => void) {
  const before = author.snapshot(); assert.throws(action); assert.deepEqual(author.snapshot(), before);
}

test('synthetic exact roundtrip and isolated snapshots, caller inputs and reports', () => {
  const author = draft();
  assert.deepEqual(JSON.parse(author.build().document), synthetic);
  const trial = { ...synthetic.trials[0], document: `\n ${synthetic.trials[0].document}\t` };
  author.replaceTrial(trial);
  const exact = trial.document; trial.document = 'mutated';
  const snap = author.snapshot(); snap.trials[0]!.document = 'mutated'; snap.groups.length = 0;
  const built = author.build(); built.report.trials[0]!.document = 'mutated';
  assert.equal(author.snapshot().trials[0]!.document, exact);
  assert.equal(JSON.parse(author.build().document).trials[0].document, exact);
  assert.deepEqual(author.build(), author.build());
});

test('incomplete drafts may be rendered but not built; references and declarations stay strict', () => {
  assert.throws(() => new BleTrialAuthoring('public' as any, 'FCD2'));
  assert.throws(() => new BleTrialAuthoring('owned-lab', 'FFFF' as any));
  const author = new BleTrialAuthoring('owned-lab', 'FCD2');
  assert.throws(() => author.build());
  unchanged(author, () => author.addTrial(synthetic.trials[0]));
  author.addGroup(synthetic.groups[0]); author.addSource(synthetic.sources[0]);
  author.addTrial(synthetic.trials[0]); assert.throws(() => author.build());
  author.addGroup(synthetic.groups[1]); assert.throws(() => author.build());
  author.addTrial(synthetic.trials[2]); assert.equal(author.build().report.trials.length, 2);
});

test('duplicates, source mismatches, invalid replacements and referenced removal are atomic', () => {
  const author = draft();
  for (const kind of ['groups', 'sources', 'trials'] as const) {
    const row = synthetic[kind][0];
    const add = kind === 'groups' ? () => author.addGroup(row) : kind === 'sources' ? () => author.addSource(row) : () => author.addTrial(row);
    unchanged(author, add);
    unchanged(author, () => author.remove(kind, 'unknown'));
  }
  unchanged(author, () => author.addTrial({ ...synthetic.trials[0], id: 'unique' }));
  unchanged(author, () => author.replaceTrial({ ...synthetic.trials[0], receiptId: synthetic.trials[1].receiptId }));
  for (const change of [{ platform: 'ios' }, { snapshotId: null }, { origin: 'recorded-import' }]) {
    unchanged(author, () => author.replaceSource({ ...synthetic.sources[0], ...change }));
  }
  unchanged(author, () => author.remove('groups', synthetic.groups[0].id));
  unchanged(author, () => author.remove('sources', synthetic.sources[0].id));
  unchanged(author, () => author.replaceGroup({ id: 'missing', condition: 'Synthetic' }));
  const source = { ...synthetic.sources[0], id: 'separate-alias' }; author.addSource(source);
  assert.throws(() => author.build()); // Never merges identical declared sources.
  author.remove('sources', 'separate-alias');
  for (const row of synthetic.trials.filter((row: any) => row.sourceId === synthetic.sources[0].id)) author.remove('trials', row.id);
  author.remove('sources', synthetic.sources[0].id); assert.equal(author.build().report.sources.length, 1);
});

test('untrusted direct objects reject accessors, extra keys and serialization hooks without executing them', () => {
  const author = draft(); let calls = 0;
  for (const value of [
    { id: 'new', get condition() { calls++; return 'Synthetic'; } },
    { id: 'new', condition: 'Synthetic', toJSON() { calls++; return {}; } },
    { id: 'new', condition: undefined }, { id: 'new', condition: 'Synthetic', extra: 1 },
  ]) unchanged(author, () => author.addGroup(value as any));
  assert.equal(calls, 0);
});

test('missing, undefined and explicit null selected-source fields survive byte-for-byte', () => {
  const author = new BleTrialAuthoring('owned-lab', 'FEAA');
  author.addGroup({ id: 'a', condition: 'Synthetic baseline' });
  author.addGroup({ id: 'b', condition: 'Synthetic variation' });
  author.addSource({ id: 'ios', platform: 'ios', snapshotId: null, origin: 'synthetic-fixture' });
  const documents = [{}, { name: null, rssi: undefined }].map(fields => prepareBlePlxSourceEvidenceInput('ios', {
    ...fields, serviceData: { FEAA: '/w==' }, rawScanRecord: 'b3BhcXVl',
  }, { origin: 'synthetic-fixture', label: 'Synthetic missing/null case', capturedAt: null }).payload.document);
  documents.forEach((document, i) => author.addTrial({ id: `t${i}`, receiptId: `operator-reference-${i}`, sourceId: 'ios', groupId: i ? 'b' : 'a', document }));
  assert.deepEqual(author.build().report.trials.map(row => row.document), documents);
  assert.ok(author.build().report.trials.every(row => row.payloadHex === 'ff'));
});

test('encrypted unknown headers stay opaque; unknown objects stay bytes; malformed documents and AD fail closed', () => {
  const author = draft();
  for (const payload of ['ffabcd', '40ffff']) {
    for (const trial of author.snapshot().trials) {
      const platform = trial.sourceId as 'android' | 'ios';
      const raw = Buffer.from(`0616d2fc${payload}`, 'hex').toString('base64');
      const document = prepareBlePlxSourceEvidenceInput(platform, { id: platform, rawScanRecord: raw, serviceData: { FCD2: Buffer.from(payload, 'hex').toString('base64') } }, { origin: 'synthetic-fixture', label: 'Synthetic opaque payload', capturedAt: null }).payload.document;
      author.replaceTrial({ ...trial, document });
    }
    assert.ok(author.build().report.trials.every(row => row.interpretation === (payload.startsWith('ff') ? 'opaque-encrypted-bthome' : 'byte-comparison-only')));
  }
  for (const document of ['{}', '{', synthetic.trials[0].document.replace('"sdk":', '"sdk":"duplicate","sdk":')]) {
    unchanged(author, () => author.replaceTrial({ ...synthetic.trials[0], document }));
  }
  const malformed = JSON.parse(synthetic.trials[0].document); malformed.snapshot.rawScanRecord = '/xbS/E A='.replace(' ', '');
  unchanged(author, () => author.replaceTrial({ ...synthetic.trials[0], document: JSON.stringify(malformed) }));
  unchanged(author, () => author.replaceTrial({ ...synthetic.trials[0], document: synthetic.trials[0].document.padEnd(4097) }));
});

test('exact 8 groups, 8 sources and 32 trials are bounded; overflow does not modify draft', () => {
  const author = draft();
  for (let i = 2; i < 8; i++) {
    author.addGroup({ id: `g${i}`, condition: 'Synthetic' });
    author.addSource({ ...synthetic.sources[0], id: `s${i}` });
  }
  unchanged(author, () => author.addGroup({ id: 'overflow', condition: 'Synthetic' }));
  unchanged(author, () => author.addSource({ ...synthetic.sources[0], id: 'overflow' }));
  for (let i = 8; i < 32; i++) author.addTrial({ ...synthetic.trials[i % 8], id: `t${i}`, receiptId: `r${i}` });
  unchanged(author, () => author.addTrial({ ...synthetic.trials[0], id: 'overflow', receiptId: 'overflow' }));
  assert.equal(author.snapshot().trials.length, 32);
  assert.throws(() => author.build()); // Eight-by-eight coverage cannot fit in 32 trials.
});

test('serialized draft at exactly 196608 characters builds; one additional character rejects atomically', () => {
  const author = draft();
  for (let i = 8; i < 32; i++) author.addTrial({ ...synthetic.trials[i % 8], id: `t${i}`, receiptId: `r${i}` });
  for (const trial of author.snapshot().trials) author.replaceTrial({ ...trial, document: trial.document.padEnd(4096, ' ') });
  let remaining = MAX_DIFFERENTIAL_CHARACTERS - JSON.stringify(author.snapshot()).length;
  for (const trial of author.snapshot().trials) {
    const padding = trial.document.length - trial.document.trimEnd().length;
    const take = Math.min(remaining, padding);
    author.replaceTrial({ ...trial, document: trial.document.slice(0, -take || undefined) + '\t'.repeat(take) });
    remaining -= take; if (!remaining) break;
  }
  assert.equal(remaining, 0);
  assert.equal(author.build().document.length, MAX_DIFFERENTIAL_CHARACTERS);
  const trial = author.snapshot().trials.find(row => row.document.endsWith(' '))!;
  unchanged(author, () => author.replaceTrial({ ...trial, document: trial.document.slice(0, -1) + '\t' }));
});

test('complete coverage builds at individual group/source maxima without pooling aliases', () => {
  for (const [groupCount, sourceCount] of [[8, 1], [2, 8]]) {
    const author = new BleTrialAuthoring('owned-lab', 'FCD2');
    for (let g = 0; g < groupCount!; g++) author.addGroup({ id: `g${g}`, condition: 'Synthetic condition' });
    for (let s = 0; s < sourceCount!; s++) {
      author.addSource({ ...synthetic.sources[0], id: `s${s}` });
      for (let g = 0; g < groupCount!; g++) author.addTrial({ ...synthetic.trials[0], id: `t${s}-${g}`, receiptId: `r${s}-${g}`, sourceId: `s${s}`, groupId: `g${g}` });
    }
    assert.equal(author.build().report.comparisons.length, sourceCount);
    assert.equal(author.build().report.groups.length, groupCount);
  }
});

test('selected-service mismatch refuses the whole addition', () => {
  const author = new BleTrialAuthoring('owned-lab', 'FEAA');
  author.addGroup(synthetic.groups[0]); author.addSource(synthetic.sources[0]);
  unchanged(author, () => author.addTrial(synthetic.trials[0]));
});
