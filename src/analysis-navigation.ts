/** Memory-only navigation. Routes have no analysis, persistence or device side effects. */
export const ANALYSIS_INSPECTORS = [
  { id: 'recording', label: 'Recording' },
  { id: 'ble', label: 'BLE / BTHome' },
  { id: 'ble-trials', label: 'BLE trial builder & comparison' },
  { id: 'ble-candidate', label: 'Numeric BLE candidate' },
  { id: 'flipper', label: 'Flipper responses' },
  { id: 'device-passport', label: 'Firmware Passport' },
  { id: 'ir', label: 'IR remote files' },
  { id: 'hci-document', label: 'HCI selected event document' },
  { id: 'hci', label: 'HCI captures' },
  { id: 'ndef', label: 'Serialized NDEF' },
  { id: 'phone-ndef', label: 'Phone NDEF fields' },
  { id: 'static-nfc', label: 'Static NFC data area' },
  { id: 'hci-compare', label: 'HCI report byte comparison' },
  { id: 'iq', label: 'Offline I/Q' },
] as const;
export type AnalysisInspector = typeof ANALYSIS_INSPECTORS[number]['id'];
export type Tab = 'Console' | 'Devices' | 'Analysis' | 'Evidence' | 'Research';
export const DEFAULT_ANALYSIS_INSPECTOR: AnalysisInspector = 'recording';
export function isAnalysisInspector(value: unknown): value is AnalysisInspector {
  return ANALYSIS_INSPECTORS.some(item => item.id === value);
}
export const ANALYSIS_ROUTES = {
  'staged-hci-report': 'hci-compare',
  'selected-hci-event': 'hci-document',
  'service-data': 'ble', 'advertised-uuid': 'ble', 'phone-capture': 'phone-ndef', 'staged-ble': 'ble-trials',
} as const satisfies Record<string, AnalysisInspector>;
export function nextAnalysisSource<T extends object>(previous: (T & { id: number }) | null, source: T): T & { id: number } {
  return { ...source, id: (previous?.id ?? 0) + 1 };
}
/** Consume a source once, including reconstructed objects, without tying delivery to visibility. */
export class AnalysisSourceGate {
  private lastId = 0;
  take(source: { id: number } | null | undefined): boolean {
    if (!source || !Number.isSafeInteger(source.id) || source.id <= this.lastId) return false;
    this.lastId = source.id;
    return true;
  }
}
