/** Read-only local adapter. No device discovery, writes, transmission or replay. */
import { pathToFileURL } from 'node:url';
import { basename } from 'node:path';
import { readBoundedRegularFile } from './inspect-iq.ts';
import { inspectIrFile, IR_LIMITS, type IrContext } from '../packages/core/ir-offline.ts';
export async function inspectIrCli(args: string[]): Promise<string> {
  const [path, flag, provenance] = args;
  if (args.length !== 3 || !path || path.startsWith('-') || /^\w+:/.test(path) || flag !== '--provenance' ||
      (provenance !== 'synthetic-fixture' && provenance !== 'recorded-import')) {
    throw new Error('Usage: node tools/inspect-ir-offline.ts local.ir --provenance synthetic-fixture|recorded-import');
  }
  const context: IrContext = { provenance, sourceLabel: basename(path) };
  const bytes = await readBoundedRegularFile(path, IR_LIMITS.bytes);
  const result = JSON.stringify(await inspectIrFile(bytes, context), null, 2);
  if (Buffer.byteLength(result + '\n') > IR_LIMITS.output) throw new Error('IR output budget exceeded');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectIrCli(process.argv.slice(2)).then(report => process.stdout.write(report + '\n')).catch(() => {
    console.error('Offline IR inspection rejected input; see docs/IR_OFFLINE.md for the accepted subset.'); process.exitCode = 1;
  });
}
