// Executes the actual App handlers/effect cleanup with injected setters.
// No React mounting or native runtime is implied.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DeviceSession } from '../../packages/core/session.ts';
import { clearReleasedSession } from '../../src/session-controls.ts';
import type { ByteTransport } from '../../packages/core/transport.ts';
const source = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
export function harness(overrides: Record<string, unknown> = {}) {
  const writes: unknown[] = [];
  const write = (...values: unknown[]) => writes.push(values);
  const env = {
    browserAxp: null, attached: { current: true }, mountEpoch: { current: 1 },
    lock: { current: false }, operation: { current: null as object | null },
    session: { current: null as DeviceSession | null },
    disconnectListener: { current: null as (() => void) | null },
    acquisition: { current: null as any }, setAcquisitionView: write, refreshAcquisition: write,
    captureBusy: { current: false }, serviceDataBusy: { current: false },
    serviceDataUncertain: { current: false }, observationBusy: { current: false }, observationUncertain: { current: false },
    setBusy: write, setNotice: write, append: write, clearSession: write,
    setIdentity: write, setSource: write, setCaps: write, DeviceSession, clearReleasedSession,
  };
  Object.assign(env, overrides);
  const runSource = source.slice(source.indexOf('  async function run('), source.indexOf('  const runForeground'));
  const connectSource = source.slice(source.indexOf('  async function connect('), source.indexOf('  async function resetBluetooth('));
  const methods = new Function(...Object.keys(env), stripTypeScriptTypes(runSource + connectSource) + '\nreturn { run, connect, disconnect, cancelAcquisition: typeof cancelAcquisition === "function" ? cancelAcquisition : undefined };')(...Object.values(env)) as {
    run(action: () => Promise<void>): Promise<void>; connect(transport: ByteTransport): Promise<void>; disconnect(): Promise<void>; cancelAcquisition?: (attempt: any) => void;
  };
  // Execute the actual native mount cleanup and resource cleanup, not a copy.
  const detachStart = source.indexOf('if (!browserAxp) return () =>');
  const detachEnd = source.indexOf('\n', detachStart);
  const detach = new Function('browserAxp', 'attached', 'mountEpoch', source.slice(detachStart, detachEnd))(null, env.attached, env.mountEpoch);
  const cleanupStart = source.indexOf('      mounted = false; void capture.cancel();');
  const cleanupEnd = source.indexOf('\n    };', cleanupStart);
  const cleanupEnv = { ...env, capture: { cancel: async () => {} }, lifecycle: { remove() {} }, nfc: { stop: async () => {} }, shutdownBluetooth: async () => {} };
  const cleanup = new Function(...Object.keys(cleanupEnv), 'let mounted = true;\n' + source.slice(cleanupStart, cleanupEnd)).bind(null, ...Object.values(cleanupEnv));
  return { ...methods, env, writes, unmount() { detach(); cleanup(); } };
}
