/** Node-only offline adapter: bounded read, inert JSON stdout, no writes or device APIs. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readBoundedRegularFile } from './inspect-iq.ts';
import { inspectNfcStatic, serializeNfcStaticReport, NFC_STATIC_SOURCE_LIMIT } from '../packages/core/nfc-static-offline.ts';
import type { NfcStaticContext } from '../packages/core/nfc-static-offline.ts';
export async function inspectNfcStaticCli(args: string[]): Promise<string> {
  const [path, ...flags] = args;
  if (!path || path.startsWith('--')) throw new Error('Explicit input required');
  const options: Record<string,string> = {};
  for (let i=0;i<flags.length;i+=2) {
    const key=flags[i]!, value=flags[i+1];
    if (!['--mode','--provenance','--label'].includes(key) || Object.hasOwn(options,key) || !value || value.startsWith('--')) throw new Error('Invalid options');
    options[key]=value;
  }
  if (Object.keys(options).length !== 3) throw new Error('Explicit context required');
  const bytes = await readBoundedRegularFile(path,NFC_STATIC_SOURCE_LIMIT);
  return serializeNfcStaticReport(await inspectNfcStatic(bytes,{
    mode:options['--mode'],provenance:options['--provenance'],label:options['--label'],
  } as NfcStaticContext,async b=>createHash('sha256').update(b).digest('hex')));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectNfcStaticCli(process.argv.slice(2)).then(report=>process.stdout.write(report+'\n')).catch(()=>{
    console.error('Offline static NFC inspection failed'); process.exitCode=1;
  });
}
