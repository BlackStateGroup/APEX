import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, truncateSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inspectFirmwareBytes, detectFirmwareFormat, compareFirmwareReports } from '../tools/device-intelligence/inspect-firmware.mjs';

const digest = data => createHash('sha256').update(data).digest('hex');
const sample = (string = 'plain firmware test') => {
  const data = Buffer.alloc(256);
  data.write(string,0,'ascii');
  return data;
};

test('static firmware report preserves exact bytes, excludes secrets and cannot declare root', () => {
  const password = 'password=ULTRA_PRIVATE_TEST_FIXTURE';
  const bytes = sample('dropbear uhttpd ' + password);
  const original = Buffer.from(bytes);
  const result = inspectFirmwareBytes(bytes,'owned-router.bin');
  assert.equal(result.passport.source.sha256,digest(bytes));
  assert.deepEqual(bytes,original);
  assert.equal(result.passport.source.bytes,256);
  assert.equal(result.passport.source.format,'unknown');
  assert.deepEqual(result.passport.indicators,{
    sshConfigurationMarker:true, credentialConfigurationMarker:true, webManagementMarker:true,
  });
  assert.equal(result.passport.access.root,'unknown');
  assert.equal(result.inspection.firmwareExecuted,false);
  assert.equal(result.inspection.networkOrHardwareContact,false);
  assert.equal(JSON.stringify(result).includes('ULTRA_PRIVATE_TEST_FIXTURE'),false);
});

test('firmware format recognition is bounded and does not decompress', () => {
  const fixtures = [
    [Buffer.from([0x7f,0x45,0x4c,0x46]),'elf'],
    [Buffer.from([0x27,0x05,0x19,0x56]),'uimage'],
    [Buffer.from('hsqs'),'squashfs'],
    [Buffer.from([0x1f,0x8b,8]),'gzip'],
    [Buffer.from([0x50,0x4b,3,4]),'zip'],
  ];
  for (const [magic,format] of fixtures) {
    const bytes = sample(); magic.copy(bytes,0);
    assert.equal(detectFirmwareFormat(bytes),format);
    const report = inspectFirmwareBytes(bytes);
    assert.equal(report.passport.source.format,format);
    if (['gzip','zip','squashfs'].includes(format)) assert.equal(report.inspection.decompressed,false);
  }
  assert.throws(()=>inspectFirmwareBytes(Buffer.alloc(15)),/16 bytes/);
  assert.throws(()=>inspectFirmwareBytes(Buffer.alloc(67108865)),/64 MiB/);
  assert.throws(()=>inspectFirmwareBytes(Buffer.alloc(32),'../bad'),/Unsafe/);
  assert.throws(()=>inspectFirmwareBytes(Buffer.alloc(32),'line\nbad'),/Unsafe/);
});

function tarEntry(path, type='0', size=0) {
  const header = Buffer.alloc(512);
  header.write(path,0,Math.min(Buffer.byteLength(path),100),'utf8');
  header.write(size.toString(8).padStart(11,'0')+'\0',124,'ascii');
  header[156] = type.charCodeAt(0);
  header.write('ustar',257,'ascii');
  return header;
}
test('archive safety inventory does not extract or expose potentially dangerous tar filenames', () => {
  const tar = Buffer.concat([tarEntry('../confidential'),tarEntry('rootfs/etc/passwd'),Buffer.alloc(1024)]);
  const report = inspectFirmwareBytes(tar,'owned.tar');
  assert.equal(report.passport.source.format,'tar');
  assert.deepEqual(report.archive,{entriesExamined:2,unsafeEntryIndicators:1,incomplete:false});
  assert.equal(JSON.stringify(report).includes('../confidential'),false);
  const symlink = Buffer.concat([tarEntry('ln','2'),Buffer.alloc(1024)]);
  assert.equal(inspectFirmwareBytes(symlink).archive.unsafeEntryIndicators,1);
  const bad = Buffer.concat([tarEntry('truncated','0',2048)]);
  assert.equal(inspectFirmwareBytes(bad).archive.incomplete,true);
});

test('difference reports are source-specific and never claim security patch or root', () => {
  const a = inspectFirmwareBytes(sample('clean'));
  const b = inspectFirmwareBytes(sample('dropbear passwd'));
  const changed = compareFirmwareReports(a,b);
  assert.equal(changed.sameBytes,false);
  assert.ok(changed.changedIndicatorClasses.includes('sshConfigurationMarker'));
  assert.equal(changed.rootAccess,'unknown');
  assert.match(changed.limitations,/do not establish/);
  assert.equal(compareFirmwareReports(a,a).sameBytes,true);
  assert.throws(()=>compareFirmwareReports({kind:'fake'},b));
});

test('read-only CLI preserves source bytes and refuses to overwrite historical evidence', () => {
  const directory = mkdtempSync(join(tmpdir(),'apex-device-passport-'));
  const cli = new URL('../tools/device-intelligence/inspect-firmware.mjs',import.meta.url);
  try {
    const input=join(directory,'firmware file; literal.bin'),output=join(directory,'passport.json');
    const bytes=sample('passive test passwd'); writeFileSync(input,bytes);
    const run = (...args) => spawnSync(process.execPath,[cli.pathname,...args],{encoding:'utf8',timeout:10000});
    const result=run(input,output);
    assert.equal(result.status,0,result.stderr);
    const report=JSON.parse(readFileSync(output,'utf8'));
    assert.equal(report.passport.source.sha256,digest(bytes));
    assert.equal(report.passport.access.root,'unknown');
    assert.equal(JSON.parse(result.stdout).targetExecuted,false);
    assert.deepEqual(readFileSync(input),bytes);
    const second=run(input,output);
    assert.notEqual(second.status,0);
    assert.match(second.stderr,/EEXIST/);
    assert.equal(JSON.parse(readFileSync(output,'utf8')).passport.source.sha256,digest(bytes));
    for (const args of [[],[input],[input,output,'--not-an-option','x']]) assert.notEqual(run(...args).status,0);
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('CLI rejects nonregular, tiny, giant, and symlinked input without report publication', () => {
  const directory = mkdtempSync(join(tmpdir(),'apex-device-bounds-'));
  const cli = new URL('../tools/device-intelligence/inspect-firmware.mjs',import.meta.url);
  const run = input => spawnSync(process.execPath,[cli.pathname,input,join(directory,'report.json')],{encoding:'utf8',timeout:10000});
  try {
    const small=join(directory,'small'),big=join(directory,'big'),link=join(directory,'link');
    writeFileSync(small,'tiny'); writeFileSync(big,''); truncateSync(big,67108865);
    symlinkSync(small,link);
    for (const input of [small,big,link,directory]) {
      const result=run(input);
      assert.notEqual(result.status,0);
      assert.equal(existsSync(join(directory,'report.json')),false);
    }
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('optional REA report cannot be applied to wrong firmware or invented provider', () => {
  const directory=mkdtempSync(join(tmpdir(),'apex-device-rea-'));
  const cli=new URL('../tools/device-intelligence/inspect-firmware.mjs',import.meta.url);
  try {
    const input=join(directory,'fake.elf'),out=join(directory,'out.json'),rea=join(directory,'rea.json');
    const bytes=sample(); Buffer.from([0x7f,69,76,70]).copy(bytes,0);
    writeFileSync(input,bytes);
    const fixture=readFileSync(new URL('../src/fixtures/rea-elf-notes.json',import.meta.url));
    writeFileSync(rea,fixture);
    const result=spawnSync(process.execPath,[cli.pathname,input,out,'--rea-report',rea],{encoding:'utf8',timeout:10000});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/digest|length/);
    assert.equal(existsSync(out),false);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
