import { requireOptionalNativeModule } from 'expo-modules-core';

export interface UsbDevice { id: number; vendorId: number; productId: number; name: string; hasPermission: boolean; }
export interface NativeStatus { usbHost: boolean; nfcAvailable: boolean; nfcEnabled: boolean; }
export interface NfcTag { id: string; technologies: string[]; records: { tnf: number; type: string; payloadLength: number }[]; }
export type NativeEvents = {
  onUsbData: (event: { token: number; bytes: number[] }) => void;
  onUsbClosed: (event: { token: number; reason: string }) => void;
  onNfcTag: (event: NfcTag) => void;
  onNfcStopped: () => void;
};
export interface ApexNative {
  addListener<E extends keyof NativeEvents>(event: E, listener: NativeEvents[E]): { remove(): void };
  getStatus(): Promise<NativeStatus>;
  listUsbDevices(): Promise<UsbDevice[]>;
  requestUsbPermission(id: number): Promise<boolean>;
  openUsb(id: number): Promise<number>;
  writeUsb(token: number, bytes: number[]): Promise<void>;
  closeUsb(token: number): Promise<void>;
  startNfcReader(): Promise<void>;
  stopNfcReader(): Promise<void>;
}
export const nativeDevice = requireOptionalNativeModule<ApexNative>('ApexDevice');
