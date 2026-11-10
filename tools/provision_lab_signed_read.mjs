#!/usr/bin/env node
// Offline generation only. Never opens a device, flashes or imports a seed.
import { randomBytes, createPrivateKey, createPublicKey } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [ack, output, label, ...extra] = process.argv.slice(2);
if (ack !== '--generate-new-lab-key' || !output || !/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,63}$/.test(label ?? '') || extra.length) {
  console.error('Usage: node tools/provision_lab_signed_read.mjs --generate-new-lab-key NEW_PRIVATE_DIRECTORY "Lab label"');
  process.exit(2);
}
// Exclusive directory creation refuses replacement and symlink destinations.
const directory = resolve(output);
mkdirSync(directory, { mode: 0o700 });
const seed = randomBytes(32);
const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
const image = Buffer.alloc(4096, 0xff);
try {
  const key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);
  image.write('APEXLAB1', 0, 'ascii'); seed.copy(image, 8); publicKey.copy(image, 40);
  writeFileSync(join(directory, 'lab-key-partition.bin'), image, { mode: 0o600, flag: 'wx' });
  writeFileSync(join(directory, 'public-key.json'), JSON.stringify({
    format: 'APEX-LAB-KEY-V1', label, algorithm: 'Ed25519', publicKeyHex: publicKey.toString('hex'),
    scope: 'owned-or-authorized-lab-only', createdAt: new Date().toISOString(),
    warning: 'Confirm this full public key out of band. No hardware has been provisioned. The partition image contains a plaintext lab private key.',
  }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log('Created offline lab key image and public-key.json; no hardware accessed.');
} finally {
  seed.fill(0); der.fill(0); image.fill(0);
  // Node/OpenSSL key objects are managed memory; no guaranteed complete erasure.
}
