import type { SourceKind } from '../packages/core/transport.ts';

export interface RecoverySession { readonly source: SourceKind; close(): Promise<void> }
/** Explicit app-manager recovery, not an OS Bluetooth setting. The confirmed
 * callback must not clear unrelated sessions. Failed/pending destruction never
 * reaches it. Session cleanup errors cannot undo confirmed manager destruction. */
export async function recoverBluetooth(
  shutdown: () => Promise<void>, session: RecoverySession | null,
  confirmed: (clearBleSession: boolean) => void,
): Promise<{ sessionCleanupFailed: boolean }> {
  await shutdown();
  const clearBleSession = session?.source === 'ble';
  confirmed(clearBleSession);
  if (clearBleSession) {
    try { await session.close(); }
    catch { return { sessionCleanupFailed: true }; }
  }
  return { sessionCleanupFailed: false };
}
