/** Offline CLI for the exact mobile replay/learning code; no network or device I/O. */
import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { replayPairedObservations, learnPairedProfile, PAIRED_LIMIT } from '../packages/core/paired-observations.ts';
const [mode, path, ...extra] = process.argv.slice(2);
if (!path || extra.length || !['replay', 'learn'].includes(mode!)) throw new Error('Usage: node tools/inspect-paired-observations.ts replay|learn DATASET.json');
const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
let bytes: Buffer;
try {
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.size < 1 || stat.size > PAIRED_LIMIT) throw new Error('Select a regular UTF-8 dataset no larger than 65536 bytes');
  const buffer = Buffer.alloc(stat.size + 1); let count = 0, read;
  while (count < buffer.length && (read = readSync(fd, buffer, count, buffer.length - count, null)) > 0) count += read;
  if (count !== stat.size) throw new Error('Dataset size changed during read');
  bytes = buffer.subarray(0, count);
} finally { closeSync(fd); }
const document = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const result = mode === 'replay' ? replayPairedObservations(document) : learnPairedProfile(document, createHash('sha256').update(bytes).digest('hex'));
console.log(JSON.stringify(result, null, 2));
