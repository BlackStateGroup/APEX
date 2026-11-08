/** Dependency-free synthetic integration proof. No native SDK, radio, network or provider calls. */
import { prepareBlePlxObservation } from '../packages/core/ble-plx-observation.ts';
import { prepareBleEvidenceInput, readBleEvidencePayload } from '../packages/core/ble-evidence.ts';

const provenance = { origin: 'synthetic-fixture' as const, label: 'SDK-shaped synthetic BTHome battery fixture; no reception', capturedAt: null };
const fixtures = [
  { platform: 'android' as const, device: { id: 'AA:BB:CC:DD:EE:FF', rssi: -55,
    rawScanRecord: 'AgEGBhbS/EABZA==', serviceData: null, localName: null } },
  { platform: 'ios' as const, device: { id: '12345678-1111-2222-3333-444444444444', rssi: -55,
    rawScanRecord: 'e30=', serviceData: { '0000FCD2-0000-1000-8000-00805F9B34FB': 'QAFk' },
    serviceUUIDs: ['FCD2'], localName: null, manufacturerData: null, txPowerLevel: null, isConnectable: false,
    solicitedServiceUUIDs: null, overflowServiceUUIDs: null } },
];
console.log('SYNTHETIC ONLY: no scan, reception verification, evidence save, model call or export.');
for (const { platform, device } of fixtures) {
  const result = prepareBlePlxObservation(platform, device, provenance);
  if (!result.document) throw new Error('Synthetic demo unexpectedly lacks an offline document');
  const evidenceInput = prepareBleEvidenceInput(result.document);
  const replay = readBleEvidencePayload(evidenceInput.payload);
  console.log(JSON.stringify({ platform, representation: result.representation, provenance: result.provenance,
    captureCompleteness: replay.captureCompleteness, physicalReceptionVerified: replay.physicalReceptionVerified,
    authenticatedIdentity: replay.authenticatedIdentity, serviceReadings: replay.serviceReadings,
    preparedEvidenceSource: evidenceInput.source, retentionWarning: result.retentionWarning,
    note: 'iOS rawScanRecord is opaque synthetic JSON base64, not AD bytes; selected snapshot is not saved by this demo.',
  }, null, 2));
}
