import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const lockText = readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
const lock = JSON.parse(lockText);
const inventory = {
  schemaVersion: 1,
  method: 'package-lock.json declarations; not a selected-file licence audit',
  lockfileSha256: createHash('sha256').update(lockText).digest('hex'),
  packages: Object.entries(lock.packages).filter(([path]) => path).map(([path, item]) => ({
    path, version: item.version ?? null, licence: item.license ?? 'NOASSERTION',
    developmentOnly: item.dev === true, optional: item.optional === true,
    integrity: item.integrity ?? null,
  })),
};
const output = JSON.stringify(inventory, null, 2) + '\n';
const target = new URL('../research/npm-dependencies.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Dependency inventory is stale; run npm run inventory');
} else writeFileSync(target, output);
console.log(`Verified inventory of ${inventory.packages.length} locked dependency entries.`);
