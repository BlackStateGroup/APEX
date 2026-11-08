import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
function run(preload = '') {
  return spawnSync(process.execPath, ['--permission', `--allow-fs-read=${fileURLToPath(root)}`,
    '--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'tools/demo-offline-lab.ts'],
  { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 16384,
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1',
      npm_config_update_notifier: 'false', npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' } });
}
test('actual CLI IR exact ASCII bytes and independent whole-frame integer oracle', () => {
  const result = run(); assert.equal(result.status, 0, result.stderr);
  const {ir} = JSON.parse(result.stdout);
  const bytes = readFileSync(new URL('./fixtures/offline-lab.ir', import.meta.url));
  assert.equal(bytes.length, 620);
  assert.ok(bytes.every(b => b === 10 || b >= 32 && b <= 126));
  assert.equal(ir.byteCount, bytes.length);
  assert.equal(ir.sourceSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(ir.exactSourceRetained, true);
  assert.deepEqual(ir.declared, { interpretation: 'declared-standard-NEC-fields', address: 33, command: 69 });
  const durations = bytes.toString('ascii').split('\n').find(line => line.startsWith('data: '))!.slice(6).split(' ').map(Number);
  const wire = [0, 0, 0, 0];
  for (let bit = 0; bit < 32; bit++) {
    assert.equal(durations[2 + 2 * bit], 563);
    assert.ok([563, 1688].includes(durations[3 + 2 * bit]!));
    if (durations[3 + 2 * bit] === 1688) wire[bit >> 3]! += 2 ** (bit % 8);
  }
  assert.deepEqual(wire, [33, 222, 69, 186]);
  assert.deepEqual([durations[0], durations[1], durations[66]], [9000, 4500, 563]);
  assert.equal(ir.raw.durationCount, 67);
  assert.deepEqual(ir.raw.recognition, {status:'recognized', decoded:{protocol:'NEC', address:33, command:69, evidence:'offline'}});
  assert.equal(ir.raw.frequencyHz, 38000); assert.equal(ir.raw.dutyCycleDecimal, '0.33');
  assert.equal(ir.raw.carrierMetadata, 'declared-not-measured');
  assert.equal(ir.raw.timingConvention, 'assumed-first-mark-alternating');
  assert.deepEqual(ir.partialRecognition, {status:'not-recognized'});
  assert.equal(ir.repeats, 'not-represented');
  assert.ok(!('durationsUs' in ir.raw));
});
test('actual CLI HCI independent byte offsets, signed integers, hash parity and privacy', () => {
  const result = run(); assert.equal(result.status, 0, result.stderr);
  const {hci} = JSON.parse(result.stdout);
  const bytes = Buffer.from(readFileSync(new URL('./fixtures/offline-lab-hci.hex', import.meta.url), 'utf8').trim(), 'hex');
  assert.equal(bytes.length, 187); assert.equal(hci.byteCount, 187);
  assert.equal(bytes.subarray(0,8).toString('hex'), '6274736e6f6f7000');
  assert.equal(bytes.readUInt32BE(8), 1); assert.equal(bytes.readUInt32BE(12), 1002);
  assert.equal(hci.sourceSha256, createHash('sha256').update(bytes).digest('hex'));
  let offset = 16;
  for (const [i, length] of [22,28,49].entries()) {
    assert.equal(bytes.readUInt32BE(offset), length); assert.equal(bytes.readUInt32BE(offset+4), length);
    assert.equal(bytes.readUInt32BE(offset+8), i === 0 ? 2 : 3);
    assert.equal(bytes.readUInt32BE(offset+12), 0);
    assert.equal(bytes.readBigInt64BE(offset+16), BigInt(-10+i));
    assert.equal(hci.metadata[i].timestampRaw, String(-10+i));
    assert.equal(hci.metadata[i].cumulativeDrops, 0);
    offset += 24+length;
  }
  assert.equal(offset, bytes.length);
  assert.deepEqual(hci.metadata.map((r:any)=>r.classification), ['command-opaque','legacy-advertising-candidate','extended-advertising-uninspected']);
  assert.deepEqual(hci.legacy.reports.map((r:any)=>[r.kind,r.dataHex,r.rssiRaw,r.rssiDbm]),
    [['advertisement','020106',206,-50],['scan-response','',196,-60]]);
  for (const r of hci.legacy.reports) {assert.equal(r.addressDisplay,'01:02:03:04:05:06');assert.equal(r.addressWireHex,'060504030201');}
  const ext = hci.extended;
  assert.equal(ext.dataStatus.offset, 143); assert.equal(ext.dataStatus.raw, 0);
  assert.match(ext.dataStatus.meaning, /last fragment/);
  assert.deepEqual([ext.primaryPhy.raw,ext.secondaryPhy.raw], [3,4]);
  assert.equal(ext.primaryPhy.state,'feature-context-unknown'); assert.equal(ext.secondaryPhy.state,'feature-context-unknown');
  assert.equal(ext.rssi.raw,129); assert.equal(ext.rssi.value,-127);
  assert.equal(ext.txPower.raw,127); assert.equal(ext.txPower.state,'unavailable');
  assert.equal(ext.dataLength,20);
  for (const marker of ['LAB_PRIVATE_OPAQUE','LAB_PRIVATE_EXTENDED']) {
    assert.ok(bytes.includes(Buffer.from(marker))); assert.ok(!result.stdout.includes(marker));
    assert.ok(!result.stdout.includes(Buffer.from(marker).toString('hex')));
  }
  for (const key of ['dataHex','advertising','serviceReadings']) assert.ok(!JSON.stringify(ext).includes('\"' + key + '\":'));
  assert.match(hci.limit,/zero drops does not mean no losses/); assert.match(hci.hashScope,/Full supplied container/);
});
test('late IR and HCI fixture faults produce no stdout with filesystem writes denied', () => {
  for (const [suffix, expression] of [
    ['/tests/fixtures/offline-lab.ir', "value.replace('command: 45', 'command: 46')"],
    ['/tests/fixtures/offline-lab-hci.hex', "value.slice(0,-3) + '00\\n'"]]) {
    const result = run(`import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
      const read = fs.readFileSync; fs.readFileSync = function(path,...args) {
        const value = read.call(this,path,...args);
        return String(path).endsWith('${suffix}') ? ${expression} : value;
      }; syncBuiltinESMExports();`);
    assert.equal(result.status,1,result.stderr); assert.equal(result.stdout,'');
    assert.match(result.stderr,/no success summary emitted/);
  }
});
