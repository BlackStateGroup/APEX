import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANALYSIS_INSPECTORS, ANALYSIS_ROUTES, DEFAULT_ANALYSIS_INSPECTOR, isAnalysisInspector, nextAnalysisSource, AnalysisSourceGate } from '../src/analysis-navigation.ts';
import { BleTrialAuthoringWorkbench } from '../src/ble-trial-authoring-workbench.ts';
import { bleWorkbenchReducer, initialBleWorkbench } from '../src/ble-workbench.ts';
import { phoneNdefWorkbenchReducer, initialPhoneNdefWorkbench } from '../src/phone-ndef-workbench.ts';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../App.tsx');
test('thirteen typed inspector choices retaining the original twelve, Recording default, and separate explicit source routes', () => {
  assert.equal(ANALYSIS_INSPECTORS.length, 13);
  assert.equal(new Set(ANALYSIS_INSPECTORS.map(x => x.id)).size, 13);
  assert.deepEqual(ANALYSIS_INSPECTORS.map(x=>x.id), ['recording','ble','ble-trials','ble-candidate','flipper','ir','hci-document','hci','ndef','phone-ndef','static-nfc','hci-compare','iq']);
  assert.equal(DEFAULT_ANALYSIS_INSPECTOR, 'recording');
  for (const item of ANALYSIS_INSPECTORS) assert.ok(isAnalysisInspector(item.id));
  for (const invalid of [null, undefined, '', 'NFC', 'Analysis', '__proto__']) assert.equal(isAnalysisInspector(invalid), false);
  assert.deepEqual(ANALYSIS_ROUTES, { 'staged-hci-report': 'hci-compare', 'selected-hci-event': 'hci-document', 'service-data': 'ble', 'advertised-uuid': 'ble', 'phone-capture': 'phone-ndef', 'staged-ble': 'ble-trials' });
});
test('navigation source wiring keeps controllers at stable positions and has no implicit work', () => {
  const select = app.slice(app.indexOf('  function selectInspector'), app.indexOf('  const inspectorLabel'));
  assert.match(select, /setInspector\(next\); setChooserOpen\(false\); activeTab\.current = 'Analysis'; setTab\('Analysis'\)/);
  assert.match(select, /scroll\.current\?\.scrollTo\(\{ y: 0, animated: false \}\)/);
  assert.doesNotMatch(select, /stage|analyse|interpret|save|declare|load|Source/);
  assert.equal((app.match(/setInspector\(/g) ?? []).length, 1);
  assert.match(app, /onPress=\{\(\) => setChooserOpen\(value => !value\)\}/);
  assert.match(app, /accessibilityState=\{\{ expanded: chooserOpen \}\}/);
  assert.match(app, /accessibilityState=\{\{ selected: inspector === item.id \}\}/);
  for (const [component, id] of [['BleTrialWorkbench','ble-trials'], ['BleCandidateWorkbench','ble-candidate'], ['FlipperWorkbench','flipper'], ['IrWorkbench','ir'], ['HciWorkbench','hci'], ['HciDocumentWorkbench','hci-document'],['HciComparisonWorkbench','hci-compare'], ['NdefWorkbench','ndef'], ['NfcStaticWorkbench','static-nfc'], ['IqWorkbench','iq']]) {
    assert.ok(app.includes(`<${component} active={tab === 'Analysis' && inspector === '${id}'}`));
    assert.equal((app.match(new RegExp(`<${component} `, 'g')) ?? []).length, 1);
  }
  assert.match(app, /selectedSource=\{selectedPhoneSource\} active=\{tab === 'Analysis' && inspector === 'phone-ndef'\}/);
  assert.match(app, /trialAuthoring.stage\(document\); authoringChanged\(\); selectInspector\(ANALYSIS_ROUTES\['staged-ble'\]\)/);
  for (const route of ['service-data', 'advertised-uuid', 'phone-capture']) assert.ok(app.includes(`selectInspector(ANALYSIS_ROUTES['${route}'])`));
  assert.match(app, /new RecordingWorkbench\(\)/);
  assert.equal((app.match(/new RecordingWorkbench\(/g) ?? []).length, 1);
  assert.match(read('../src/BleTrialWorkbench.tsx'), /!active && \{ display: 'none' \}/);
  for (const file of ['BleWorkbench', 'PhoneNdefWorkbench']) {
    const source = read(`../src/${file}.tsx`);
    assert.match(source, /incomingSource.take\(selectedSource\)/);
    assert.match(source, /\}, \[selectedSource\]\)/);
    assert.ok(source.indexOf('incomingSource.take(selectedSource)') < source.indexOf('if (!active) return null'));
  }
  // Evidence reopen remains inline; selecting an inspector does not route saved evidence.
  assert.match(app, /record.kind === 'analysis.ndef-source' && <PhoneNdefEvidenceReopen/);
  assert.match(app, /record.kind === 'analysis.ndef' && <NdefEvidenceReopen/);
});
test('handoff IDs increase without modifying exact source or phone platform; duplicate and stale IDs never replay', () => {
  const source = { document: ' \n exact source\t', expectedPlatform: 'ios' as const, receivedAt: 'receipt' };
  const first = nextAnalysisSource(null, source), second = nextAnalysisSource(first, source);
  assert.deepEqual(first, { ...source, id: 1 }); assert.deepEqual(second, { ...source, id: 2 });
  const gate = new AnalysisSourceGate();
  assert.equal(gate.take(null), false); assert.equal(gate.take(first), true);
  assert.equal(gate.take({ ...first }), false); assert.equal(gate.take(second), true);
  assert.equal(gate.take(first), false); assert.equal(gate.take({ id: NaN }), false);
});
test('stage preserves exact source only; authoring is not started, built or analysed', () => {
  const c = new BleTrialAuthoringWorkbench();
  const document = '\n' + read('../src/fixtures/ble-plx-android-source.json') + ' ';
  c.stage(document); assert.equal(c.staged, document); assert.equal(c.author, null); assert.equal(c.built, null);
  assert.throws(() => c.stage('{}')); assert.equal(c.staged, document);
});
for (const failure of [false, true]) test(`source delivery during pending saves survives old ${failure ? 'failure' : 'completion'} without reviving results`, () => {
  const bleDocument = read('../src/fixtures/ble-plx-android-source.json');
  let ble = bleWorkbenchReducer(initialBleWorkbench, { type: 'edit', mode: 'selected-source', document: bleDocument });
  ble = bleWorkbenchReducer(ble, { type: 'interpret' }); const oldBle = ble;
  ble = bleWorkbenchReducer(ble, { type: 'save-start' });
  const phoneDocument = read('./fixtures/phone-ndef/ios.json');
  let phone = phoneNdefWorkbenchReducer(initialPhoneNdefWorkbench, { type: 'edit', document: phoneDocument, expectedPlatform: 'ios' });
  phone = phoneNdefWorkbenchReducer(phone, { type: 'interpret' }); const oldPhone = phone;
  phone = phoneNdefWorkbenchReducer(phone, { type: 'save-start' });
  // Visibility changes do not dispatch reducer actions. New source handoffs do.
  const gate = new AnalysisSourceGate(); assert.ok(gate.take({ id: 1 }));
  const exact = '\n' + bleDocument;
  ble = bleWorkbenchReducer(ble, { type: 'edit', mode: 'selected-source', document: exact });
  phone = phoneNdefWorkbenchReducer(phone, { type: 'edit', document: '\n' + phoneDocument, expectedPlatform: 'ios' });
  assert.equal(gate.take({ id: 1 }), false);
  ble = bleWorkbenchReducer(ble, { type: 'save-finish', revision: oldBle.revision, document: oldBle.document, ...(failure ? { error: 'late failure' } : {}) });
  phone = phoneNdefWorkbenchReducer(phone, { type: 'save-finish', revision: oldPhone.revision, document: oldPhone.document, ...(failure ? { error: 'late failure' } : {}) });
  assert.equal(ble.document, exact); assert.equal(ble.observation, null); assert.equal(ble.pending, null);
  assert.equal(phone.document, '\n' + phoneDocument); assert.equal(phone.expectedPlatform, 'ios'); assert.equal(phone.observation, null); assert.equal(phone.pending, null);
});
