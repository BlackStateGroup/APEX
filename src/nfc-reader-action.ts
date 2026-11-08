import type { NfcReader } from '../packages/core/nfc.ts';

/** Cancellation does not acquire or release the App's device-operation lock.
 * Its original start action still owns that lock until startup settles.
 */
export function runNfcReaderAction(
  reader: NfcReader | null,
  run: (action: () => Promise<void>) => Promise<void>,
  onStopError: (error: unknown) => void,
): Promise<void> {
  if (!reader) return Promise.resolve();
  if (reader.state !== 'idle') return reader.stop().catch(onStopError);
  return run(() => reader.start());
}
