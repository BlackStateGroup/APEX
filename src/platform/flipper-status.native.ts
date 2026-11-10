import { AppState, Platform, Share } from 'react-native';
import { FlipperStatusController } from '../../packages/core/flipper-status.ts';
import { flipperStatusPlxRadio } from '../flipper-status-plx.ts';
import { createEvidenceShareGate } from '../native-evidence-share.ts';
import type { FlipperStatusRadio } from '../../packages/core/flipper-status.ts';

let radio: Promise<FlipperStatusRadio> | undefined;
let controller: FlipperStatusController | undefined;
export function getFlipperStatusController() {
  controller ??= new FlipperStatusController(() => {
    if (Platform.OS !== 'ios' || AppState.currentState !== 'active') throw new Error('Open the iPhone build in the foreground.');
    // Keep a rejected construction promise too: an uncertain manager is never replaced.
    radio ??= import('react-native-ble-plx').then(({ BleManager }) => {
      if (AppState.currentState !== 'active') throw new Error('Bluetooth preparation cancelled');
      return flipperStatusPlxRadio(new BleManager());
    });
    return radio;
  }, { unavailable: Platform.OS !== 'ios' ? 'This first Flipper connection requires the native iPhone build.' : undefined,
    revision: process.env.EXPO_PUBLIC_APEX_BUILD_REVISION });
  return controller;
}
const share = createEvidenceShareGate(async document => {
  const result = await Share.share({ title: 'APEX Flipper status', message: document });
  if (result.action === Share.dismissedAction) return 'dismissed';
  if (result.action === Share.sharedAction) return 'returned';
  throw new Error('Share result unknown');
});
export async function shareFlipperStatus(document: string, current: () => boolean) {
  return share(document, () => AppState.currentState === 'active' && current());
}
