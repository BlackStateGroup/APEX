import { parseEvidence } from '../packages/core/evidence.ts';
import type { EvidenceRecord, EvidenceStore } from '../packages/core/evidence.ts';
import { snapshotHciEventEvidencePayload } from '../packages/core/hci-event-evidence.ts';
import { HciDocumentController } from './hci-document-workbench.ts';
import type { HciDocumentState } from './hci-document-workbench.ts';
function frozen<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
export class HciEvidenceReopenController {
 #record: EvidenceRecord; #active = true; #lease = 0; #generation = 0;
 #document: HciDocumentController; #pending = false; #message = 'UNVERIFIED saved HCI document. Explicitly check before opening retained JSON or interpretations.';
 readonly #hash: (bytes: Uint8Array) => Promise<string>;
 constructor(record: EvidenceRecord, hash: (bytes: Uint8Array) => Promise<string>) { this.#record = record; this.#hash = hash; this.#document = new HciDocumentController(true, hash); Object.freeze(this); }
 get lease() { return this.#lease; } get state(): HciDocumentState { return this.#document.state; }
 get pending() { return this.#pending; } get message() { return this.#message; }
 isActive(lease: number) { return this.#active && lease === this.#lease; }
 replace(record: EvidenceRecord) { if (record !== this.#record) { this.deactivate(); this.#record = record; this.activate(); } }
 activate() { if (!this.#active) { this.#active = true; ++this.#lease; this.#document.activate(); } }
 deactivate() { this.#active = false; ++this.#lease; ++this.#generation; this.#pending = false; this.#document = new HciDocumentController(false, this.#hash); this.#message = 'UNVERIFIED saved HCI document. Explicitly check before opening retained JSON or interpretations.'; }
 async reopen(store: Pick<EvidenceStore, 'verify'>, lease: number, observed: HciDocumentState) {
  if (!this.isActive(lease) || observed !== this.state || this.#pending) return;
  const generation = ++this.#generation;
  this.#pending = true; this.#message = 'Checking canonical envelope, binary derivative and legacy structure.';
  const current = () => this.isActive(lease) && generation === this.#generation;
  try {
   if (this.#record.kind !== 'analysis.hci-event') throw new Error('Wrong kind');
   const payload = snapshotHciEventEvidencePayload(this.#record.payload);
   const snapshot = frozen(parseEvidence(JSON.stringify({ ...this.#record, payload })));
   if (!await store.verify(snapshot)) throw new Error('Envelope mismatch');
   // Independently check inner bytes, even if the supplied verifier simply returns true.
   if (!current()) return;
   const document = new HciDocumentController(true, this.#hash);
   document.receive({ id: 1, document: payload.document });
   await document.verify(document.lease, document.state);
   if (!document.state.value) throw new Error('Inner verification failed');
   if (!current()) return;
   this.#document = document;
   this.#message = 'Canonical envelope verified. Binary derivative SHA-256 and whole legacy structure verified independently. Original-source references remain UNVERIFIED.';
  } catch { if (current()) { this.#document = new HciDocumentController(true, this.#hash); this.#message = 'Reopen refused. Envelope, binary digest, size or whole legacy structure could not be verified.'; } }
  finally { if (current()) this.#pending = false; }
 }
 page(page: number, lease: number, observed: HciDocumentState) { if (this.isActive(lease) && observed === this.state && !this.#pending) this.#document.page(page, this.#document.lease, observed); }
}
