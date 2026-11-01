import { spawn } from 'node:child_process';
import { mkdtemp, rename, rmdir, access } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2];
if (!['ios', 'android'].includes(platform)) throw new Error('Expected ios or android');
const source = join(root, 'research/upstream-sources');
let parking;
// Expo prebuild renames matching app.json files recursively, including reference
// fixtures. Park the corpus outside the app root, then always restore it.
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'node_modules/expo/bin/cli'), ...args], { cwd: root, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Expo exited ${code ?? signal}`)));
  });
}
try {
  try { await access(source); parking = await mkdtemp(join(dirname(root), 'apex-source-parking-')); await rename(source, join(parking, 'upstream-sources')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await run(['prebuild', '--platform', platform, '--no-install']);
} finally {
  if (parking) { await rename(join(parking, 'upstream-sources'), source); await rmdir(parking); }
}
if (!process.argv.includes('--prebuild-only')) await run([`run:${platform}`]);
