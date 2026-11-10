import { parseBoundedJson } from '../packages/core/bounded-json.ts';
import { fields, researchEndpoint, researchJob, researchRequest, researchResult, researchTarget } from '../packages/core/research-jobs.ts';
import type { ResearchJob, ResearchRequest, ResearchResult } from '../packages/core/research-jobs.ts';
import { parseReaElfEvidence } from '../packages/core/rea-inspection.ts';
import type { CaseStore } from '../packages/core/case-store.ts';

type Digest = (bytes: Uint8Array) => Promise<string>;
/** Explicit HTTPS connection. No credentials, polling timers or requests survive disconnect. */
export class ResearchClient {
  readonly endpoint: string;
  private token: string;
  private transport: typeof fetch;
  private digest: Digest;
  private requests = new Set<AbortController>();
  private disconnected = false;
  constructor(endpoint: string, token: string, digest: Digest, transport: typeof fetch = fetch) {
    this.endpoint = researchEndpoint(endpoint);
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new Error('Enter the worker access token');
    this.token = token; this.digest = digest; this.transport = transport;
  }
  disconnect() { this.disconnected = true; this.token = ''; for (const request of this.requests) request.abort(); }
  private async call(path: string, body?: unknown): Promise<string> {
    if (this.disconnected) throw new Error('Research worker disconnected');
    const controller = new AbortController(); this.requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.transport(this.endpoint + path, {
        method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
        redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      });
      if (this.disconnected || controller.signal.aborted) throw new Error('Research request interrupted');
      if (response.redirected || (response.url && new URL(response.url).origin !== this.endpoint) || response.headers.get('content-type') !== 'application/json') throw new Error('Unexpected research response');
      const declared = response.headers.get('content-length');
      if (!declared || !/^[0-9]{1,5}$/.test(declared) || Number(declared) > 65536 || response.headers.get('content-encoding')) throw new Error('Research response exceeds transport limits');
      let document: string;
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const parts: Uint8Array[] = []; let bytes = 0;
        try {
          while (true) {
            const next = await reader.read(); if (next.done) break;
            bytes += next.value.length;
            if (bytes > Number(declared) || bytes > 65536) throw new Error('Research response exceeds transport limits');
            parts.push(next.value);
          }
          if (bytes !== Number(declared)) throw new Error('Incomplete research response');
          const joined = new Uint8Array(bytes); let position = 0;
          for (const part of parts) { joined.set(part, position); position += part.length; }
          document = new TextDecoder('utf-8', { fatal: true }).decode(joined);
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      } else {
        // React Native fetch has no streaming reader. Require explicit bounded framing and check decoded length.
        document = await response.text();
        if (new TextEncoder().encode(document).length !== Number(declared)) throw new Error('Research response length mismatch');
      }
      if (this.disconnected || controller.signal.aborted) throw new Error('Research request interrupted');
      if (!response.ok) {
        const error = fields(parseBoundedJson(document, 65536, 4), ['error']).error;
        throw new Error(typeof error === 'string' && /^[a-z-]{1,64}$/.test(error) ? `Worker: ${error}` : 'Research request failed');
      }
      return document;
    } finally { clearTimeout(timer); controller.abort(); this.requests.delete(controller); }
  }
  async catalogue() {
    const r = fields(parseBoundedJson(await this.call('/v1/catalogue'), 65536, 6), ['targets', 'blocked']);
    if (!Array.isArray(r.targets) || r.targets.length < 1 || r.targets.length > 16 || typeof r.blocked !== 'boolean') throw new Error('Invalid research catalogue');
    const targets = r.targets.map(researchTarget);
    if (new Set(targets.map(t => t.sha256)).size !== targets.length) throw new Error('Duplicate research target');
    return { targets, blocked: r.blocked };
  }
  async jobs() {
    const r = fields(parseBoundedJson(await this.call('/v1/jobs'), 65536, 8), ['jobs']);
    if (!Array.isArray(r.jobs) || r.jobs.length > 100) throw new Error('Research job count limit');
    const jobs = r.jobs.map(researchJob);
    if (new Set(jobs.map(j => j.id)).size !== jobs.length) throw new Error('Duplicate research job');
    return jobs;
  }
  async submit(input: ResearchRequest) {
    const request = researchRequest(input);
    const job = researchJob(parseBoundedJson(await this.call('/v1/jobs', request), 65536, 8));
    if (JSON.stringify(job.request) !== JSON.stringify(request)) throw new Error('Submitted job identity mismatch');
    return job;
  }
  async cancel(job: ResearchJob) {
    const original = researchJob(job);
    const result = researchJob(parseBoundedJson(await this.call(`/v1/jobs/${original.id}/cancel`, {}), 65536, 8));
    if (JSON.stringify(result.request) !== JSON.stringify(original.request)) throw new Error('Cancelled job identity mismatch');
    return result;
  }
  async result(job: ResearchJob): Promise<ResearchResult> {
    researchJob(job);
    const result = researchResult(await this.call(`/v1/jobs/${job.id}/result`), job);
    const bytes = new TextEncoder().encode(result.output);
    if (bytes.length > 32768) throw new Error('Research output exceeds byte limit');
    if (await this.digest(bytes) !== result.outputSha256) throw new Error('Research output digest mismatch');
    if (result.kind === 'elf-notes') {
      parseBoundedJson(result.output, 32768, 24);
      const inspected = parseReaElfEvidence(result.output);
      if (inspected.artifact.sha256 !== result.target.sha256 || inspected.artifact.bytes !== result.target.bytes) throw new Error('Research evidence target mismatch');
    }
    if (this.disconnected) throw new Error('Research worker disconnected');
    return result;
  }
}

/** Saves only an explicitly fetched result. The source item is a descriptor, not original firmware bytes. */
export async function saveResearchCase(store: CaseStore, endpoint: string, result: ResearchResult) {
  const origin = researchEndpoint(endpoint);
  let saved = await store.create(`REA ${result.target.label} / ${result.request.operation}`);
  const source = JSON.stringify({ schema: 'apex.worker-source-reference.v1', endpoint: origin, jobId: result.jobId, target: result.target, request: result.request, originalBytesPresentOnPhone: false });
  saved = (await store.append(saved.id, saved.revision, { kind: 'source', origin: 'operator-import', name: 'Worker target reference (not firmware bytes)', content: source })).case;
  saved = (await store.append(saved.id, saved.revision, { kind: 'analysis', origin: 'derived', name: 'REA worker result', content: JSON.stringify(result), parents: [saved.artifacts[0]!.id] })).case;
  return saved;
}
