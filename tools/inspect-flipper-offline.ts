/** Local file adapter only. No discovery, outbound protocol operations or writes. */
import { pathToFileURL } from 'node:url';
import { readBoundedRegularFile } from './inspect-iq.ts';
import { FLIPPER_LIMITS, inspectFlipperResponses } from '../packages/core/flipper-offline.ts';
export async function inspectFlipperCli(args: string[]): Promise<string> {
  const [path, flag, provenance] = args;
  if (args.length !== 3 || !path || path.startsWith('-') || /^\w+:/.test(path) || flag !== '--provenance' || !['synthetic', 'imported'].includes(provenance!)) {
    throw new Error('Usage: node tools/inspect-flipper-offline.ts local-file --provenance synthetic|imported');
  }
  const bytes = await readBoundedRegularFile(path, FLIPPER_LIMITS.input);
  const report = inspectFlipperResponses(bytes, { provenance: provenance as 'synthetic' | 'imported' });
  return JSON.stringify({ ...report, originalBytes: Array.from(report.originalBytes) }, null, 2);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectFlipperCli(process.argv.slice(2)).then(report => process.stdout.write(report + '\n')).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Offline inspection failed'); process.exitCode = 1;
  });
}
