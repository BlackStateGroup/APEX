/** Node-only adapter. No discovery, metadata URL following, or writes. */
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { IQ_DATA_LIMIT, IQ_METADATA_LIMIT, prepareIq } from '../packages/core/iq-offline.ts';
import type { IqAnalysisOptions } from '../packages/core/iq-analysis.ts';
import { analyzeIq } from '../packages/core/iq-analysis.ts';

export async function readBoundedRegularFile(path: string, limit: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > IQ_DATA_LIMIT) throw new Error('Invalid read limit');
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.size < 1n || before.size > BigInt(limit)) throw new Error('Input must be a bounded, nonempty regular file (not a symlink)');
  // O_NONBLOCK avoids hanging if the path is exchanged for a FIFO before open.
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await handle.stat({ bigint: true });
    const same = (a: typeof before, b: typeof before) => a.isFile() && b.isFile() &&
      a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
    if (!same(before, opened)) throw new Error('Input changed before open');
    const bytes = new Uint8Array(limit + 1);
    let count = 0;
    while (count < bytes.length) {
      const result = await handle.read(bytes, count, bytes.length - count, count);
      if (result.bytesRead === 0) break;
      count += result.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const pathAfter = await lstat(path, { bigint: true });
    if (count > limit || BigInt(count) !== opened.size || !same(opened, after) || !same(after, pathAfter)) throw new Error('Input changed during read or exceeds byte limit');
    return bytes.slice(0, count);
  } finally { await handle.close(); }
}
export async function inspectIqCli(args: string[]): Promise<string> {
  const [metadataPath, dataPath, ...flags] = args;
  if (!metadataPath || !dataPath || metadataPath.startsWith('--') || dataPath.startsWith('--')) throw new Error('Usage: node tools/inspect-iq.ts metadata-file data-file [--fft-size N] [--start-sample M]');
  const options: IqAnalysisOptions = {};
  const seen = new Set<string>();
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i]!; const value = flags[i + 1];
    if (!['--fft-size', '--start-sample'].includes(flag) || seen.has(flag) || !value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid or duplicate CLI option');
    seen.add(flag);
    if (flag === '--fft-size') {
      if (![256, 512, 1024, 2048, 4096].includes(Number(value))) throw new Error('Unsupported FFT size');
      options.fftSize = Number(value) as IqAnalysisOptions['fftSize'];
    } else options.startSample = Number(value);
  }
  const metadata = await readBoundedRegularFile(metadataPath, IQ_METADATA_LIMIT);
  const data = await readBoundedRegularFile(dataPath, IQ_DATA_LIMIT);
  const recording = await prepareIq(metadata, data, { schemaVersion: 1, origin: 'external-file', importedAt: new Date().toISOString() }, {
    digest: async (algorithm, bytes) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex'),
  });
  return JSON.stringify({ ...recording, analysis: analyzeIq(recording, options) }, null, 2);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectIqCli(process.argv.slice(2)).then(report => { process.stdout.write(report + '\n'); }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Offline inspection failed'); process.exitCode = 1;
  });
}
