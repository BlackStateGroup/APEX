/** Node-only adapter: exactly two explicit local files, no discovery or writes. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { IQ_DATA_LIMIT, IQ_METADATA_LIMIT, prepareIq } from '../packages/core/iq-offline.ts';
import { analyzeIqTimeFrequency } from '../packages/core/iq-analysis.ts';
import type { IqTimeFrequencyOptions } from '../packages/core/iq-analysis.ts';
import { readBoundedRegularFile } from './inspect-iq.ts';

export async function inspectIqTimeFrequencyCli(args: string[]): Promise<string> {
  const [metadataPath, dataPath, ...flags] = args;
  const names = ['--fft-size', '--start-sample', '--hop-samples', '--frame-count'];
  if (!metadataPath || !dataPath || metadataPath.startsWith('--') || dataPath.startsWith('--') || flags.length !== 8) {
    throw new Error('Usage: node tools/inspect-iq-time-frequency.ts metadata-file data-file --fft-size N --start-sample M --hop-samples H --frame-count F');
  }
  const values = new Map<string, number>();
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i]!, value = flags[i + 1]!;
    if (!names.includes(flag) || values.has(flag) || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new Error('Invalid or duplicate CLI option');
    }
    values.set(flag, Number(value));
  }
  const metadata = await readBoundedRegularFile(metadataPath, IQ_METADATA_LIMIT);
  const data = await readBoundedRegularFile(dataPath, IQ_DATA_LIMIT);
  const recording = await prepareIq(metadata, data, {
    schemaVersion: 1, origin: 'external-file', importedAt: new Date().toISOString(),
  }, { digest: async (algorithm, bytes) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex') });
  return JSON.stringify(analyzeIqTimeFrequency(recording, {
    fftSize: values.get('--fft-size') as IqTimeFrequencyOptions['fftSize'],
    startSample: values.get('--start-sample')!, hopSamples: values.get('--hop-samples')!, frameCount: values.get('--frame-count')!,
  }), null, 2);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectIqTimeFrequencyCli(process.argv.slice(2)).then(report => { process.stdout.write(report + '\n'); }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Offline time-frequency inspection failed'); process.exitCode = 1;
  });
}
