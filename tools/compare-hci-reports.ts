/** Read-only CLI: explicit report selection, no saving or document creation. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readBoundedRegularFile } from './inspect-iq.ts';
import { compareHciLegacyReportBytes, serializeHciReportComparison } from '../packages/core/hci-report-comparison.ts';
export async function compareHciReportsCli(args: string[]): Promise<string> {
  const [leftPath, rightPath, ...flags] = args;
  if (!leftPath || !rightPath || leftPath.startsWith('-') || rightPath.startsWith('-') || flags.length !== 4) throw new Error('Explicit paths and report indices required');
  const indices = new Map<string, number>();
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i]!, value = flags[i + 1]!;
    if (!['--left-report', '--right-report'].includes(flag) || indices.has(flag) || !/^(0|[1-9]\d*)$/.test(value) || Number(value) > 24) throw new Error('Invalid comparison option');
    indices.set(flag, Number(value));
  }
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
  const left = decoder.decode(await readBoundedRegularFile(leftPath, 12288));
  const right = decoder.decode(await readBoundedRegularFile(rightPath, 12288));
  return serializeHciReportComparison(await compareHciLegacyReportBytes(left, indices.get('--left-report')!, right,
    indices.get('--right-report')!, async bytes => createHash('sha256').update(bytes).digest('hex')));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  compareHciReportsCli(process.argv.slice(2)).then(output => process.stdout.write(output + '\n')).catch(() => {
    console.error('Offline HCI report comparison refused; no report emitted.'); process.exitCode = 1;
  });
}
