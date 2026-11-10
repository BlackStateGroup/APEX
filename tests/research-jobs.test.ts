import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ResearchClient, saveResearchCase } from '../src/research-client.ts';
import { researchEndpoint, researchJob, researchRequest, researchResult } from '../packages/core/research-jobs.ts';
import type { ResearchJob, ResearchResult } from '../packages/core/research-jobs.ts';
import { CaseStore } from '../packages/core/case-store.ts';
const digest = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const request = { requestId: randomUUID(), targetSha256: 'a'.repeat(64), operation: 'ghidra-function' as const, symbol: 'apex_crc16' };
const job: ResearchJob = { id: request.requestId, request, state: 'succeeded', createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:01.000Z', error: null };
const result: ResearchResult = { schema: 'apex.research-result.v1', jobId: job.id, request, target: { sha256: request.targetSha256, bytes: 128, label: 'owned.elf' }, reaVersion: '6.8.0', provider: 'ghidra/12.1.4', kind: 'pseudocode', output: 'synthetic CRC pseudocode', outputSha256: sha('synthetic CRC pseudocode'), targetExecuted: false };
function response(value: unknown, status = 200) { const body = JSON.stringify(value); return new Response(body, { status, headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } }); }
const client = (fetcher: typeof fetch) => new ResearchClient('https://worker.example', 'x'.repeat(43), digest, fetcher);
test('research contract rejects arbitrary operations, ambiguous fields and insecure endpoints', () => {
  for (const endpoint of ['http://worker.example', 'https://user:token@worker.example', 'https://worker.example/a', 'https://worker.example?token=x']) assert.throws(() => researchEndpoint(endpoint));
  for (const r of [{ ...request, operation: 'shell' }, { ...request, symbol: 'main' }, { ...request, path: '/etc/passwd' }, { ...request, requestId: '../foo' }]) assert.throws(() => researchRequest(r));
  assert.throws(() => researchJob({ ...job, id: randomUUID() }));
  assert.throws(() => researchResult(JSON.stringify({ ...result, request: { ...request, targetSha256: 'b'.repeat(64) } }), job));
  assert.throws(() => researchResult(JSON.stringify(result), { ...job, state: 'cancelled' }));
  assert.throws(() => researchResult(JSON.stringify({ ...result, targetExecuted: true }), job));
});
test('client verifies exact request, result digest and bounded headers', async () => {
  const requests: RequestInit[] = [];
  const c = client(async (_url, init) => { requests.push(init!); return response(result); });
  assert.deepEqual(await c.result(job), result);
  assert.equal(requests[0]!.redirect, 'error'); assert.equal(requests[0]!.credentials, 'omit');
  await assert.rejects(client(async () => response({ ...result, output: 'tamper' })).result(job), /digest mismatch/);
  await assert.rejects(client(async () => response({ ...result, jobId: randomUUID() })).result(job), /selected job/);
  await assert.rejects(client(async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '65537' } })).jobs(), /limits/);
  await assert.rejects(client(async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '1' } })).jobs(), /limits/);
  await assert.rejects(client(async () => response({ error: 'unauthorised' }, 401)).jobs(), /unauthorised/);
});
test('disconnect aborts an in-flight response and prevents late result adoption', async () => {
  let complete!: (r: Response) => void;
  let signal: AbortSignal | undefined;
  const c = client(async (_url, init) => { signal = init!.signal!; return new Promise(resolve => { complete = resolve; }); });
  const pending = c.result(job);
  c.disconnect(); assert.equal(signal!.aborted, true); complete(response(result));
  await assert.rejects(pending, /interrupted/);
  await assert.rejects(c.jobs(), /disconnected/);
});
test('client detects forged submit identity and duplicate job lists', async () => {
  await assert.rejects(client(async () => response({ ...job, request: { ...request, symbol: 'apex_encode' } })).submit(request), /identity mismatch/);
  await assert.rejects(client(async () => response({ jobs: [job, job] })).jobs(), /Duplicate/);
});
test('saving a result retains a source reference and derived lineage without tokens or original-byte claims', async () => {
  const rows = new Map<string, string>();
  const store = new CaseStore({ read: async id => rows.get(id) ?? null, list: async () => [...rows.values()], put: async (id, expected, _rev, doc) => { const previous = rows.get(id); if ((previous ? JSON.parse(previous).revision : null) !== expected) return false; rows.set(id, doc); return true; }, remove: async id => rows.delete(id) }, { randomId: randomUUID, sha256: async s => sha(s) });
  const saved = await saveResearchCase(store, 'https://worker.example', result);
  assert.equal(saved.artifacts.length, 2);
  assert.deepEqual(saved.artifacts[1]!.parents, [saved.artifacts[0]!.id]);
  const source = JSON.parse(saved.artifacts[0]!.content);
  assert.equal(source.originalBytesPresentOnPhone, false);
  assert.equal(source.endpoint, 'https://worker.example');
  assert.equal((await store.verify(await store.export(saved.id))).sha256, saved.sha256);
  assert.equal(JSON.stringify(saved).includes('Bearer'), false);
});
