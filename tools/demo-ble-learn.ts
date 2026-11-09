import { createHash } from 'node:crypto';
import { fitBleLearn, selectBleLearnQuery, validateBleLearn, decodeBleLearnArtifact, LEARN_VERSION, LEARN_LIMITATIONS } from '../packages/core/ble-learn.ts';
import { INITIAL_ROWS, QUERY_ROWS, HELD_OUT_ROWS, fixtureDocument, fixturePool, fixtureSample } from './ble-learn-fixture.ts';

if (process.argv.length !== 2) throw new Error('Usage: node tools/demo-ble-learn.ts > learn-report.json');
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const discoveryDocument = fixtureDocument(INITIAL_ROWS);
const poolDocument = fixturePool();
const initial = fitBleLearn(discoveryDocument);
const query = selectBleLearnQuery(discoveryDocument, poolDocument);
if (!query.selected) throw new Error('Fixture did not select a query');
// Label is revealed only AFTER the algorithm selects an unlabeled query.
const measured = QUERY_ROWS.find(row => row.id === query.selected!.id)!;
const refinedDocument = fixtureDocument([...INITIAL_ROWS, measured]);
const heldOutDocument = fixtureDocument(HELD_OUT_ROWS, 'held-out');
const validation = validateBleLearn(refinedDocument, heldOutDocument);
if (!validation.artifactDocument) throw new Error('Fixture did not pass held-out validation');
const sampleDocument = fixtureSample();
const reused = decodeBleLearnArtifact(validation.artifactDocument, sampleDocument);
// Literal baseline: first discovery-consistent candidate is unsigned LE / 100.
// Independent native Buffer reads, not the learner's arithmetic, score its holdout.
const naiveMatches = HELD_OUT_ROWS.filter(row => {
  const bytes = Buffer.alloc(2); bytes.writeInt16LE(row.temperatureCenti);
  return bytes.readUInt16LE() === row.temperatureCenti;
}).length;
const inputs = { discoveryDocument, poolDocument, refinedDocument, heldOutDocument, sampleDocument };
const report = { version: LEARN_VERSION, evidenceKind: 'deterministic-synthetic-only',
  fixtureRevision: 'confounded-temperature-humidity-v1',
  comparison: { naiveFirstMatch: { candidateId: initial.surviving[0]!.id, heldOutMatches: naiveMatches, heldOutCount: HELD_OUT_ROWS.length },
    activeQuery: { additionalReferenceMeasurements: 1, initialCandidates: initial.surviving.length,
      finalCandidates: validation.fit.surviving.length, heldOutMatches: validation.heldOut!.matches, heldOutCount: validation.heldOut!.count },
    caveat: 'One designed synthetic case, not a real-world accuracy estimate or blinded independent benchmark.' },
  initial, query, validation, reused, inputs,
  digests: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, sha256(value)])),
  artifactSha256: sha256(validation.artifactDocument), limitations: LEARN_LIMITATIONS };
console.log(JSON.stringify({ ...report, reportContentSha256: sha256(JSON.stringify(report)) }, null, 2));
