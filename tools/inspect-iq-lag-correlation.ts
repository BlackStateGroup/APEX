/** Node-only, bounded local file adapter. No discovery, acquisition or writes. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { IQ_DATA_LIMIT, IQ_METADATA_LIMIT, prepareIq } from '../packages/core/iq-offline.ts';
import { analyzeIqLagCorrelation } from '../packages/core/iq-lag-correlation.ts';
import { readBoundedRegularFile } from './inspect-iq.ts';

export async function inspectIqLagCorrelationCli(args: string[]): Promise<string> {
  const [metadataPath, dataPath, ...flags] = args;
  const names = ['--window-samples', '--start-sample', '--first-lag', '--lag-step', '--lag-count'];
  if (!metadataPath || !dataPath || metadataPath.startsWith('--') || dataPath.startsWith('--') || flags.length !== 10) {
    throw new Error('Usage: node tools/inspect-iq-lag-correlation.ts metadata-file data-file --window-samples N --start-sample M --first-lag L --lag-step S --lag-count C');
  }
  const values = new Map<string, string>();
  for (let k = 0; k < flags.length; k += 2) {
    const flag = flags[k]!, value = flags[k + 1]!;
    if (!names.includes(flag) || values.has(flag) || !/^[0-9]{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid or duplicate CLI option');
    values.set(flag, value);
  }
  const metadata = await readBoundedRegularFile(metadataPath, IQ_METADATA_LIMIT);
  const data = await readBoundedRegularFile(dataPath, IQ_DATA_LIMIT);
  const recording = await prepareIq(metadata, data, {
    schemaVersion: 1, origin: 'external-file', importedAt: new Date().toISOString(),
  }, { digest: async (algorithm, bytes) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex') });
  return JSON.stringify(analyzeIqLagCorrelation(recording, {
    startSample: Number(values.get('--start-sample')), windowSamples: Number(values.get('--window-samples')),
    firstLag: Number(values.get('--first-lag')), lagStep: Number(values.get('--lag-step')), lagCount: Number(values.get('--lag-count')),
  }), null, 2);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectIqLagCorrelationCli(process.argv.slice(2)).then(report => { process.stdout.write(report + '\n'); }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Offline lag-correlation inspection failed'); process.exitCode = 1;
  });
}
