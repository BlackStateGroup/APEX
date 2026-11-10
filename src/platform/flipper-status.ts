import { FlipperStatusController } from '../../packages/core/flipper-status.ts';
const controller = new FlipperStatusController(async () => { throw new Error('Native iPhone build required'); },
  { unavailable: 'Open the native APEX iPhone build to connect over Bluetooth. This browser preview cannot connect.' });
export function getFlipperStatusController() { return controller; }
export async function shareFlipperStatus(_document: string, _current: () => boolean): Promise<string> { throw new Error('Sharing requires the native iPhone build'); }
