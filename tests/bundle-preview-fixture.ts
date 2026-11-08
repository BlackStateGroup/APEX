import { createHash } from 'node:crypto';
import { EvidenceStore } from '../packages/core/evidence.ts';
import { createEvidenceBundle } from '../packages/core/evidence-bundle.ts';
export const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');
export async function bundleFixture(count = 9, observedAt = '2026-11-08T01:02:03.000Z') {
  const documents: string[] = [];
  const time = '2026-11-08T01:02:03.000Z';
  const store = new EvidenceStore({ insert: async (_, text) => { documents.push('\n' + text + '\t'); }, list: async () => documents }, { randomId: () => `record-${documents.length}`, sha256 });
  for (let i = 0; i < count; i++) await store.save({ kind: 'analysis.can', source: 'offline-import', observedAt, payload: { url: 'https://example.invalid/<script>', note: 'not displayed' } });
  return { documents, bundle: await createEvidenceBundle(documents, time, sha256) };
}
