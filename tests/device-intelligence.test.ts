import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createOfflinePassport, parseDevicePassport, attachReaElfEvidence,
  evaluateDeclaredReadScope, describeUnknownBoundaries,
} from '../packages/core/device-intelligence.ts';
import type { FirmwareSource, StaticIndicators, ScopeDeclaration } from '../packages/core/device-intelligence.ts';
import { SyntheticRouterLab, transitionLabState } from '../packages/core/router-lab.ts';

const digest = 'a'.repeat(64);
const source: FirmwareSource = { name:'owned-lab-router.bin', sha256:digest, bytes:4096, format:'unknown' };
const indicators: StaticIndicators = {sshConfigurationMarker:false,credentialConfigurationMarker:true,webManagementMarker:false};
const passport = () => createOfflinePassport(source, indicators);
const scope = (patch: Partial<ScopeDeclaration> = {}): ScopeDeclaration => ({
  fixtureId:'lab-router-01', sourceSha256:digest, authorisation:'owned-or-authorised-lab',
  approvedOperations:['system.info', 'system.health'], expiresAtMs:30000, operatorConfirmed:true, ...patch,
});

test('offline passport contains exact byte identity but never claims connected or root', () => {
  const p = passport();
  assert.equal(p.evidence, 'offline-static-only');
  assert.equal(p.access.root, 'unknown');
  assert.equal(p.access.network, 'unknown');
  assert.equal(p.deviceConnected, false);
  assert.equal(p.targetExecuted, false);
  assert.equal(p.indicators.credentialConfigurationMarker, true);
  assert.deepEqual(parseDevicePassport(JSON.stringify(p)), p);
  assert.ok(Object.isFrozen(p)); assert.ok(Object.isFrozen(p.source)); assert.ok(Object.isFrozen(p.indicators));
  assert.ok(Object.isFrozen(p.access)); assert.ok(Object.isFrozen(p.warnings));
});

test('source metadata does not accept path traversal, improper digest or oversized input', () => {
  for (const change of [
    {name:'../secret'}, {name:'a/b'}, {name:'line\nbreak'}, {bytes:67108865}, {bytes:-1},
    {sha256:'b'.repeat(63)}, {sha256:'B'.repeat(64)}, {format:'router-root'}, {name:' ' .repeat(129)},
  ]) assert.throws(() => createOfflinePassport({...source, ...change} as FirmwareSource, indicators));
});

test('untrusted evidence cannot silently promote privilege, access, physical identity or commands', () => {
  for (const change of [
    (v: any) => { v.access.root = 'verified'; },
    (v: any) => { v.access.management = 'admin'; },
    (v: any) => { v.deviceConnected = true; },
    (v: any) => { v.targetExecuted = true; },
    (v: any) => { v.evidence = 'physical'; },
    (v: any) => { v.execute = 'shell'; },
    (v: any) => { v.source.authenticated = true; },
    (v: any) => { v.indicators.password = 'secret'; },
    (v: any) => { v.warnings = []; },
    (v: any) => { v.rea = {source:'spoof'}; },
  ]) {
    const candidate: any = JSON.parse(JSON.stringify(passport())); change(candidate);
    assert.throws(() => parseDevicePassport(JSON.stringify(candidate)));
  }
});

test('duplicate and prototype-shaped JSON fields fail instead of replacing properties', () => {
  const input = JSON.stringify(passport());
  assert.throws(() => parseDevicePassport(input.replace('"schemaVersion":1', '"schemaVersion":1,"schema\\u0056ersion":1')), /Duplicate JSON/);
  assert.throws(() => parseDevicePassport(input.replace('"kind":"apex.device-passport"', '"__proto__":{},"kind":"apex.device-passport"')));
  assert.throws(() => parseDevicePassport(' '.repeat(65537)), /bound/);
  assert.throws(() => parseDevicePassport('{'));
});

test('indicators are boolean classes, not credentials or executable commands', () => {
  for (const value of ['root:password',1,[],{},null,undefined]) {
    assert.throws(() => createOfflinePassport(source, {...indicators, credentialConfigurationMarker:value as boolean}));
  }
  const x = JSON.stringify(passport());
  assert.equal(x.includes('root:password'), false);
  assert.equal(x.includes('privateKey'), false);
});

test('REA evidence binding uses same content hash and byte count, remains offline', () => {
  const report = readFileSync(new URL('../src/fixtures/rea-elf-notes.json', import.meta.url),'utf8');
  const data = JSON.parse(report);
  const reaSource = {
    name:'host-firmware.elf', sha256:data.normalized_result.artifact.sha256,
    bytes:data.normalized_result.artifact.bytes, format:'elf' as const,
  };
  const p = attachReaElfEvidence(createOfflinePassport(reaSource, indicators), report);
  assert.equal(p.rea!.artifactSha256, reaSource.sha256);
  assert.equal(p.rea!.coverage, 'complete');
  assert.equal(p.rea!.provenance, 'imported-host-rea-elf-report');
  assert.equal(p.access.root, 'unknown');
  assert.equal(p.deviceConnected, false);
  assert.throws(() => attachReaElfEvidence(passport(), report), /ELF/);
  assert.throws(() => attachReaElfEvidence(createOfflinePassport({...reaSource,sha256:digest},indicators),report), /digest/);
  assert.throws(() => attachReaElfEvidence(createOfflinePassport({...reaSource,bytes:reaSource.bytes+1},indicators),report), /length/);
  const mutated = JSON.parse(report);
  mutated.provider.id = 'fake';
  assert.throws(() => attachReaElfEvidence(createOfflinePassport(reaSource,indicators),JSON.stringify(mutated)));
});

test('read-only scope is preflight only and is never itself execution authorisation', () => {
  const decision = evaluateDeclaredReadScope(passport(),scope(),'system.info',100);
  assert.deepEqual(decision,{eligible:true,reason:'declared-lab-policy-only',executionAuthorised:false});
  assert.equal(Object.isFrozen(decision),true);
  assert.deepEqual(evaluateDeclaredReadScope(passport(),scope(),'system.version',100),
    {eligible:false,reason:'operation-denied',executionAuthorised:false});
  assert.equal(evaluateDeclaredReadScope(passport(),scope(),'system.info',30000).reason,'scope-expired');
  assert.equal(evaluateDeclaredReadScope(passport(),scope({sourceSha256:'b'.repeat(64)}),'system.info',1).reason,'target-mismatch');
  assert.equal(evaluateDeclaredReadScope(passport(),scope({expiresAtMs:0}),'system.info',1).reason,'scope-invalid');
  assert.equal(evaluateDeclaredReadScope(passport(),scope({approvedOperations:['system.info','system.info']}),'system.info',1).reason,'scope-invalid');
  assert.equal(evaluateDeclaredReadScope(passport(),{...scope(),operatorConfirmed:false},'system.info',1).reason,'scope-invalid');
});

test('arbitrary target operations are denied before declared policy is examined', () => {
  for (const operation of ['system.reboot','root.shell','credential.export','__proto__','toString','',null]) {
    assert.equal(evaluateDeclaredReadScope(passport(),scope(),operation,1).reason,'operation-denied');
  }
});

test('security boundary graph is immutable, independent and entirely unknown offline', () => {
  const graph = describeUnknownBoundaries(passport());
  assert.equal(graph.length,6);
  assert.ok(graph.every(x => x.status==='unknown' && Object.isFrozen(x)));
  assert.equal(graph.find(x=>x.id==='operating-system-root')?.status,'unknown');
  assert.throws(()=> (graph as any).push({status:'root'}));
});

test('synthetic router model requires connect then authentication, never assumes one from the other', () => {
  assert.equal(transitionLabState('disconnected','connect'),'connected');
  assert.throws(()=>transitionLabState('disconnected','authenticate-viewer'));
  assert.equal(transitionLabState('connected','authenticate-viewer'),'viewer-authenticated');
  assert.equal(transitionLabState('viewer-authenticated','disconnect'),'disconnected');
  const lab = new SyntheticRouterLab(passport(),
    {kind:'apex.synthetic-router',fixtureId:'lab-router-01',sourceSha256:digest,health:'synthetic-ready',versionLabel:'synthetic-1'},
    scope());
  assert.equal(lab.connectionState,'disconnected');
  assert.throws(()=>lab.read('system.info',10),/authentication/);
  lab.event('connect');
  assert.throws(()=>lab.read('system.info',10),/authentication/);
  lab.event('authenticate-viewer');
  assert.deepEqual(lab.read('system.info',10),{
    operation:'system.info',source:'synthetic-emulation',authenticatedAs:'synthetic-viewer',rootAccess:'unknown',
    content:{format:'unknown',digest},
  });
  assert.equal(lab.read('system.health',10).content.health,'synthetic-ready');
  assert.throws(()=>lab.read('system.version',10),/operation-denied/);
  assert.throws(()=>lab.read('system.reboot' as any,10),/denied/);
  lab.event('disconnect');
  assert.throws(()=>lab.read('system.health',10),/authentication/);
});

test('synthetic lab cannot transfer scope to a different fixture or bypass expiry', () => {
  const fixture = {kind:'apex.synthetic-router' as const,fixtureId:'lab-router-01',sourceSha256:digest,health:'synthetic-ready' as const,versionLabel:'synthetic-1'};
  assert.throws(()=>new SyntheticRouterLab(passport(),{...fixture,sourceSha256:'b'.repeat(64)},scope()),/mismatch/);
  assert.throws(()=>new SyntheticRouterLab(passport(),fixture,scope({fixtureId:'other'})),/mismatch/);
  const lab = new SyntheticRouterLab(passport(),fixture,scope());
  lab.event('connect'); lab.event('authenticate-viewer');
  assert.throws(()=>lab.read('system.info',30000),/scope-expired/);
});
