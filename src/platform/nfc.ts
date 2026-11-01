import type { NfcBackend } from '../../packages/core/nfc.ts';
export const nfcBackend: NfcBackend = {
  status: async () => ({ available: false, enabled: false, platform: 'web' }),
  begin: async () => { throw new Error('NFC requires an iPhone or Android development build'); },
};
