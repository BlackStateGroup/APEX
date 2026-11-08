import { Platform } from 'react-native';
let loading: Promise<typeof import('react-native-nfc-manager')> | null = null;
async function api() {
  loading ??= import('react-native-nfc-manager').catch(() => { loading = null; throw new Error('Install an APEX development build with NFC support'); });
  return loading;
}
import type { NfcBackend } from '../../packages/core/nfc.ts';
import { createNfcSessionController } from '../../packages/core/nfc-session.ts';

const sessions = createNfcSessionController(async () => {
  const { default: NfcManager, NfcEvents, NfcError } = await api();
  return {
    setTagListener: listener => NfcManager.setEventListener(NfcEvents.DiscoverTag, listener),
    setClosedListener: listener => NfcManager.setEventListener(NfcEvents.SessionClosed, listener),
    register: () => NfcManager.registerTagEvent({ alertMessage: 'Hold your iPhone near an NFC tag to perform your selected foreground inspection.', invalidateAfterFirstRead: false }),
    unregister: () => NfcManager.unregisterTagEvent(),
    isUserCancel: error => error instanceof NfcError.UserCancel,
    requiresClosedEvent: Platform.OS === 'ios',
  };
});

let started = false;
export const nfcBackend: NfcBackend = {
  async status() {
    const { default: NfcManager } = await api();
    const available = await NfcManager.isSupported();
    if (available && !started) { await NfcManager.start(); started = true; }
    return { available, enabled: available && (Platform.OS === 'ios' || await NfcManager.isEnabled()), platform: Platform.OS === 'ios' ? 'ios' : 'android' };
  },
  begin: sessions.begin,
};
