import { EvidenceStore } from '../../packages/core/evidence.ts';

const key = 'apex-evidence-v1';
function documents(): string[] {
  const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
  if (!Array.isArray(value) || value.length > 500 || value.some(x => typeof x !== 'string')) throw new Error('Local evidence data needs recovery; existing data was retained');
  return value as string[];
}
export const evidenceStore = new EvidenceStore({
  async insert(_id, document) {
    const existing = documents();
    if (existing.length >= 500) throw new Error('Web evidence capacity reached; existing records were retained');
    // setItem is atomic: a storage error leaves the previous data intact.
    localStorage.setItem(key, JSON.stringify([document, ...existing]));
  },
  async list(limit) { return documents().slice(0, limit); },
}, {
  randomId: () => crypto.randomUUID(),
  async sha256(text) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join(''); },
});
