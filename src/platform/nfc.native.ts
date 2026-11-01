import { Platform } from 'react-native';
let loading: Promise<typeof import('react-native-nfc-manager')> | null = null;
async function api() {
  loading ??= import('react-native-nfc-manager').catch(() => { loading = null; throw new Error('Install an APEX development build with NFC support'); });
  return loading;
}
import type { NfcBackend } from '../../packages/core/nfc.ts';

let started = false;
export const nfcBackend: NfcBackend = {
  async status() {
    const { default: NfcManager } = await api();
    const available = await NfcManager.isSupported();
    if (available && !started) { await NfcManager.start(); started = true; }
    return { available, enabled: available && (Platform.OS === 'ios' || await NfcManager.isEnabled()), platform: Platform.OS === 'ios' ? 'ios' : 'android' };
  },
  async begin(onTag, onClosed) {
    const { default: NfcManager, NfcEvents, NfcError } = await api();
    let active = true;
    const clear = () => { NfcManager.setEventListener(NfcEvents.DiscoverTag, null); NfcManager.setEventListener(NfcEvents.SessionClosed, null); };
    NfcManager.setEventListener(NfcEvents.DiscoverTag, tag => { if (active) onTag(tag); });
    NfcManager.setEventListener(NfcEvents.SessionClosed, error => {
      if (!active) return; active = false; clear();
      onClosed(error && !(error instanceof NfcError.UserCancel) ? error : undefined);
    });
    try {
      await NfcManager.registerTagEvent({ alertMessage: 'Hold your iPhone near an NFC tag to inspect its metadata.', invalidateAfterFirstRead: false });
    } catch (error) { active = false; clear(); throw error; }
    return async () => {
      if (!active) return; active = false; clear(); await NfcManager.unregisterTagEvent();
    };
  },
};
