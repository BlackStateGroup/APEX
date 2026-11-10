import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOfflinePassport } from '../packages/core/device-intelligence.ts';
import { parseDeviceFirmwareReport, compareOfflineFirmwareReports, DEVICE_REPORT_MAX_CHARS } from '../packages/core/device-intelligence-report.ts';
import { ANALYSIS_INSPECTORS, isAnalysisInspector } from '../src/analysis-navigation.ts';

function report(marker=false, sha='a'.repeat(64)) {
  return {
    schemaVersion:1, kind:'apex.firmware-analysis',
    passport:createOfflinePassport({name:'synthetic-router.bin',sha256:sha,bytes:1024,format:'unknown'},
      {sshConfigurationMarker:marker,credentialConfigurationMarker:false,webManagementMarker:false}),
    archive:null,
    inspection:{method:'bounded-static-byte-inspection',decompressed:false,firmwareExecuted:false,
      credentialValuesReturned:false,networkOrHardwareContact:false},
    limitations:['Synthetic fixture, not a real device.','Byte markers are not passwords.','No authority is established.'],
  };
}

test('mobile offline firmware report is strict, immutable and says root unknown',()=>{
  const input=JSON.stringify(report());
  const result=parseDeviceFirmwareReport(input);
  assert.equal(result.passport.access.root,'unknown');
  assert.equal(result.rootAccess,'unknown');
  assert.equal(result.connectivity,'unknown');
  assert.equal(result.evidence,'offline-static-only');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.passport));
  assert.ok(Object.isFrozen(result.warnings));
});

test('no changed marker is ever promoted to a security patch or root access',()=>{
  const a=parseDeviceFirmwareReport(JSON.stringify(report()));
  const b=parseDeviceFirmwareReport(JSON.stringify(report(true,'b'.repeat(64))));
  const diff=compareOfflineFirmwareReports(a,b);
  assert.equal(diff.sameFirmwareBytes,false);
  assert.equal(diff.securityPatchEstablished,false);
  assert.equal(diff.actualDeviceEquivalence,'unknown');
  assert.deepEqual(diff.changedIndicators,['sshConfigurationMarker']);
  assert.equal(Object.isFrozen(diff.changedIndicators),true);
});

test('mobile importer refuses forged execution, unknown envelope fields and credential-bearing extras',()=>{
  for(const change of [
    (x:any)=>{x.passport.access.root='verified';},
    (x:any)=>{x.passport.deviceConnected=true;},
    (x:any)=>{x.passport.source.command='shell';},
    (x:any)=>{x.inspection.networkOrHardwareContact=true;},
    (x:any)=>{x.inspection.firmwareExecuted=true;},
    (x:any)=>{x.extra='do_not_trust';},
    (x:any)=>{x.kind='apex.privileged-shell';},
    (x:any)=>{x.archive={entriesExamined:1,unsafeEntryIndicators:0,incomplete:false};},
    (x:any)=>{x.limitations=['secret','raw password=fiction'];},
  ]) {
    const candidate:any=JSON.parse(JSON.stringify(report()));change(candidate);
    // Last case has two limitations, not three. Reject rather than echoing it to users.
    assert.throws(()=>parseDeviceFirmwareReport(JSON.stringify(candidate)));
  }
});

test('secret-shaped imported warning prose is discarded rather than echoed in the UI projection',()=>{
  const candidate:any=JSON.parse(JSON.stringify(report()));
  candidate.limitations=['password=SHOULD_NOT_APPEAR','privateKey=SHOULD_NOT_APPEAR','EXFILTRATE_THIS'];
  const parsed=parseDeviceFirmwareReport(JSON.stringify(candidate));
  assert.equal(JSON.stringify(parsed).includes('SHOULD_NOT_APPEAR'),false);
  assert.equal(JSON.stringify(parsed).includes('EXFILTRATE_THIS'),false);
  assert.equal(parsed.warnings.length,3);
});

test('archive accounting is bounded and tied to tar sources',()=>{
  const tar:any=report();
  tar.passport=createOfflinePassport({...tar.passport.source,format:'tar'},tar.passport.indicators);
  tar.archive={entriesExamined:4,unsafeEntryIndicators:2,incomplete:false};
  assert.equal(parseDeviceFirmwareReport(JSON.stringify(tar)).archive?.unsafeEntryIndicators,2);
  tar.archive.unsafeEntryIndicators=5;
  assert.throws(()=>parseDeviceFirmwareReport(JSON.stringify(tar)));
  tar.archive.unsafeEntryIndicators=2;tar.archive.entriesExamined=99999;
  assert.throws(()=>parseDeviceFirmwareReport(JSON.stringify(tar)));
  tar.archive=null;
  assert.throws(()=>parseDeviceFirmwareReport(JSON.stringify(tar)));
});

test('import fails on oversized, ambiguous or unexpected syntax',()=>{
  assert.throws(()=>parseDeviceFirmwareReport(' '.repeat(DEVICE_REPORT_MAX_CHARS+1)),/bound/);
  const input=JSON.stringify(report());
  assert.throws(()=>parseDeviceFirmwareReport(input.replace('"kind":"apex.firmware-analysis"','"kind":"apex.firmware-analysis","kind":"apex.firmware-analysis"')),/Duplicate/);
  assert.throws(()=>parseDeviceFirmwareReport(input.replace('"kind":"apex.firmware-analysis"','"__proto__":{},"kind":"apex.firmware-analysis"')));
  assert.throws(()=>parseDeviceFirmwareReport('{'));
});

test('APEX Analysis contains a single explicit Passport selector without automatic network or firmware execution',()=>{
  const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
  const app=read('../App.tsx'),ui=read('../src/DevicePassportWorkbench.tsx');
  assert.equal(ANALYSIS_INSPECTORS.filter(x=>x.id==='device-passport').length,1);
  assert.equal(isAnalysisInspector('device-passport'),true);
  assert.equal((app.match(/<DevicePassportWorkbench /g)??[]).length,1);
  assert.ok(app.includes("<DevicePassportWorkbench active={tab === 'Analysis' && inspector === 'device-passport'} />"));
  assert.match(ui,/parseDeviceFirmwareReport\(/);
  assert.match(ui,/Compare inspected firmware reports/);
  assert.match(ui,/Load labelled synthetic Passport A/);
  assert.doesNotMatch(ui,/fetch\(|spawn\(|exec\(|reboot|password=/);
});
