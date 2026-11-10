import type { SignedLabDependencies } from '../signed-read-lab-controller.ts';
export function signedLabDependencies(): SignedLabDependencies {
  return { adapters: null, usbUnavailable: 'Signed USB reads require an Android 13+ development build.',
    listDevices: async () => [], createTransport: () => { throw new Error('Native USB unavailable'); } };
}
