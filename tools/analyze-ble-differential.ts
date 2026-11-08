import { openSync, readSync, closeSync, statSync, fstatSync, constants } from 'node:fs';
import { analyzeBleDifferential, MAX_DIFFERENTIAL_CHARACTERS } from '../packages/core/ble-differential.ts';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node tools/analyze-ble-differential.ts <offline-dataset.json>');
  const path = process.argv[2]!;
  // Follow symlinks only to regular files. Check again on the actual descriptor.
  const before = statSync(path);
  if (!before.isFile()) throw new Error('Differential input must be a regular file');
  // O_NONBLOCK prevents a raced-in FIFO from blocking open on platforms supporting it.
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  const bytes = Buffer.alloc(MAX_DIFFERENTIAL_CHARACTERS * 4 + 1);
  let length = 0;
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error('Differential input changed or is not a regular file');
    }
    // Bound bytes before decoding, even if the regular file grows while reading.
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
  } finally { closeSync(fd); }
  if (length === bytes.length) throw new Error('Differential byte limit');
  const document = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  console.log(JSON.stringify(analyzeBleDifferential(document), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid differential dataset');
  process.exitCode = 1;
}
