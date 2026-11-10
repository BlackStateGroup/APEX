import { parseBoundedJson } from './bounded-json.ts';

export const CASE_LIMIT = 1_048_576;
export const SOURCE_LIMIT = 65_536;
export type ArtifactKind = 'source' | 'analysis' | 'profile' | 'report';
export type ArtifactOrigin = 'synthetic' | 'operator-import' | 'device-reported' | 'derived';
export interface CaseArtifact {
  id: string; name: string; kind: ArtifactKind; origin: ArtifactOrigin;
  content: string; contentSha256: string; parents: string[];
}
export interface CaseDocument {
  schema: 'apex.case.v1'; id: string; revision: number; title: string;
  createdAt: string; updatedAt: string; artifacts: CaseArtifact[]; sha256: string;
}
export interface CaseBackend {
  read(id: string): Promise<string | null>;
  list(): Promise<string[]>;
  /** Atomic create (expected=null) or compare-and-swap. False means conflict. */
  put(id: string, expected: number | null, revision: number, document: string): Promise<boolean>;
  remove(id: string, expected: number): Promise<boolean>;
}
export interface CaseCrypto { sha256(text: string): Promise<string>; randomId(): string }
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const controls = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
function label(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || controls.test(value)) throw new Error('Invalid case label');
  return value;
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Invalid case fields');
  return value as Record<string, unknown>;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid case timestamp');
  return value;
}
function artifact(value: unknown, previous: Set<string>): CaseArtifact {
  const a = record(value, ['id', 'name', 'kind', 'origin', 'content', 'contentSha256', 'parents']);
  if (typeof a.id !== 'string' || !hashPattern.test(a.id) || typeof a.contentSha256 !== 'string' || !hashPattern.test(a.contentSha256)) throw new Error('Invalid artifact digest');
  if (!['source', 'analysis', 'profile', 'report'].includes(String(a.kind)) || !['synthetic', 'operator-import', 'device-reported', 'derived'].includes(String(a.origin))) throw new Error('Invalid artifact type');
  if (typeof a.content !== 'string' || a.content.length > SOURCE_LIMIT || !a.content.length) throw new Error('Source must contain 1 to 65536 characters');
  if (!Array.isArray(a.parents) || a.parents.length > 16 || a.parents.some(p => typeof p !== 'string' || !previous.has(p)) || new Set(a.parents).size !== a.parents.length) throw new Error('Missing, duplicate or forward artifact parent');
  if (a.origin === 'derived' ? a.kind === 'source' || !a.parents.length : a.parents.length > 0 || a.kind === 'analysis' || a.kind === 'profile') throw new Error('Derived results need retained source parents');
  return { id: a.id, name: label(a.name, 120), kind: a.kind as ArtifactKind, origin: a.origin as ArtifactOrigin, content: a.content, contentSha256: a.contentSha256, parents: [...a.parents] };
}
function base(c: CaseDocument) {
  return { schema: c.schema, id: c.id, revision: c.revision, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, artifacts: c.artifacts };
}
function identity(a: Omit<CaseArtifact, 'id'>) {
  return JSON.stringify({ kind: a.kind, origin: a.origin, contentSha256: a.contentSha256, parents: a.parents });
}
export function parseCase(document: string): CaseDocument {
  const c = record(parseBoundedJson(document, CASE_LIMIT, 8), ['schema', 'id', 'revision', 'title', 'createdAt', 'updatedAt', 'artifacts', 'sha256']);
  if (c.schema !== 'apex.case.v1' || typeof c.id !== 'string' || !idPattern.test(c.id) || !Number.isSafeInteger(c.revision) || (c.revision as number) < 1 || !Array.isArray(c.artifacts) || c.artifacts.length > 64 || typeof c.sha256 !== 'string' || !hashPattern.test(c.sha256)) throw new Error('Unsupported or invalid case envelope');
  const previous = new Set<string>();
  const artifacts = c.artifacts.map(value => {
    const a = artifact(value, previous);
    if (previous.has(a.id)) throw new Error('Duplicate artifact');
    previous.add(a.id); return a;
  });
  const createdAt = date(c.createdAt), updatedAt = date(c.updatedAt);
  if (updatedAt < createdAt) throw new Error('Case update predates creation');
  return { schema: c.schema, id: c.id, revision: c.revision as number, title: label(c.title, 120), createdAt, updatedAt, artifacts, sha256: c.sha256 };
}
export class CaseConflict extends Error { constructor() { super('Case changed in another view. Reload before saving; your input has been retained.'); } }

/** Local case integrity, not identity attestation or encrypted storage. */
export class CaseStore {
  private backend: CaseBackend;
  private crypto: CaseCrypto;
  private now: () => string;
  constructor(backend: CaseBackend, crypto: CaseCrypto, now = () => new Date().toISOString()) { this.backend = backend; this.crypto = crypto; this.now = now; }
  private async digest(text: string) {
    const digest = await this.crypto.sha256(text);
    if (!hashPattern.test(digest)) throw new Error('Invalid SHA-256 implementation');
    return digest;
  }
  async verify(document: string): Promise<CaseDocument> {
    const c = parseCase(document);
    for (const a of c.artifacts) {
      if (await this.digest(a.content) !== a.contentSha256 || await this.digest(identity(a)) !== a.id) throw new Error('Case source digest mismatch');
    }
    if (await this.digest(JSON.stringify(base(c))) !== c.sha256) throw new Error('Case digest mismatch');
    return c;
  }
  private async seal(c: CaseDocument) {
    c.sha256 = await this.digest(JSON.stringify(base(c)));
    return parseCase(JSON.stringify(c));
  }
  async create(title: string) {
    title = label(title, 120);
    const at = date(this.now());
    const c = await this.seal({ schema: 'apex.case.v1', id: this.crypto.randomId(), revision: 1, title, createdAt: at, updatedAt: at, artifacts: [], sha256: '0'.repeat(64) });
    if (!await this.backend.put(c.id, null, c.revision, JSON.stringify(c))) throw new CaseConflict();
    return c;
  }
  async open(id: string) {
    if (!idPattern.test(id)) throw new Error('Invalid case identifier');
    const document = await this.backend.read(id);
    if (document === null) throw new Error('Case not found');
    const c = await this.verify(document);
    if (c.id !== id) throw new Error('Case storage identifier mismatch');
    return c;
  }
  async list(): Promise<{ cases: CaseDocument[]; rejected: number }> {
    const documents = await this.backend.list();
    if (documents.length > 100) throw new Error('Case list exceeds limit');
    const cases: CaseDocument[] = []; let rejected = 0;
    for (const document of documents) {
      try { cases.push(await this.verify(document)); } catch { rejected++; }
    }
    return { cases: cases.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), rejected };
  }
  async append(id: string, revision: number, input: { name: string; kind: ArtifactKind; origin: ArtifactOrigin; content: string; parents?: string[] }) {
    // Snapshot mutable caller input before the first await.
    const raw = { name: input.name, kind: input.kind, origin: input.origin, content: input.content, parents: [...(input.parents ?? [])] };
    if (typeof raw.content !== 'string' || raw.content.length > SOURCE_LIMIT || !raw.content.length) throw new Error('Source must contain 1 to 65536 characters');
    const c = await this.open(id);
    if (c.revision !== revision) throw new CaseConflict();
    const candidate = { ...raw, contentSha256: await this.digest(raw.content) };
    const a = artifact({ ...candidate, id: await this.digest(identity(candidate)) }, new Set(c.artifacts.map(value => value.id)));
    if (c.artifacts.some(value => value.id === a.id)) return { case: c, duplicate: true };
    const next = await this.seal({ ...c, revision: c.revision + 1, updatedAt: [c.updatedAt, date(this.now())].sort()[1]!, artifacts: [...c.artifacts, a] });
    if (!await this.backend.put(id, revision, next.revision, JSON.stringify(next))) throw new CaseConflict();
    return { case: next, duplicate: false };
  }
  async export(id: string) { return JSON.stringify(await this.open(id)); }
  async restore(document: string) {
    const c = await this.verify(document);
    const existing = await this.backend.read(c.id);
    if (existing !== null) {
      if ((await this.verify(existing)).sha256 === c.sha256) return { case: c, duplicate: true };
      throw new Error('A different revision of this case already exists. Restore cannot overwrite it.');
    }
    if (!await this.backend.put(c.id, null, c.revision, JSON.stringify(c))) throw new CaseConflict();
    return { case: c, duplicate: false };
  }
  async remove(id: string, revision: number) {
    const c = await this.open(id);
    if (c.revision !== revision || !await this.backend.remove(id, revision)) throw new CaseConflict();
  }
}
