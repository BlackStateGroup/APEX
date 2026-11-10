import { parseBoundedJson } from './bounded-json.ts';

export const RESEARCH_FUNCTIONS = ['apex_crc16', 'apex_encode', 'apex_stream_init', 'apex_stream_feed', 'apex_device_init', 'apex_device_feed'] as const;
export const JOB_STATES = ['queued', 'running', 'cancelling', 'succeeded', 'failed', 'cancelled', 'interrupted', 'cleanup-unknown'] as const;
export type JobState = typeof JOB_STATES[number];
export interface ResearchTarget { sha256: string; bytes: number; label: string }
export interface ResearchRequest { requestId: string; targetSha256: string; operation: 'elf-notes' | 'ghidra-function'; symbol: string | null }
export interface ResearchJob { id: string; request: ResearchRequest; state: JobState; createdAt: string; updatedAt: string; error: string | null }
export interface ResearchResult {
  schema: 'apex.research-result.v1'; jobId: string; request: ResearchRequest; target: ResearchTarget;
  reaVersion: '6.8.0'; provider: 'rea-elf-notes/1' | 'ghidra/12.1.4';
  kind: 'elf-notes' | 'pseudocode'; output: string; outputSha256: string; targetExecuted: false;
}
export function fields(value: unknown, names: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== names.length || names.some(n => !Object.hasOwn(value, n))) throw new Error('Invalid research response fields');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid research metadata');
  return value;
}
function hash(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid research digest'); return value; }
function id(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) throw new Error('Invalid research job identifier'); return value; }
function date(value: unknown): string { const t = text(value, 40); if (!Number.isFinite(Date.parse(t)) || new Date(t).toISOString() !== t) throw new Error('Invalid research timestamp'); return t; }
export function researchTarget(value: unknown): ResearchTarget {
  const r = fields(value, ['sha256', 'bytes', 'label']);
  if (!Number.isSafeInteger(r.bytes) || Number(r.bytes) < 16 || Number(r.bytes) > 4_194_304) throw new Error('Invalid research target size');
  return { sha256: hash(r.sha256), bytes: Number(r.bytes), label: text(r.label, 80) };
}
export function researchRequest(value: unknown): ResearchRequest {
  const r = fields(value, ['requestId', 'targetSha256', 'operation', 'symbol']);
  if (r.operation !== 'elf-notes' && r.operation !== 'ghidra-function') throw new Error('Unsupported research operation');
  if (r.operation === 'elf-notes' ? r.symbol !== null : !RESEARCH_FUNCTIONS.includes(r.symbol as typeof RESEARCH_FUNCTIONS[number])) throw new Error('Unsupported research function');
  return { requestId: id(r.requestId), targetSha256: hash(r.targetSha256), operation: r.operation, symbol: r.symbol as string | null };
}
export function researchJob(value: unknown): ResearchJob {
  const r = fields(value, ['id', 'request', 'state', 'createdAt', 'updatedAt', 'error']);
  const request = researchRequest(r.request);
  if (id(r.id) !== request.requestId || !JOB_STATES.includes(r.state as JobState)) throw new Error('Research job identity/state mismatch');
  const createdAt = date(r.createdAt), updatedAt = date(r.updatedAt);
  if (updatedAt < createdAt) throw new Error('Research timestamp order');
  if (r.error !== null && (typeof r.error !== 'string' || !/^[a-z-]{1,64}$/.test(r.error))) throw new Error('Invalid research failure code');
  return { id: request.requestId, request, state: r.state as JobState, createdAt, updatedAt, error: r.error as string | null };
}
export function researchResult(document: string, job: ResearchJob): ResearchResult {
  const r = fields(parseBoundedJson(document, 65_536, 12), ['schema', 'jobId', 'request', 'target', 'reaVersion', 'provider', 'kind', 'output', 'outputSha256', 'targetExecuted']);
  const request = researchRequest(r.request), target = researchTarget(r.target);
  if (r.schema !== 'apex.research-result.v1' || job.state !== 'succeeded' || id(r.jobId) !== job.id || JSON.stringify(request) !== JSON.stringify(job.request) || target.sha256 !== request.targetSha256 || r.reaVersion !== '6.8.0' || r.targetExecuted !== false) throw new Error('Research result does not match the selected job');
  if (request.operation === 'elf-notes' ? r.provider !== 'rea-elf-notes/1' || r.kind !== 'elf-notes' : r.provider !== 'ghidra/12.1.4' || r.kind !== 'pseudocode') throw new Error('Research provider mismatch');
  if (typeof r.output !== 'string' || !r.output.trim() || r.output.length > 32_768) throw new Error('Research output exceeds limit');
  return { schema: r.schema, jobId: job.id, request, target, reaVersion: '6.8.0', provider: r.provider as ResearchResult['provider'], kind: r.kind as ResearchResult['kind'], output: r.output, outputSha256: hash(r.outputSha256), targetExecuted: false };
}
export function researchEndpoint(input: string): string {
  const u = new URL(input);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/' || !u.hostname) throw new Error('Use an HTTPS worker origin without credentials, paths or query parameters');
  return u.origin;
}
