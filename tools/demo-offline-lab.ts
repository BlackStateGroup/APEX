/** Offline synthetic walkthrough. Reads repository fixtures; writes only one stdout summary. */
import assert from 'node:assert/strict';
import { inspectIrFile } from '../packages/core/ir-offline.ts';
import { prepareHci, listHciRecords, selectHciLegacyEvent, selectHciExtendedMetadata } from '../packages/core/hci-offline.ts';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BleTrialAuthoring } from '../packages/core/ble-trial-authoring.ts';
import type { BleTrialGroup, BleTrialSource, BleTrialEntry } from '../packages/core/ble-trial-authoring.ts';
import { validateBleFieldHypothesis } from '../packages/core/ble-field-hypothesis.ts';
import { prepareBlePlxSourceEvidenceDocument, readBlePlxSourceEvidencePayload } from '../packages/core/ble-plx-source-evidence.ts';
import { importNdefObservation } from '../packages/core/ndef-offline.ts';
import { prepareNdefEvidenceInput } from '../packages/core/ndef-evidence.ts';
import { EvidenceStore } from '../packages/core/evidence.ts';
import { createEvidenceBundle, readEvidenceBundle } from '../packages/core/evidence-bundle.ts';
import { prepareIq } from '../packages/core/iq-offline.ts';
import { analyzeIq, analyzeIqTimeFrequency } from '../packages/core/iq-analysis.ts';
import { analyzeIqActivity } from '../packages/core/iq-activity.ts';
import { analyzeIqPhaseIncrement } from '../packages/core/iq-phase-increment.ts';
import { inspectFlipperResponses } from '../packages/core/flipper-offline.ts';
import { analyzeIqLagCorrelation } from '../packages/core/iq-lag-correlation.ts';

const origin = 'synthetic-fixture' as const;
// Fixed demonstration timestamp, deliberately not the execution or reception time.
const demonstrationTime = '2026-11-08T00:00:00.000Z';
const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');
const fixture = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

async function main() {
  if (process.argv.length !== 2) throw new Error('Usage: node tools/demo-offline-lab.ts (no arguments)');
  const dataset: { groups: BleTrialGroup[]; sources: BleTrialSource[]; trials: BleTrialEntry[] } =
    JSON.parse(fixture('../tests/fixtures/ble-differential.json'));
  assert.ok(dataset.sources.every(source => source.origin === origin));
  const selectedDocument = dataset.trials[0]!.document;
  const bleInput = prepareBlePlxSourceEvidenceDocument(selectedDocument);
  const ble = readBlePlxSourceEvidencePayload(bleInput.payload);
  assert.equal(bleInput.payload.document, selectedDocument);
  assert.equal(ble.provenance.origin, origin);
  const observation = ble.observation!;
  assert.equal(observation.rawAdvertising!.inputHex, '0716d2fc4002d007');
  const reading = observation.serviceReadings[0]!.reading;
  assert.ok('format' in reading && 'parseStatus' in reading && 'objects' in reading);
  assert.equal(reading.format, 'BTHome-v2');
  assert.equal(reading.parseStatus, 'complete');
  assert.equal(reading.objects[0]!.value, 20);
  assert.equal(observation.physicalReceptionVerified, false);
  assert.equal(observation.authenticatedIdentity, false);

  const author = new BleTrialAuthoring('owned-lab', 'FCD2');
  dataset.groups.forEach(row => author.addGroup(row));
  dataset.sources.forEach(row => author.addSource(row));
  dataset.trials.forEach(row => author.addTrial(row));
  const authored = author.build();
  assert.deepEqual(JSON.parse(authored.document), dataset);
  assert.equal(authored.report.trials.length, 8);
  assert.deepEqual(authored.report.comparisons.map(row => row.changedOffsets), [[2], [2]]);
  const candidateDocument = fixture('../tests/fixtures/ble-field-hypothesis.json');
  // This existing candidate fixture declares the same trials, including subset labels.
  assert.deepEqual(JSON.parse(JSON.parse(candidateDocument).dataset), dataset);
  const candidate = validateBleFieldHypothesis(candidateDocument);
  assert.equal(candidate.results.length, 8);
  assert.ok(candidate.results.every(row => row.withinTolerance));
  assert.deepEqual(candidate.results[0]!.value, { numerator: '20', denominator: '1', approximate: 20 });
  assert.deepEqual(candidate.results[2]!.value, { numerator: '461', denominator: '25', approximate: 18.44 });

  const ndefDocument = fixture('../src/fixtures/ndef-text.json');
  const ndef = importNdefObservation(ndefDocument);
  assert.equal(ndef.provenance.origin, origin);
  assert.equal(ndef.decoded.status, 'parsed');
  const text = ndef.decoded.records[0]!.value;
  assert.ok('text' in text);
  assert.equal(text.text, 'Hi');
  assert.equal(ndef.verification.authenticated, false);

  // The real EvidenceStore API, backed solely by this local array. No journal/database.
  const documents: string[] = [];
  const store = new EvidenceStore({ insert: async (_, document) => { documents.push(document); },
    list: async limit => documents.slice(0, limit) },
  { randomId: () => `synthetic-demo-${documents.length + 1}`, sha256 });
  await store.save({ ...bleInput, observedAt: demonstrationTime });
  await store.save({ ...prepareNdefEvidenceInput(ndefDocument), observedAt: demonstrationTime });
  const records = await store.list();
  assert.equal(records.length, 2);
  assert.ok(records.every(record => record.source === 'offline-fixture'));
  for (const record of records) assert.equal(await store.verify(record), true);
  // Explicit selected-record order, not an automatic export of the entire journal.
  const selection = [documents[1]!, documents[0]!];
  const bundle = await createEvidenceBundle(selection, demonstrationTime, sha256);
  const preview = await readEvidenceBundle(bundle, sha256);
  assert.deepEqual(preview.recordDocuments, selection);
  assert.equal((preview.records[1]!.payload as { document: string }).document, selectedDocument);
  assert.equal((preview.records[0]!.payload as { document: string }).document, ndefDocument);

  const data = new Uint8Array(512 * 4), view = new DataView(data.buffer);
  const cycle = [[16384, 0], [0, 16384], [-16384, 0], [0, -16384]] as const;
  for (let n = 0; n < 512; n++) {
    view.setInt16(n * 4, cycle[n % 4]![0], true);
    view.setInt16(n * 4 + 2, cycle[n % 4]![1], true);
  }
  const metadata = new TextEncoder().encode(JSON.stringify({
    global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024,
      'core:description': 'Synthetic digital tone; not an RF capture' },
    captures: [{ 'core:sample_start': 0, 'core:frequency': 1_000_000 }], annotations: [],
  }));
  const iq = await prepareIq(metadata, data, { schemaVersion: 1, origin, importedAt: demonstrationTime,
    supplierLabel: 'Synthetic in-memory demonstration' },
  { digest: async (algorithm, bytes) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex') });
  const fft = analyzeIq(iq, { fftSize: 256 });
  const tf = analyzeIqTimeFrequency(iq, { fftSize: 256, startSample: 0, hopSamples: 256, frameCount: 2 });
  const activity = analyzeIqActivity(iq, { windowSamples: 256, startSample: 0, hopSamples: 256, frameCount: 2,
    thresholdNumerator: '268435456', thresholdDenominator: '1' });
  const lag = analyzeIqLagCorrelation(iq, { startSample: 0, windowSamples: 256, firstLag: 1, lagStep: 1, lagCount: 4 });
  assert.equal(fft.spectrum!.peakBin!.signedBin, 64);
  assert.equal(fft.spectrum!.peakBin!.amplitude, 0.5);
  assert.deepEqual(tf.frames.map(frame => frame.peakSignedBin), [64, 64]);
  assert.deepEqual(activity.frames.map(frame => frame.sumSquaredCounts), ['68719476736', '68719476736']);
  assert.deepEqual(activity.frames.map(frame => frame.aboveThreshold), [false, false]);
  for (const row of lag.lags) {
    assert.equal(row.normalizedSquaredMagnitude.status, 'available');
    assert.equal(row.normalizedSquaredMagnitude.numerator, row.normalizedSquaredMagnitude.denominator);
  }
  assert.equal(tf.source.context.origin, origin);
  assert.equal(activity.source.context.origin, origin);
  assert.equal(lag.source.context.origin, origin);

  // Explicit pairs, including lag 4's alias of the same quartertone to zero.
  const phase = [1, 2, 4].map(lag => analyzeIqPhaseIncrement(iq,
    { startSample: 0, lag, step: 4, count: 2 }));
  const expectedProducts = [['0', '268435456'], ['-268435456', '0'], ['268435456', '0']];
  const expectedPhases = [Math.PI / 2, Math.PI, 0];
  for (const [index, report] of phase.entries()) {
    assert.equal(report.source.context.origin, origin);
    assert.equal(report.source.context.importedAt, demonstrationTime);
    assert.equal(report.source.metadataSha256, createHash('sha256').update(metadata).digest('hex'));
    assert.equal(report.source.dataSha256, createHash('sha256').update(data).digest('hex'));
    assert.equal(report.source.dataLength, data.length);
    assert.equal(report.source.metadataLength, metadata.length);
    assert.equal(report.aliasSpacingHz, 1024 / report.options.lag);
    assert.deepEqual(report.nominalPrincipalFrequencyIntervalHz,
      { lowerExclusive: -report.aliasSpacingHz / 2, upperInclusive: report.aliasSpacingHz / 2 });
    for (const [pairIndex, pair] of report.pairs.entries()) {
      assert.equal(pair.leftSample, pairIndex * 4);
      assert.equal(pair.rightSample, pairIndex * 4 + report.options.lag);
      assert.deepEqual(pair.complexProduct,
        { real: expectedProducts[index]![0], imaginary: expectedProducts[index]![1] });
      assert.equal(pair.leftEnergy, '268435456');
      assert.equal(pair.rightEnergy, '268435456');
      assert.deepEqual(pair.phaseAndFrequency, { status: 'available', principalPhaseRadians: expectedPhases[index],
        nominalPrincipalFrequencyOffsetHz: index === 2 ? 0 : 256 });
    }
  }

  // Manually authored software fixture, not upstream bytes or a device capture.
  // Three version-only frames: omitted status, explicit zero, and decode-error status.
  // Deliberately omit some scalar fields to distinguish presence from defaults.
  const flipperBytes = Uint8Array.from([5, 0xc2, 2, 2, 8, 1,
    7, 0x10, 0, 0xc2, 2, 2, 0x10, 2, 5, 0x10, 2, 0xc2, 2, 0]);
  const flipper = inspectFlipperResponses(flipperBytes, { provenance: 'synthetic' });
  assert.equal(flipper.provenance, 'synthetic');
  assert.deepEqual(flipper.originalBytes, flipperBytes);
  assert.equal(flipper.tail, undefined);
  assert.equal(flipper.frames.length, 3);
  assert.deepEqual(flipper.frames.map(frame => frame.status), [
    { present: false, effective: 0, observation: 'omitted' },
    { present: true, effective: 0, observation: 'explicit-zero' },
    { present: true, effective: 2, observation: 'nonzero-or-unknown' },
  ]);
  assert.deepEqual(flipper.frames.map(frame => [frame.content.major, frame.content.minor]), [
    [{ present: true, effective: 1 }, { present: false, effective: 0 }],
    [{ present: false, effective: 0 }, { present: true, effective: 2 }],
    [{ present: false, effective: 0 }, { present: false, effective: 0 }],
  ]);
  for (const frame of flipper.frames) {
    assert.equal(frame.content.kind, 'version'); // No identity response or identity-success inference.
    assert.deepEqual(frame.commandId, { present: false, effective: 0 });
    assert.deepEqual(frame.hasNext, { present: false, effective: false });
    assert.ok(frame.diagnostics.some(text => text.includes('does not prove completion')));
  }
  assert.ok(flipper.frames[0]!.diagnostics.some(text => text.includes('not explicitly reported success')));
  assert.ok(flipper.frames[2]!.diagnostics.some(text => text.includes('not successful identity evidence')));

  // Original manually authored fixtures, never device captures or copied upstream logs.
  const irSource = fixture('../tests/fixtures/offline-lab.ir');
  const ir = await inspectIrFile(Buffer.from(irSource, 'ascii'),
    { provenance: origin, sourceLabel: 'Manually authored synthetic IR' }, sha256);
  assert.equal(ir.originalSource, irSource);
  assert.equal(ir.byteCount, Buffer.byteLength(irSource));
  assert.equal(ir.sha256, 'ad4e575f80a6ea6a5fba8b1ae97dba33b76d799a378fae33e5f0710f91d1cfbe');
  assert.equal(ir.context.provenance, origin);
  assert.equal(ir.records.length, 3);
  const [declared, raw, partial] = ir.records;
  assert.ok(declared?.type === 'parsed' && raw?.type === 'raw' && partial?.type === 'raw');
  assert.deepEqual([declared.address, declared.command], [33, 69]);
  assert.equal(declared.interpretation, 'declared-standard-NEC-fields');
  assert.equal(raw.durationsUs.length, 67);
  assert.deepEqual(raw.recognition, { status: 'recognized', decoded: { protocol: 'NEC', address: 33, command: 69, evidence: 'offline' } });
  assert.equal(partial.recognition.status, 'not-recognized');
  assert.ok(ir.records.every(record => record.repeats === 'not-represented'));
  assert.equal(raw.carrierMetadata, 'declared-not-measured');

  const hciHex = fixture('../tests/fixtures/offline-lab-hci.hex');
  // Buffer's hex decoder silently ignores malformed suffixes; reject them first.
  assert.ok(/^(?:[0-9a-fA-F]{2})+(?:\n)?(?![\s\S])/.test(hciHex), 'Exact HCI fixture hex line');
  const hciBytes = Buffer.from(hciHex.endsWith('\n') ? hciHex.slice(0, -1) : hciHex, 'hex');
  const hci = await prepareHci(hciBytes, { provenance: origin, label: 'Manually authored synthetic HCI' },
    async bytes => createHash('sha256').update(bytes).digest('hex'));
  assert.equal(hci.source.sha256, '74bf92435f18f046cda23b068a75212967994bd54eff48c9d6268ad561ccefd7');
  assert.equal(hci.source.byteCount, 187);
  assert.equal(hci.source.provenance, origin);
  const page = listHciRecords(hci);
  assert.equal(hci.recordCount, 3);
  assert.deepEqual(page.records.map(record => record.classification),
    ['command-opaque', 'legacy-advertising-candidate', 'extended-advertising-uninspected']);
  assert.deepEqual(page.records.map(record => record.timestampRaw), ['-10', '-9', '-8']);
  assert.ok(page.records.every(record => record.cumulativeDrops === 0));
  const legacy = selectHciLegacyEvent(hci, 1);
  assert.deepEqual(legacy.reports.map(report => report.kind), ['advertisement', 'scan-response']);
  assert.deepEqual(legacy.reports.map(report => report.dataHex), ['020106', '']);
  assert.deepEqual(legacy.reports.map(report => report.rssiDbm), [-50, -60]);
  assert.ok(legacy.reports.every(report => report.addressDisplay === '01:02:03:04:05:06'));
  const extended = selectHciExtendedMetadata(hci, 2);
  const header = extended.reports[0]!;
  assert.equal(header.dataStatus.raw, 0);
  assert.match(header.dataStatus.meaning!, /last fragment/);
  assert.equal(header.primaryPhy.state, 'feature-context-unknown');
  assert.equal(header.secondaryPhy.state, 'feature-context-unknown');
  assert.equal(header.rssi.value, -127);
  assert.equal(header.txPower.state, 'unavailable');
  assert.equal(header.dataLength, 20);
  for (const report of [page, extended]) {
    const serialized = JSON.stringify(report);
    for (const marker of ['LAB_PRIVATE_OPAQUE', 'LAB_PRIVATE_EXTENDED',
      Buffer.from('LAB_PRIVATE_OPAQUE').toString('hex'), Buffer.from('LAB_PRIVATE_EXTENDED').toString('hex'),
      'dataHex', 'serviceReadings', '"advertising":']) assert.ok(!serialized.includes(marker));
  }

  return { status: 'complete', mode: 'offline-synthetic-lab', demonstrationTime,
    timestampMeaning: 'Fixed synthetic demonstration time, not execution or reception time',
    ble: { origin, exactSelectedDocumentRetained: true, format: reading.format, parseStatus: reading.parseStatus,
      temperatureCelsius: reading.objects[0]!.value, physicalReceptionVerified: false, authenticatedIdentity: false,
      limit: 'Complete public interpretation is not authentication or verified sensor truth.' },
    trials: { origin, count: authored.report.trials.length, sourceCount: candidate.sources.length,
      changedPayloadOffsetsBySource: authored.report.comparisons.map(row => ({ sourceId: row.sourceId, changedOffsets: row.changedOffsets })),
      declaredCandidateMatches: candidate.results.filter(row => row.withinTolerance).length,
      values: [candidate.results[0]!.value, candidate.results[2]!.value],
      limit: 'Declared synthetic discovery/held-out labels do not establish blinding, causation or device identity.' },
    ndef: { origin, status: ndef.decoded.status, text: text.text, authenticated: false,
      limit: 'Inert text only; no tag session, URI opening or actions.' },
    evidence: { origin, storage: 'memory-only', savedRecords: records.length, selectedRecordIds: preview.records.map(row => row.id),
      exactDocumentsRetained: true, verifiedPreview: true, bundleBytes: Buffer.byteLength(bundle),
      limit: 'SHA-256 content digest is not a signature, trusted timestamp or proof of reception.' },
    flipper: { origin, provenance: flipper.provenance,
      fixtureMeaning: 'Manually authored nonprivileged version responses; not upstream bytes or device capture',
      bytesHex: Buffer.from(flipper.originalBytes).toString('hex'),
      sha256: createHash('sha256').update(flipper.originalBytes).digest('hex'),
      frames: flipper.frames.map(frame => ({ commandId: frame.commandId, status: frame.status,
        hasNext: frame.hasNext, kind: frame.content.kind, major: frame.content.major, minor: frame.content.minor })),
      identitySuccessEstablished: false,
      limit: 'Presence and defaults are distinct. Neither omitted nor explicit-zero status proves identity, correlation, completion or Flipper compatibility.' },
    phase: { origin, sourceHashes: { metadataSha256: iq.metadataSha256, dataSha256: iq.dataSha256 },
      hashScope: 'All original metadata and data bytes, not only selected pairs',
      selections: phase.map(report => ({ options: report.options, aliasSpacingHz: report.aliasSpacingHz,
        nominalPrincipalFrequencyIntervalHz: report.nominalPrincipalFrequencyIntervalHz,
        pairs: report.pairs.map(pair => ({ leftSample: pair.leftSample, rightSample: pair.rightSample,
          complexProduct: pair.complexProduct, leftEnergy: pair.leftEnergy, rightEnergy: pair.rightEnergy,
          phaseAndFrequency: pair.phaseAndFrequency })) })),
      limit: 'Exact raw-count products and energies; approximate principal phase in (-pi, pi]. Offsets alias by sample rate / lag. Zero phase at lag 4 is not zero signal; zero-energy endpoints would be unavailable. No unwrapping, carrier, identity or calibrated RF inference.' },
    ir: { origin, sourceSha256: ir.sha256, byteCount: ir.byteCount, exactSourceRetained: true,
      declared: { interpretation: declared.interpretation, address: declared.address, command: declared.command },
      raw: { durationCount: raw.durationsUs.length, timingConvention: raw.timingConvention,
        frequencyHz: raw.frequencyHz, dutyCycleDecimal: raw.dutyCycleDecimal, carrierMetadata: raw.carrierMetadata,
        recognition: raw.recognition }, partialRecognition: partial.recognition, repeats: raw.repeats,
      limit: 'Parsed fields are declarations. Raw recognition is conditional on the entire alternating duration array; no measured carrier, repeats, physical capture, authentication, device identity or compatibility.' },
    hci: { origin, format: hci.format, sourceSha256: hci.source.sha256, byteCount: hci.source.byteCount,
      hashScope: 'Full supplied container; digest equality establishes byte equality only',
      metadata: page.records.map(record => ({ index: record.index, classification: record.classification,
        timestampRaw: record.timestampRaw, cumulativeDrops: record.cumulativeDrops })),
      legacy: { sourceKind: legacy.sourceKind, reports: legacy.reports.map(report => ({ kind: report.kind,
        addressWireHex: report.addressWireHex, addressDisplay: report.addressDisplay,
        rssiRaw: report.rssiRaw, rssiDbm: report.rssiDbm, dataHex: report.dataHex })) },
      extended: { sourceKind: extended.sourceKind, dataStatus: header.dataStatus,
        primaryPhy: header.primaryPhy, secondaryPhy: header.secondaryPhy,
        txPower: header.txPower, rssi: header.rssi, dataLength: header.dataLength },
      limit: 'Offline host/controller bytes, not BLE-PLX or RF samples. Raw timestamps are producer claims; zero drops does not mean no losses. Separate advertisement/scan-response addresses and RSSI do not establish identity; no pooling. Extended data omitted entirely: no AD interpretation or fragment reassembly; terminal complete may be only the final fragment. Feature context unknown; no authentication or device compatibility.' },
    iq: { origin, datatype: 'ci16_le', sampleCount: 512, fftPeakSignedBin: 64, fftPeakAmplitude: 0.5,
      timeFrequencyPeakBins: tf.frames.map(frame => frame.peakSignedBin),
      energySums: activity.frames.map(frame => frame.sumSquaredCounts),
      strictlyAboveEqualThreshold: activity.frames.map(frame => frame.aboveThreshold),
      lagSamples: lag.lags.map(row => row.lagSamples), normalizedSquaredMagnitudes: lag.lags.map(row =>
        Number(row.normalizedSquaredMagnitude.numerator) / Number(row.normalizedSquaredMagnitude.denominator)),
      limit: 'A constant complex tone has unit normalized magnitude at every tested lag; this does not identify a period. No RF calibration, demodulation or protocol identity.' } };
}

try {
  const summary = JSON.stringify(await main());
  assert.ok(Buffer.byteLength(summary + '\n') <= 12288, 'Summary size limit');
  process.stdout.write(summary + '\n'); // Only success output, after every stage passes.
} catch {
  process.stderr.write('Offline synthetic walkthrough failed; no success summary emitted. Check fixtures and invariants.\n');
  process.exitCode = 1;
}
