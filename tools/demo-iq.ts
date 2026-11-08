/** Synthetic digital samples only. This demo does not access receiver hardware. */
import { createHash } from 'node:crypto';
import { prepareIq } from '../packages/core/iq-offline.ts';
import { analyzeIq } from '../packages/core/iq-analysis.ts';
const data = new Uint8Array(1024);
const view = new DataView(data.buffer);
const cycle = [[16384, 0], [0, 16384], [-16384, 0], [0, -16384]];
for (let n = 0; n < 256; n++) {
  view.setInt16(n * 4, cycle[n % 4]![0]!, true);
  view.setInt16(n * 4 + 2, cycle[n % 4]![1]!, true);
}
const metadata = new TextEncoder().encode(JSON.stringify({
  global: { 'core:datatype': 'ci16_le', 'core:version': '1.2.6', 'core:sample_rate': 1024, 'core:description': 'Synthetic positive complex tone, not an RF capture' },
  captures: [{ 'core:sample_start': 0, 'core:frequency': 1_000_000 }], annotations: [],
}));
const recording = await prepareIq(metadata, data, {
  schemaVersion: 1, origin: 'synthetic-fixture', importedAt: new Date().toISOString(), supplierLabel: 'APEX synthetic analytical fixture',
}, { digest: async (algorithm, bytes) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex') });
const analysis = analyzeIq(recording, { fftSize: 256 });
console.log(JSON.stringify({ ...recording, analysis }, null, 2));
