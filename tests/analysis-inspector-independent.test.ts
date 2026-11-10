/** Independent host/source regression checks, not mounted React, native, focus or scroll acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ANALYSIS_INSPECTORS, ANALYSIS_ROUTES, DEFAULT_ANALYSIS_INSPECTOR, AnalysisSourceGate, isAnalysisInspector, nextAnalysisSource } from '../src/analysis-navigation.ts';
import { IrWorkbenchController, IR_EXAMPLE } from '../src/ir-workbench.ts';
import { HciWorkbenchController, HCI_EXAMPLE } from '../src/hci-workbench.ts';
import { initialBleWorkbench, bleWorkbenchReducer, canSaveBle } from '../src/ble-workbench.ts';
import { initialPhoneNdefWorkbench, phoneNdefWorkbenchReducer, canSavePhoneNdef } from '../src/phone-ndef-workbench.ts';
const source = (name: string) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const app = source('App.tsx');
const hash = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function deferred() { let resolve!: (value:string)=>void; let reject!: (value:unknown)=>void; const promise=new Promise<string>((a,b)=>{resolve=a; reject=b;}); return {promise,resolve,reject}; }

test('fourteen unique typed choices preserving prior inspectors, Recording default and exact source routes', () => {
  assert.deepEqual(ANALYSIS_INSPECTORS.map(x=>x.id), ['recording','ble','ble-trials','ble-candidate','flipper','ir','hci-document','hci','ndef','phone-ndef','static-nfc','hci-compare','iq','wifi-security']);
  assert.equal(DEFAULT_ANALYSIS_INSPECTOR, 'recording');
  for(const x of ANALYSIS_INSPECTORS) assert.ok(isAnalysisInspector(x.id));
  for(const x of ['', 'NFC', 'Recording', 'nfc', null, {}, 0]) assert.equal(isAnalysisInspector(x),false);
  assert.deepEqual(ANALYSIS_ROUTES, {'staged-hci-report':'hci-compare','selected-hci-event':'hci-document','service-data':'ble','advertised-uuid':'ble','phone-capture':'phone-ndef','staged-ble':'ble-trials'});
});
test('source IDs increase even for identical bytes; gate rejects replay without losing later IDs or platform', () => {
  const gate=new AnalysisSourceGate();
  const doc={document:' \n exact selected fields \t', expectedPlatform:'ios' as const, receivedAt:'unchanged'};
  const first=nextAnalysisSource(null,doc), second=nextAnalysisSource(first,doc);
  assert.deepEqual(first,{...doc,id:1}); assert.deepEqual(second,{...doc,id:2});
  assert.ok(gate.take(first)); assert.equal(gate.take({...first}),false);
  for(const id of [0,-1,NaN,Infinity,1.1,Number.MAX_SAFE_INTEGER+1]) assert.equal(gate.take({id}),false);
  assert.ok(gate.take(second)); assert.equal(gate.take(first),false);
  assert.equal(gate.take(null),false); assert.equal(gate.take(undefined),false);
  assert.ok(gate.take(nextAnalysisSource(second,{...doc,expectedPlatform:'android'})));
  assert.equal(first.document,doc.document); assert.equal(first.expectedPlatform,'ios');
});
test('source wiring retains stable unconditional component slots and exclusive active expressions', () => {
  const entries=[['BleTrialWorkbench','ble-trials'],['BleCandidateWorkbench','ble-candidate'],['FlipperWorkbench','flipper'],['IrWorkbench','ir'],['HciWorkbench','hci'],['HciDocumentWorkbench','hci-document'],['HciComparisonWorkbench','hci-compare'],['NdefWorkbench','ndef'],['PhoneNdefWorkbench','phone-ndef'],['BleWorkbench','ble'],['NfcStaticWorkbench','static-nfc'],['IqWorkbench','iq']];
  let last=-1;
  for(const [component,id] of entries) {
    const starts=[...app.matchAll(new RegExp(`<${component}\\b`,'g'))]; assert.equal(starts.length,1);
    const pos=starts[0]!.index!; assert.ok(pos>last); last=pos;
    assert.match(app.slice(pos,app.indexOf('/>',pos)),new RegExp(`active=\\{tab === 'Analysis' && inspector === '${id}'\\}`));
    assert.match(app.slice(app.lastIndexOf('\n',pos)+1,pos),/^\s*$/,'No condition wraps mounted component');
  }
  assert.match(app,/tab === 'Analysis' && inspector === 'recording'/);
  assert.equal((app.match(/new RecordingWorkbench/g)??[]).length,1);
  const select=app.slice(app.indexOf('function selectInspector('),app.indexOf('const inspectorLabel'));
  assert.match(select,/setInspector\(next\)/); assert.match(select,/setChooserOpen\(false\)/); assert.match(select,/setTab\('Analysis'\)/); assert.match(select,/scrollTo\(\{ y: 0, animated: false \}\)/);
  assert.doesNotMatch(select,/\.save\(|\.analyse\(|\.analyze\(|\.stage\(|\.edit\(|\.declare\(/);
  assert.match(app,/onPress=\{\(\) => setChooserOpen\(value => !value\)\}/);
});
test('source handoffs keep exact documents and stage before navigation; Evidence stays inline', () => {
  assert.match(app,/setSelectedPhoneSource\(previous => nextAnalysisSource\(previous, selected\)\); selectInspector\(ANALYSIS_ROUTES\['phone-capture'\]\)/);
  for(const route of ['service-data','advertised-uuid']) assert.ok(app.includes(`setSelectedBleSource(previous => nextAnalysisSource(previous, { document })); selectInspector(ANALYSIS_ROUTES['${route}']);`));
  assert.match(app,/onStageTrial=\{document => \{ trialAuthoring.stage\(document\); authoringChanged\(\); selectInspector\(ANALYSIS_ROUTES\['staged-ble'\]\); \}\}/);
  const evidence=app.slice(app.indexOf("{tab === 'Evidence'"));
  assert.doesNotMatch(evidence,/setSelected(?:Ble|Phone)Source|selectInspector\(/);
  for(const name of ['BleEvidenceReopen','NdefEvidenceReopen','PhoneNdefEvidenceReopen']) assert.ok(evidence.includes('<'+name));
  assert.match(app,/if \(name !== 'Devices' && captureBusy.current\).*cancel/);
});
test('source incoming effects run before inactive return, consume once and preserve phone platform', () => {
  for(const file of ['BleWorkbench','PhoneNdefWorkbench']) {
    const text=source(`src/${file}.tsx`);
    const effect=text.match(/useEffect\(\(\) => \{\s*if \(selectedSource[\s\S]*?\}, \[selectedSource\]\);/)?.[0];
    assert.ok(effect); assert.ok(effect.includes('incomingSource.take(selectedSource)')); assert.doesNotMatch(effect,/\bactive\b/);
    assert.ok(text.indexOf(effect)<text.indexOf('if (!active) return null'));
    assert.match(effect,/document: selectedSource.document/);
    if(file==='PhoneNdefWorkbench') assert.match(effect,/expectedPlatform: selectedSource.expectedPlatform/);
    const save=text.slice(text.indexOf('async function save()'),text.indexOf('if (!active) return null'));
    assert.match(save,/store.save\(snapshot.saveInput\)/);
    assert.ok(save.lastIndexOf("type: 'save-finish'")<save.indexOf('await onSaved()'));
    assert.doesNotMatch(save,/\bactive\b/);
  }
  const trial=source('src/BleTrialWorkbench.tsx');
  assert.match(trial,/!active && \{ display: 'none' \}/);
  assert.doesNotMatch(trial,/if \(!active\) return/);
  assert.equal((trial.match(/<BleTrialAuthoringWorkbench/g)??[]).length,1);
});
for(const kind of ['ir','hci'] as const) for(const fail of [false,true]) test(`${kind}: newer inspector request wins over older ${fail?'rejection':'completion'} after exit`, async()=>{
  const old=deferred(), fresh=deferred(); let calls=0;
  const controller=kind==='ir'?new IrWorkbenchController(true,()=> (++calls===1?old:fresh).promise):new HciWorkbenchController(true,()=> (++calls===1?old:fresh).promise);
  controller.example(controller.lease); const oldLease=controller.lease; const first=controller.inspect(oldLease);
  controller.deactivate(); assert.equal(controller.state.draft,kind==='ir'?IR_EXAMPLE:HCI_EXAMPLE);
  assert.equal(controller.state.provenance,'synthetic-fixture'); controller.activate(); const second=controller.inspect(controller.lease);
  fresh.resolve(await hash(kind==='ir'?Buffer.from(IR_EXAMPLE):Buffer.from(HCI_EXAMPLE,'hex'))); await second;
  const newer=controller.state; assert.ok(kind==='ir'?(newer as any).report:(newer as any).metadata);
  if(fail) old.reject(new Error('old failure')); else old.resolve('0'.repeat(64)); await first;
  assert.equal(controller.state,newer); controller.edit('bad stale edit',oldLease); assert.equal(controller.state,newer);
  controller.edit('é',controller.lease); assert.ok(controller.state.rejectedEdit); controller.deactivate(); controller.activate(); await controller.inspect(controller.lease);
  assert.ok(controller.state.rejectedEdit); assert.equal(calls,2);
});
for(const family of ['ble','phone'] as const) for(const fail of [false,true]) test(`${family}: source handoff during save ${fail?'failure':'success'} preserves newer draft and consumes only saved snapshot`,()=>{
  const document=source(family==='ble'?'src/fixtures/bthome-observation.json':'tests/fixtures/phone-ndef/android.json');
  const reduce:any=family==='ble'?bleWorkbenchReducer:phoneNdefWorkbenchReducer;
  const canSave:any=family==='ble'?canSaveBle:canSavePhoneNdef;
  let state:any=reduce(family==='ble'?initialBleWorkbench:initialPhoneNdefWorkbench,{type:'edit',document,expectedPlatform:'android'});
  state=reduce(state,{type:'interpret'}); assert.ok(canSave(state)); const snapshot=state;
  state=reduce(state,{type:'save-start'}); state=reduce(state,{type:'edit',document:document+'\n',expectedPlatform:'android'});
  assert.equal(state.observation,null); assert.equal(state.saveInput,null); assert.equal(canSave(state),false);
  const pending=state; assert.equal(reduce(state,{type:'save-start'}),pending); assert.equal(reduce(state,{type:'interpret'}),pending);
  state=reduce(state,{type:'save-finish',revision:snapshot.revision,document:snapshot.document,...(fail?{error:'write failed'}:{})});
  assert.equal(state.document,document+'\n'); assert.equal(state.observation,null); assert.equal(state.saveInput,null); assert.equal(state.pending,null);
  assert.equal(state.savedDocument,fail?null:document);
  const settled=state; assert.equal(reduce(state,{type:'save-finish',revision:snapshot.revision,document:snapshot.document}),settled);
  state=reduce(state,{type:'edit',document}); state=reduce(state,{type:'interpret'}); assert.equal(canSave(state),fail);
});
