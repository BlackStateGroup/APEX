import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flipperWorkbenchReducer as reduce, initialFlipperWorkbench as initial, parseFlipperHex, FLIPPER_TEXT_LIMIT, FLIPPER_RESPONSE_FIXTURE, flipperVisibleFrames, flipperVisibleFields } from '../src/flipper-workbench.ts';
const inspect = (draft: string) => reduce(reduce(reduce(initial, { type: 'edit', draft }), { type: 'provenance', provenance: 'imported' }), { type: 'inspect' });
const fixture = () => reduce(reduce(initial, { type: 'fixture' }), { type: 'inspect' });
test('exact draft, explicit inspect and caller declaration; authored response has explicit presence', () => {
  const draft = ' \t0D\n08 01 10 00 18 00 c2 02 04 08 01 10 00\r\v\f';
  let state = reduce(initial, { type: 'edit', draft });
  assert.equal(state.draft, draft); assert.equal(state.report, null);
  assert.equal(reduce(state, { type: 'inspect' }).report, null);
  state = reduce(state, { type: 'provenance', provenance: 'synthetic' });
  assert.equal(state.report, null);
  state = reduce(state, { type: 'inspect' });
  assert.equal(state.draft, draft); assert.equal(state.report?.provenance, 'synthetic');
  assert.deepEqual(state.report?.frames[0]?.commandId, { present: true, effective: 1 });
  assert.deepEqual(state.report?.frames[0]?.hasNext, { present: true, effective: false });
  assert.equal(state.report?.frames[0]?.content.major?.effective, 1);
});
test('malformed and over-budget edits reject whole, preserve exact previous draft and clear results', () => {
  for (const draft of ['0', '0 0', 'gg', '0x00', '00,00', '00\u00a0', ' '.repeat(FLIPPER_TEXT_LIMIT + 1), '00'.repeat(65537)]) {
    const state = reduce(fixture(), { type: 'edit', draft });
    assert.equal(state.draft, FLIPPER_RESPONSE_FIXTURE); assert.equal(state.report, null); assert.match(state.message, /Previous draft retained/);
    assert.equal(state.framePage, 0); assert.equal(state.fieldPage, 0);
  }
  assert.equal(parseFlipperHex('00'.repeat(65536)).length, 65536);
  assert.equal(parseFlipperHex(' '.repeat(FLIPPER_TEXT_LIMIT)).length, 0);
  assert.equal(inspect('').report, null);
});
test('every edit attempt and provenance selection invalidates, fixture does not inspect', () => {
  assert.equal(reduce(fixture(), { type: 'edit', draft: FLIPPER_RESPONSE_FIXTURE }).report, null);
  assert.equal(reduce(fixture(), { type: 'provenance', provenance: 'imported' }).report, null);
  assert.equal(reduce(fixture(), { type: 'fixture' }).report, null);
  assert.equal(inspect(FLIPPER_RESPONSE_FIXTURE).report?.provenance, 'imported');
});
test('unknown and nonzero status, omitted defaults, incomplete tails and ambiguity remain observations', () => {
  const empty = inspect('00 80').report!;
  assert.equal(empty.frames.length, 1); assert.equal(empty.tail?.kind, 'incomplete-length');
  assert.deepEqual(empty.frames[0]?.commandId, { present: false, effective: 0 });
  assert.deepEqual(empty.frames[0]?.hasNext, { present: false, effective: false });
  assert.equal(empty.frames[0]?.status.observation, 'omitted');
  for (const status of ['02', '7f']) {
    const frame = inspect(`02 10 ${status}`).report?.frames[0];
    assert.equal(frame?.status.observation, 'nonzero-or-unknown');
    assert.ok(frame?.diagnostics.some(value => value.includes('not successful identity')));
  }
  assert.equal(inspect('05 08').report?.tail?.kind, 'incomplete-payload');
  assert.equal(inspect('04 28 00 30 00').report?.frames[0]?.unknownFields.length, 2);
  assert.ok(inspect('04 28 00 30 00').report?.frames[0]?.diagnostics.some(value => value.includes('ambiguous')));
  assert.equal(inspect('04 22 00 28 00').report, null);
  assert.match(inspect('04 22 00 28 00').message, /ambiguous-content/);
});
test('frame and metadata pages are bounded; malformed navigation cannot expand rendering', () => {
  let state = inspect('00 '.repeat(9));
  assert.equal(flipperVisibleFrames(state).length, 4);
  state = reduce(state, { type: 'frame-page', page: 2 });
  assert.equal(flipperVisibleFrames(state).length, 1); assert.equal(state.selectedFrame, 8);
  for (const page of [-1, 3, Infinity, NaN, 0.5]) assert.equal(reduce(state, { type: 'frame-page', page }), state);
  assert.equal(reduce(state, { type: 'select-frame', index: 0 }), state);
  state = inspect('14 ' + '28 00 '.repeat(10));
  assert.equal(flipperVisibleFields(state).length, 8);
  state = reduce(state, { type: 'field-page', page: 1 });
  assert.equal(flipperVisibleFields(state).length, 2);
  for (const page of [-1, 2, Infinity, NaN, 0.5]) assert.equal(reduce(state, { type: 'field-page', page }), state);
  state = reduce(state, { type: 'select-frame', index: 0 }); assert.equal(state.fieldPage, 0);
});
test('content remains data, including URL/control/markup strings', () => {
  const value = 'https://example.invalid/<script>\n';
  const payload = [0x8a, 2, value.length + 2, 0x12, value.length, ...new TextEncoder().encode(value)];
  const draft = [payload.length, ...payload].map(v => v.toString(16).padStart(2, '0')).join(' ');
  assert.equal(inspect(draft).report?.frames[0]?.content.value?.effective, value);
  const ui = readFileSync(new URL('../src/FlipperWorkbench.tsx', import.meta.url), 'utf8');
  assert.match(ui, /JSON.stringify\(value.effective\)/);
  assert.doesNotMatch(ui, /Linking|href|fetch\(|save\(|export\(|dangerouslySetInnerHTML|maxLength=/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<FlipperWorkbench active=\{tab === 'Analysis' && inspector === 'flipper'\} \/>/);
});

test('UI snapshots and navigation aliases cannot mutate observations or retained source', () => {
  const state = fixture(); const frame = flipperVisibleFrames(state)[0]!;
  assert.throws(() => { (frame.status as any).effective = 99; }, TypeError);
  assert.throws(() => { (state.report!.frames as any).push(frame); }, TypeError);
  assert.throws(() => { (frame.content.major as any).effective = 999; }, TypeError);
  assert.throws(() => { (frame.diagnostics as any).push('forged'); }, TypeError);
  assert.throws(() => { (state as any).draft = '00'; }, TypeError);
  assert.throws(() => { (state as any).report = null; }, TypeError);
  assert.equal(Object.hasOwn(state.report!, 'originalBytes'), false);
  assert.equal(state.report!.byteLength, 14);
  const next = reduce(state, { type: 'frame-page', page: 0 });
  assert.throws(() => { (next.report!.frames[0]!.content.major as any).effective = 999; }, TypeError);
  assert.equal(state.report!.frames[0]!.content.major!.effective, 1);
  assert.equal(state.report!.frames[0]!.status.effective, 0);
  assert.equal(state.draft, FLIPPER_RESPONSE_FIXTURE);
  const fields = flipperVisibleFields(state); fields[0]!.offset = 999;
  assert.equal(state.report!.frames[0]!.fields[0]!.offset, 1);
});
test('accessor actions are rejected without invoking getters, including enums and page values', () => {
  let reads = 0;
  const cases = [
    { type: 'edit', get draft() { return ++reads === 1 ? FLIPPER_RESPONSE_FIXTURE : 'x'.repeat(FLIPPER_TEXT_LIMIT + 1); } },
    { type: 'provenance', get provenance() { return ++reads === 1 ? 'synthetic' : 'verified-device'; } },
    { get type() { reads++; return 'fixture'; } },
    { type: 'frame-page', get page() { reads++; return 999; } },
    { type: 'field-page', get page() { reads++; return 999; } },
    { type: 'select-frame', get index() { reads++; return 999; } },
  ];
  for (const action of cases) {
    const state = reduce(fixture(), action as any);
    assert.equal(state.draft, FLIPPER_RESPONSE_FIXTURE); assert.equal(state.report, null);
    assert.equal(state.provenance, 'synthetic');
    assert.equal(state.framePage, 0); assert.equal(state.fieldPage, 0); assert.equal(state.selectedFrame, 0);
  }
  assert.equal(reads, 0);
  for (const action of [null, {}, { type: 'forged' }, Object.create({ type: 'fixture' }), { type: 'fixture', extra: true }]) {
    assert.equal(reduce(fixture(), action as any).report, null);
  }
  assert.equal(reduce(fixture(), { type: 'provenance', provenance: 'verified-device' } as any).provenance, null);
});
