/** Local, read-only CLI prototype. No upstream code, radio, network, output files or implicit file discovery. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { importMayhemC8, MAYHEM_C8_LIMITS } from '../packages/core/mayhem-c8-import.ts';
import { analyzeIq } from '../packages/core/iq-analysis.ts';
import { readBoundedRegularFile } from './inspect-iq.ts';

export async function inspectMayhemC8Cli(args: string[]): Promise<string> {
  const [dataPath, sidecarPath] = args;
  if (args.length !== 2 || !dataPath || !sidecarPath || dataPath.startsWith('--') || sidecarPath.startsWith('--')) {
    throw new Error('Usage: node tools/inspect-mayhem-c8.ts explicit-data-file explicit-sidecar-file');
  }
  const data = await readBoundedRegularFile(dataPath, MAYHEM_C8_LIMITS.dataBytes);
  const sidecar = await readBoundedRegularFile(sidecarPath, MAYHEM_C8_LIMITS.sidecarBytes);
  const imported = await importMayhemC8(data, sidecar, { schemaVersion: 1, origin: 'external-file', importedAt: new Date().toISOString() }, {
    digest: async (algorithm, bytes) => createHash(algorithm === 'SHA-256' ? 'sha256' : 'sha512').update(bytes).digest('hex'),
  });
  return JSON.stringify({ kind: 'mayhem-c8-import-report', ...imported, analysis: analyzeIq(imported.recording) }, null, 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectMayhemC8Cli(process.argv.slice(2)).then(report => process.stdout.write(report + '\n')).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Mayhem C8 inspection failed'); process.exitCode = 1;
  });
}
