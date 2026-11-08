/** Check live lifecycle state at dispatch, not a previously rendered button.
 * This wraps starts only: stopping must remain possible after backgrounding.
 */
export function runForegroundDeviceAction(
  action: () => Promise<void>,
  run: (action: () => Promise<void>) => Promise<void>,
  isForeground: () => boolean,
): Promise<void> {
  return run(async () => {
    if (!isForeground()) throw new Error('Device acquisition requires an active foreground app.');
    await action();
  });
}

/** Ordinary discovery's toggle reads synchronous ownership, not its label render. */
export function runAccessoryDiscoveryAction(
  isScanning: () => boolean,
  stop: () => Promise<void>,
  start: () => Promise<void>,
  run: (action: () => Promise<void>) => Promise<void>,
  isForeground: () => boolean,
): Promise<void> {
  return isScanning() ? run(stop) : runForegroundDeviceAction(start, run, isForeground);
}
