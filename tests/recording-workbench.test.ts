import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RecordingWorkbench, MAX_RECORDING_INPUT_CHARACTERS } from '../src/recording-workbench.ts';
import { EvidenceStore } from '../packages/core/evidence.ts';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function journal(wait = Promise.resolve(), failList = false) {
  const rows: string[] = [];
  const store = new EvidenceStore({
    insert: async (_id, document) => { await wait; rows.push(document); },
    list: async () => { if (failList) throw new Error('refresh failed'); return rows; },
  }, { randomId: randomUUID, sha256: async value => createHash('sha256').update(value).digest('hex') });
  return { store, rows };
}
test('editing or replacing a recording clears both displayed report and save eligibility', () => {
  const work = new RecordingWorkbench(); work.analyse(); assert.equal(work.canSave, true);
  work.edit('{'); assert.equal(work.canSave, false); assert.match(work.analysis, /Input changed/);
  work.analyse(); assert.equal(work.canSave, false); assert.match(work.analysis, /Analysis error/);
  work.loadFixture('CAN'); assert.equal(work.canSave, false); assert.equal(work.analysis, 'Fixture loaded. Ready to analyse.');
});
test('pending save uses selected analysis snapshot; late success never restores replaced report', async () => {
  const wait = deferred(); const { store, rows } = journal(wait.promise);
  const work = new RecordingWorkbench(); work.analyse();
  const save = work.save(store); assert.equal(work.canSave, false);
  assert.equal(await work.save(store), false);
  work.loadFixture('CAN'); work.analyse(); const report = work.analysis;
  assert.equal(work.canSave, false);
  wait.resolve(); assert.equal(await save, true);
  assert.equal(JSON.parse(rows[0]!).kind, 'analysis.nec');
  assert.equal(work.analysis, report); assert.equal(work.canSave, true);
  await work.save(store); assert.equal(JSON.parse(rows[1]!).kind, 'analysis.can');
});
test('committed save stays consumed after failed list refresh, tab-like reuse, and repeated interpretation', async () => {
  const { store, rows } = journal(Promise.resolve(), true);
  const work = new RecordingWorkbench(); work.analyse();
  assert.equal(await work.save(store), true);
  await assert.rejects(store.list(), /refresh failed/);
  assert.equal(work.canSave, false); work.analyse();
  assert.equal(await work.save(store), false); assert.equal(rows.length, 1);
  work.edit(work.input + ' '); work.analyse(); assert.equal(work.canSave, true);
});
test('failed persistence releases retry only for the current interpreted draft', async () => {
  const wait = deferred(); const work = new RecordingWorkbench(); work.analyse();
  const save = work.save({ save: async () => { await wait.promise; throw new Error('insert failed'); } });
  work.edit('not a recording'); wait.resolve(); await assert.rejects(save, /insert failed/);
  assert.equal(work.canSave, false); assert.match(work.analysis, /Input changed/);
  work.loadFixture('NEC'); work.analyse(); assert.equal(work.canSave, true);
  const { store } = journal(); assert.equal(await work.save(store), true);
});
test('legacy analysis evidence schema and sources are preserved for all three formats', async () => {
  const { store, rows } = journal(); const work = new RecordingWorkbench();
  work.analyse(); await work.save(store);
  work.loadFixture('CAN'); work.analyse(); await work.save(store);
  work.edit(readFileSync(new URL('../src/fixtures/rea-elf-notes.json', import.meta.url), 'utf8'), 'REA ELF', false);
  work.analyse(); await work.save(store);
  assert.deepEqual(rows.map(row => JSON.parse(row).kind), ['analysis.nec', 'analysis.can', 'analysis.firmware']);
  assert.deepEqual(rows.map(row => JSON.parse(row).source), ['offline-fixture', 'offline-fixture', 'offline-import']);
  for (const row of rows) { const record = JSON.parse(row); assert.equal(await store.verify(record), true); assert.deepEqual(Object.keys(record.payload), ['format', 'result']); }
});

for (const format of ['NEC', 'CAN', 'REA ELF'] as const) {
  test(`${format} rejects an oversized whole edit rather than interpreting its valid prefix`, async () => {
    const work = new RecordingWorkbench();
    if (format === 'REA ELF') work.edit(readFileSync(new URL('../src/fixtures/rea-elf-notes.json', import.meta.url), 'utf8'), format);
    else work.loadFixture(format);
    const prefix = work.input.padEnd(MAX_RECORDING_INPUT_CHARACTERS, ' ');
    work.edit(prefix, format); work.analyse();
    assert.equal(work.canSave, true, 'exact limit is accepted');
    const prior = { input: work.input, format: work.format, fixture: work.fixture };
    // Model the historical upstream truncation, not an observed browser paste.
    const attempted = prefix + 'not part of the valid document';
    assert.equal(attempted.slice(0, MAX_RECORDING_INPUT_CHARACTERS), prefix);
    work.edit(attempted, 'NEC', true);
    assert.deepEqual({ input: work.input, format: work.format, fixture: work.fixture }, prior);
    assert.equal(work.canSave, false); assert.match(work.analysis, /Paste rejected whole/);
    const warning = work.analysis; work.analyse(); work.analyse();
    assert.equal(work.analysis, warning); assert.equal(work.canSave, false);
    let saves = 0; assert.equal(await work.save({ save: async () => { saves++; return {} as never; } }), false);
    assert.equal(saves, 0);
    work.edit(prefix, format); work.analyse(); assert.equal(work.canSave, true);
    work.edit(prefix + ' '); work.loadFixture('NEC'); work.analyse(); assert.equal(work.canSave, true);
  });
}
test('rejected recording edit stays invalid after an older pending save completes', async () => {
  const wait = deferred(); const { store, rows } = journal(wait.promise);
  const work = new RecordingWorkbench(); work.analyse(); const save = work.save(store);
  work.edit(' '.repeat(MAX_RECORDING_INPUT_CHARACTERS + 1)); const warning = work.analysis;
  wait.resolve(); assert.equal(await save, true); assert.equal(rows.length, 1);
  work.analyse(); assert.equal(work.analysis, warning); assert.equal(work.canSave, false);
});
test('recording source reaches controller without a platform truncation cap', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const input = app.match(/<TextInput accessibilityLabel="Recording input"[^>]*>/)?.[0];
  assert.ok(input); assert.doesNotMatch(input, /maxLength/);
  assert.match(input, /onChangeText=\{value =>/);
  assert.match(app, /recording\.edit\(value\); recordingChanged\(\);/);
});
