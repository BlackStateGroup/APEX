import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
function retained(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'apex-rea-verifier-'));
  try {
    const unzip = spawnSync('python3', ['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', resolve('review-evidence/rea-full-engine/evidence.zip'), directory]);
    assert.equal(unzip.status, 0); return fn(directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const verify = directory => spawnSync(process.execPath, ['tools/verify-full-engine.mjs', directory], { encoding: 'utf8' });
test('independent verifier checks all retained files, six functions and 260 CRC16 vectors without executing targets', () => retained(directory => {
  const result = verify(directory); assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).crc16VectorsVerified, 260);
}));
test('changed original binary is rejected', () => retained(directory => {
  const path = join(directory, 'original.elf'), bytes = readFileSync(path); bytes[500] ^= 1; writeFileSync(path, bytes);
  assert.notEqual(verify(directory).status, 0);
}));
test('changed pseudocode cannot pass a retained evidence digest', () => retained(directory => {
  const path = join(directory, 'apex_crc16.c'); writeFileSync(path, readFileSync(path, 'utf8').replace('0x1021', '0x1023'));
  assert.notEqual(verify(directory).status, 0);
}));
test('manifest paths cannot escape the evidence directory', () => retained(directory => {
  const path = join(directory, 'REPORT.json'), report = JSON.parse(readFileSync(path, 'utf8'));
  report.files[0].file = '../outside'; writeFileSync(path, JSON.stringify(report));
  const result = verify(directory); assert.notEqual(result.status, 0); assert.match(result.stderr, /Invalid retained path/);
}));
