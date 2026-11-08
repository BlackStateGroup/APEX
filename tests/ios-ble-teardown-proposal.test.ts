import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkProposal, patchPath, verifySource } from '../tools/check-ios-ble-teardown-proposal.mjs';

const dependency = resolve(process.env.BLE_PLX_SOURCE_DIR ?? 'node_modules/react-native-ble-plx');
const available = existsSync(resolve(dependency, 'ios/BlePlx.m'));

test('proposal is inert and declares a promise export using the original helper', () => {
  const patch = readFileSync(patchPath, 'utf8');
  assert.match(patch, /RCT_REMAP_METHOD\(destroyClient,/);
  assert.match(patch, /destroyClientWithResolver:\(RCTPromiseResolveBlock\)resolve\n\+\s+rejecter:\(RCTPromiseRejectBlock\)reject/);
  assert.match(patch, /\[self destroyClient\];\n\+\s+resolve\(nil\);/);
  assert.match(patch, /\+\- \(void\)destroyClient/);
  assert.doesNotMatch(patch, /dispatch_async|dispatch_sync|setValue:|moduleForName/);
});

test('guard refuses unsupported versions and changed fixture bytes', () => {
  assert.throws(() => verifySource(Buffer.from('fixture'), '3.5.2'), /Unsupported/);
  assert.throws(() => verifySource(Buffer.from('fixture'), '3.5.1'), /hash mismatch/);
});

test('exact pinned source accepts temporary patch and preserves nil-safe invalidation helper', { skip: !available }, () => {
  const path = resolve(dependency, 'ios/BlePlx.m');
  const before = readFileSync(path);
  const patched = checkProposal(dependency);
  assert.match(patched, /- \(void\)destroyClient \{\n    \[_manager invalidate\];\n    _manager = nil;\n\}/);
  assert.match(patched, /- \(void\)invalidate \{\n    \[self destroyClient\];\n\}/);
  assert.equal((patched.match(/RCT_REMAP_METHOD\(destroyClient,/g) ?? []).length, 1);
  assert.doesNotMatch(patched, /RCT_EXPORT_METHOD\(destroyClient\)/);
  assert.deepEqual(readFileSync(path), before);
  assert.throws(() => verifySource(Buffer.concat([before, Buffer.from('\n')]), '3.5.1'), /hash mismatch/);
});
