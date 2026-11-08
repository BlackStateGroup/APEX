import { openSync, readSync, closeSync, lstatSync, fstatSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseBoundedJson } from '../packages/core/bounded-json.ts';
import { createEvidenceBundle, readEvidenceBundle, MAX_BUNDLE_CHARACTERS } from '../packages/core/evidence-bundle.ts';

/** Local bounded regular files only. Never writes a file or reads a journal. */
function readLocal(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path === '-') throw new Error('Expected local regular file path');
  const before = lstatSync(path);
  if (!before.isFile()) throw new Error('Input must be a regular file, not a symlink');
  const limit = MAX_BUNDLE_CHARACTERS * 4;
  if (before.size > limit) throw new Error('Input byte limit');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
  const bytes = Buffer.alloc(limit + 1);
  let length = 0;
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) throw new Error('Input changed or is not a regular file');
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    const after = fstatSync(fd);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw new Error('Input changed during read');
  } finally { closeSync(fd); }
  if (length > limit) throw new Error('Input byte limit');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
}
const sha256 = async (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const sha256Bytes = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
try {
  const [mode, path, exportedAt] = process.argv.slice(2);
  if (!path || !((mode === 'create' && process.argv.length === 5) || (mode === 'preview' && process.argv.length === 4))) {
    throw new Error('Usage: node tools/evidence-bundle.ts create <selected-record-strings.json> <ISO-UTC-exportedAt> | preview <bundle.json>');
  }
  const document = readLocal(path);
  const output = mode === 'create'
    ? await createEvidenceBundle(parseBoundedJson(document, MAX_BUNDLE_CHARACTERS, 1) as string[], exportedAt!, sha256, sha256Bytes)
    : JSON.stringify(await readEvidenceBundle(document, sha256, sha256Bytes));
  process.stdout.write(output + '\n');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid evidence bundle');
  process.exitCode = 1;
}
