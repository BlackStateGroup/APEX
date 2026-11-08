/** Read-only, explicit selected-event document verification. No persistence or acquisition. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readBoundedRegularFile } from './inspect-iq.ts';
import { HCI_LEGACY_DOCUMENT_LIMIT, HCI_OUTPUT_LIMIT, readHciLegacyEventDocument } from '../packages/core/hci-offline.ts';

export async function inspectHciSelectedCli(args: string[]): Promise<string> {
  if (args.length !== 1 || !args[0] || args[0].startsWith('-')) throw new Error('Usage: inspect-hci-selected.ts file');
  // At most three UTF-8 bytes per UTF-16 code unit. The core separately limits decoded text.
  const bytes = await readBoundedRegularFile(args[0], HCI_LEGACY_DOCUMENT_LIMIT * 3);
  // ignoreBOM means preserve U+FEFF so the strict JSON parser rejects it.
  const document = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const result = await readHciLegacyEventDocument(document, async data => createHash('sha256').update(data).digest('hex'));
  const output = JSON.stringify(result, null, 2);
  if (new TextEncoder().encode(output + '\n').length > HCI_OUTPUT_LIMIT) throw new Error('Output limit');
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectHciSelectedCli(process.argv.slice(2)).then(report => process.stdout.write(report + '\n')).catch(() => {
    console.error('Offline HCI selected-document inspection refused; no report emitted.'); process.exitCode = 1;
  });
}
