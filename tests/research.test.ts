import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('all 28 research records have immutable source and licence evidence', () => {
  const register = JSON.parse(readFileSync(new URL('../research/upstreams.json', import.meta.url), 'utf8'));
  assert.equal(register.projects.length, 28);
  assert.equal(new Set(register.projects.map((p: { id: string }) => p.id)).size, 28);
  for (const project of register.projects) {
    assert.match(project.commit, /^[0-9a-f]{40}$/); assert.equal(project.sourceCopied, true); assert.equal(project.applicationCodeIntegrated, false); assert.ok(project.referenceSourcePath.startsWith('research/upstream-sources/'));
    assert.equal(project.apexHardwareEvidence, 'not-tested'); assert.ok(project.documents.length >= 2);
    for (const doc of project.documents) { assert.equal(doc.read, true); assert.match(doc.blob, /^[0-9a-f]{40}$/); assert.ok(doc.url.includes(project.commit)); }
  }
});
