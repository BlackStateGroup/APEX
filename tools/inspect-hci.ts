/** Read-only Node adapter. Never enables logging or follows advertisement URLs. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readBoundedRegularFile } from './inspect-iq.ts';
import { HCI_SOURCE_LIMIT, createHciLegacyEventDocument, prepareHci, listHciRecords, selectHciLegacyEvent, selectHciExtendedMetadata, serializeHciReport } from '../packages/core/hci-offline.ts';
export async function inspectHciCli(args: string[]): Promise<string> {
  const [path, ...flags] = args;
  if (!path || path.startsWith('--')) throw new Error('Usage: inspect-hci.ts file --provenance synthetic-fixture|recorded-import --label label [--start N | --record N | --extended-record N | --prepare-legacy-document N]');
  const values = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i]!, value = flags[i + 1];
    if (!['--provenance','--label','--start','--record','--extended-record','--prepare-legacy-document'].includes(flag) || values.has(flag) || value === undefined || value.startsWith('--')) throw new Error('Invalid or duplicate HCI option');
    values.set(flag, value);
  }
  const provenance = values.get('--provenance'), label = values.get('--label');
  if ((provenance !== 'synthetic-fixture' && provenance !== 'recorded-import') || !label) throw new Error('Explicit provenance and label required');
  if (['--start','--record','--extended-record','--prepare-legacy-document'].filter(flag => values.has(flag)).length > 1) throw new Error('Choose metadata page or one record');
  for (const name of ['--start','--record','--extended-record','--prepare-legacy-document']) if (values.has(name) && (!/^(0|[1-9]\d*)$/.test(values.get(name)!) || !Number.isSafeInteger(Number(values.get(name))))) throw new Error('Invalid HCI index');
  const bytes = await readBoundedRegularFile(path, HCI_SOURCE_LIMIT);
  const prepared = await prepareHci(bytes, {provenance, label}, async data => createHash('sha256').update(data).digest('hex'));
  if (values.has('--prepare-legacy-document')) return createHciLegacyEventDocument(prepared, Number(values.get('--prepare-legacy-document')), async data => createHash('sha256').update(data).digest('hex'));
  return serializeHciReport(values.has('--extended-record') ? selectHciExtendedMetadata(prepared, Number(values.get('--extended-record'))) : values.has('--record') ? selectHciLegacyEvent(prepared, Number(values.get('--record'))) : listHciRecords(prepared, Number(values.get('--start') ?? 0)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectHciCli(process.argv.slice(2)).then(report => process.stdout.write(report + '\n')).catch(() => {
    // Filesystem errors may contain operator paths. Keep command-line failures generic.
    console.error('Offline HCI inspection refused; no report emitted.'); process.exitCode = 1;
  });
}
