import { Platform } from 'react-native';
import { nativeTrust } from '../../modules/apex-trust/index.ts';
import { nativeDevice } from '../../modules/apex-device/index.ts';
import { AndroidUsbTransport } from '../../modules/apex-device/usb-transport.ts';
import { nativeAccessoryTrustAdapters } from '../../packages/core/accessory-native-adapters.ts';
import type { SignedLabDependencies } from '../signed-read-lab-controller.ts';
export function signedLabDependencies(): SignedLabDependencies {
  const adapters = nativeTrust?.isSupported() === true ? nativeAccessoryTrustAdapters(nativeTrust) : null;
  const usbUnavailable = Platform.OS !== 'android' || !nativeDevice ? 'This firmware uses USB. iPhone USB transport is unavailable; native verification alone does not provide an accessory connection.' : null;
  return { adapters, usbUnavailable,
    listDevices: async () => { if (usbUnavailable || !nativeDevice) throw new Error(usbUnavailable ?? 'USB unavailable'); return nativeDevice.listUsbDevices(); },
    createTransport: id => { if (usbUnavailable || !nativeDevice) throw new Error(usbUnavailable ?? 'USB unavailable'); return new AndroidUsbTransport(nativeDevice, id); } };
}
