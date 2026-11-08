// Read-only against the supplied dependency. Applies only in a disposable temp fixture.
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const sourceHash = '6ad0e48dd16c6587c279d81d06eb5553c0c9e135df4c653a91c8d8abf9990207';
export const patchPath = fileURLToPath(new URL('../docs/proposals/react-native-ble-plx-3.5.1-ios-destroy-ack.UNAPPLIED.patch', import.meta.url));
export function verifySource(source, version) {
  if (version !== '3.5.1') throw new Error('Unsupported BLE PLX version');
  if (createHash('sha256').update(source).digest('hex') !== sourceHash) {
    throw new Error('BLE PLX source hash mismatch; review rather than force patch');
  }
}
export function checkProposal(dependencyRoot) {
  const source = readFileSync(join(dependencyRoot, 'ios/BlePlx.m'));
  verifySource(source, JSON.parse(readFileSync(join(dependencyRoot, 'package.json'))).version);
  const temporary = mkdtempSync(join(tmpdir(), 'apex-ios-ack-'));
  try {
    mkdirSync(join(temporary, 'ios'));
    writeFileSync(join(temporary, 'ios/BlePlx.m'), source);
    execFileSync('git', ['apply', '--check', patchPath], { cwd: temporary });
    execFileSync('git', ['apply', patchPath], { cwd: temporary });
    return readFileSync(join(temporary, 'ios/BlePlx.m'), 'utf8');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Pass the installed react-native-ble-plx directory');
  checkProposal(resolve(process.argv[2]));
  console.log('PASS: exact source hash and temporary-fixture application. Installed files unchanged. Not compiled or native accepted.');
}
