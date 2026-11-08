import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
function cli(preload = '', args: string[] = []) {
  return spawnSync(process.execPath, ['--permission', `--allow-fs-read=${fileURLToPath(root)}`,
    '--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'tools/demo-offline-lab.ts', ...args],
  { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 16384,
    env: {...process.env, CI:'1', EXPO_OFFLINE:'1', EXPO_NO_TELEMETRY:'1', npm_config_update_notifier:'false',
      npm_config_offline:'true', npm_config_audit:'false', npm_config_fund:'false'} });
}
const failure = (r: ReturnType<typeof cli>) => {
  assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'Offline synthetic walkthrough failed; no success summary emitted. Check fixtures and invariants.\n');
};
test('independent exact CLI identity and original-stage byte preservation', () => {
  const a = cli(), b = cli();
  assert.equal(a.status, 0, a.stderr); assert.equal(a.stderr, ''); assert.equal(b.stdout, a.stdout);
  assert.equal(Buffer.byteLength(a.stdout), 8806);
  assert.equal(hash(a.stdout), 'dfe1ae0ab01718192b652df1592af25b4294e64b013716ed26bb4926228b7504');
  const report = JSON.parse(a.stdout);
  assert.equal(report.demonstrationTime, '2026-11-08T00:00:00.000Z');
  delete report.ir; delete report.hci;
  const original = JSON.stringify(report) + '\n';
  assert.equal(Buffer.byteLength(original), 5796);
  assert.equal(hash(original), 'a3d5a315c053b80d7c7fa4a5c62aa2d67b2a6316dcef9087f3a8eabe2ec35b82');
});
test('independent NEC bit ordering, complements and precise fixture bytes', () => {
  const source = readFileSync(new URL('./fixtures/offline-lab.ir', import.meta.url));
  assert.equal(source.length,620);
  assert.equal(hash(source),'ad4e575f80a6ea6a5fba8b1ae97dba33b76d799a378fae33e5f0710f91d1cfbe');
  const lines = source.toString('ascii').split('\n').filter(x=>x.startsWith('data: '));
  const pulses = lines[0]!.slice(6).split(' ').map(Number);
  // Construct expectations from four literal wire octets, independently of decoder.
  const expected = [9000,4500];
  for (const octet of [0x21,0xde,0x45,0xba]) for(let bit=0;bit<8;bit++) expected.push(563, octet & (1<<bit) ? 1688 : 563);
  expected.push(563); assert.deepEqual(pulses,expected); assert.equal(lines[1], 'data: 9000 4500 563');
  const ir = JSON.parse(cli().stdout).ir;
  assert.equal(ir.raw.timingConvention,'assumed-first-mark-alternating');
  assert.equal(ir.raw.carrierMetadata,'declared-not-measured'); assert.equal(ir.repeats,'not-represented');
  assert.match(ir.limit,/conditional on the entire alternating duration array/);
});
test('independent HCI exact source and scalar offsets refer to container bytes', () => {
  const bytes = Buffer.from(readFileSync(new URL('./fixtures/offline-lab-hci.hex', import.meta.url),'utf8').trim(),'hex');
  assert.equal(hash(bytes),'74bf92435f18f046cda23b068a75212967994bd54eff48c9d6268ad561ccefd7');
  assert.equal(bytes.length,187);
  // Header/payload starts are independently derived: 16+24+22=62; 62+24+28=114.
  assert.deepEqual([bytes[40],bytes[86],bytes[138]],[1,4,4]);
  assert.deepEqual([...bytes.subarray(91,104)],[0,0,6,5,4,3,2,1,3,2,1,6,206]);
  assert.deepEqual([...bytes.subarray(104,114)],[4,0,6,5,4,3,2,1,0,196]);
  const hci = JSON.parse(cli().stdout).hci;
  for(const key of ['dataStatus','primaryPhy','secondaryPhy','txPower','rssi']) {
    const scalar = hci.extended[key];
    assert.equal(scalar.raw, scalar.length === 2 ? bytes.readUInt16LE(scalar.offset) : bytes[scalar.offset]);
  }
  assert.deepEqual([hci.extended.dataStatus.offset,hci.extended.primaryPhy.offset,hci.extended.secondaryPhy.offset,
    hci.extended.txPower.offset,hci.extended.rssi.offset],[143,152,153,155,156]);
  assert.equal(bytes[166],20); assert.equal(bytes.subarray(167).toString(),'LAB_PRIVATE_EXTENDED');
  assert.equal(hci.legacy.sourceKind,'offline-hci-legacy-advertising-event');
  assert.equal(hci.extended.sourceKind,'offline-hci-extended-advertising-metadata');
});
test('no-argument contract rejects every supplied argument before fixture reads', () => {
  for(const arg of ['--help','--','tests/fixtures/offline-lab.ir','']) failure(cli(`import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    const read=fs.readFileSync; fs.readFileSync=function(path,...args){
      if(String(path).includes('/fixtures/')) process.exit(97); return read.call(this,path,...args);}; syncBuiltinESMExports();`,[arg]));
});
test('late IR/HCI digest mismatches, serialization, and output bound fail atomically', () => {
  for(const digest of ['ad4e575f80a6ea6a5fba8b1ae97dba33b76d799a378fae33e5f0710f91d1cfbe',
    '74bf92435f18f046cda23b068a75212967994bd54eff48c9d6268ad561ccefd7']) {
    failure(cli(`import crypto from 'node:crypto'; import {syncBuiltinESMExports} from 'node:module';
      const make=crypto.createHash; crypto.createHash=function(...args){const h=make(...args), d=h.digest;
      h.digest=function(...args){const value=d.apply(this,args); return value==='${digest}' ? '0'.repeat(64):value;}; return h;}; syncBuiltinESMExports();`));
  }
  for(const body of ["throw Error('late serialize')", "return 'x'.repeat(12288)"]) failure(cli(`const s=JSON.stringify;
    JSON.stringify=function(v,...args){if(v?.mode==='offline-synthetic-lab'){${body}}return s(v,...args);};`));
});

test('one final stdout write and exactly five fixed fixture reads under write denial', () => {
  const result = cli(`import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    let writes=0; const paths=[]; const read=fs.readFileSync; const write=process.stdout.write;
    process.stdout.write=function(...args){writes++; return write.apply(this,args);};
    fs.readFileSync=function(path,...args){if(String(path).includes('/fixtures/')) paths.push(String(path).split('/').pop()); return read.call(this,path,...args);};
    syncBuiltinESMExports(); process.on('exit',()=>{if(writes!==1 || JSON.stringify(paths)!==JSON.stringify([
      'ble-differential.json','ble-field-hypothesis.json','ndef-text.json','offline-lab.ir','offline-lab-hci.hex'])) process.exitCode=97;});`);
  assert.equal(result.status,0,result.stderr); assert.equal(result.stderr,'');
  assert.equal(Buffer.byteLength(result.stdout),8806);
});

test('strict HCI hex fixture rejects ignored suffixes and odd nibble before decoding', () => {
  for(const suffix of ['junk','f','  ','\n00','\n','\r']) {
    failure(cli(`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
      const read=fs.readFileSync;fs.readFileSync=function(path,...args){const v=read.call(this,path,...args);
      return String(path).endsWith('/tests/fixtures/offline-lab-hci.hex') ? v.trim()+${JSON.stringify(suffix + '\n')}:v;};syncBuiltinESMExports();`));
  }
});
