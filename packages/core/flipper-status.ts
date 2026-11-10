/** Independently written GATT interface facts, reviewed against official firmware
 * 9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a. No RPC or upstream code is included. */
export const bluetoothUuid = (short: string) => `0000${short}-0000-1000-8000-00805f9b34fb`;
export const FLIPPER_ADVERTISEMENTS = Object.freeze(['3080', '3081', '3082', '3083'].map(bluetoothUuid));
export const FLIPPER_SERIAL_SERVICE = '8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000';
export const DEVICE_INFORMATION = bluetoothUuid('180a');
export const BATTERY_SERVICE = bluetoothUuid('180f');
export const FLIPPER_STATUS_FIELDS = Object.freeze([
  { key: 'manufacturer', label: 'Manufacturer', service: DEVICE_INFORMATION, characteristic: bluetoothUuid('2a29'), kind: 'text' },
  // Upstream puts hardware target in Firmware Revision, and build in Software Revision.
  { key: 'hardwareTarget', label: 'Hardware target', service: DEVICE_INFORMATION, characteristic: bluetoothUuid('2a26'), kind: 'text' },
  { key: 'firmwareBuild', label: 'Firmware build', service: DEVICE_INFORMATION, characteristic: bluetoothUuid('2a28'), kind: 'text' },
  { key: 'rpcVersion', label: 'RPC version', service: DEVICE_INFORMATION, characteristic: '03f6666d-ae5e-47c8-8e1a-5d873eb5a933', kind: 'text' },
  { key: 'batteryPercent', label: 'Battery', service: BATTERY_SERVICE, characteristic: bluetoothUuid('2a19'), kind: 'battery' },
  { key: 'powerState', label: 'Power state', service: BATTERY_SERVICE, characteristic: bluetoothUuid('2a1a'), kind: 'power' },
] as const);
export type FlipperStatusField = typeof FLIPPER_STATUS_FIELDS[number];
export type StatusValue = string | number;
export function normaliseBluetoothUuid(value: string): string {
  const lower = value.toLowerCase();
  return /^[0-9a-f]{4}$/.test(lower) ? bluetoothUuid(lower) : lower;
}
export function decodeFlipperStatus(field: FlipperStatusField, bytes: Uint8Array): StatusValue {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 128) throw new Error(`Invalid ${field.label} length`);
  if (field.kind === 'text') {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new Error(`Invalid ${field.label} text`);
    return value;
  }
  if (bytes.length !== 1) throw new Error(`Invalid ${field.label} length`);
  const value = bytes[0]!;
  if (field.kind === 'battery') {
    if (value > 100) throw new Error('Battery value outside 0–100');
    return value;
  }
  const charging = (value >> 4) & 3;
  return ['Charging unknown', 'Charging unsupported', 'Not charging', 'Charging'][charging]!;
}
export type FlipperCandidate = Readonly<{ id: string; name: string; rssi: number | null }>;
export interface FlipperStatusRadio {
  state(): Promise<string>;
  scan(callback: (error: Error | null, candidate?: FlipperCandidate) => void): Promise<void>;
  stopScan(): Promise<void>;
  connect(id: string): Promise<void>;
  discover(id: string): Promise<readonly string[]>;
  read(id: string, field: FlipperStatusField): Promise<Uint8Array>;
  disconnect(id: string): Promise<void>;
  isConnected(id: string): Promise<boolean>;
  onDisconnect(id: string, callback: () => void): () => void;
}
export type FlipperStatusReport = Readonly<{
  schema: 'apex.flipper-status.v1'; capturedAt: string; appRevision: string;
  source: 'device-reported'; authenticatedIdentity: false; transport: 'ios-bluetooth-gatt';
  deviceName: string; values: Readonly<Record<string, StatusValue>>;
  connectionClosed: true;
}>;
type Phase = 'idle' | 'preparing' | 'scanning' | 'connecting' | 'reading' | 'closing' | 'complete' | 'error' | 'blocked';
type Run = { epoch: number; pending: Set<Promise<unknown>>; stopped: boolean; scanIssued: boolean;
  id: string | null; connectionIssued: boolean; disconnected: boolean; remove?: () => void; closing?: Promise<void>;
  abort: AbortController };
/** One foreground operation, a fixed read allowlist, and ownership through native settlement. */
export class FlipperStatusController {
  private radio: FlipperStatusRadio | null = null;
  private run: Run | null = null;
  private epoch = 0;
  private phase: Phase = 'idle';
  private message = 'Turn on Bluetooth on your Flipper, then find it here.';
  private candidates: readonly FlipperCandidate[] = [];
  private report: FlipperStatusReport | null = null;
  private foreground = true;
  private scanTimer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private factory: () => Promise<FlipperStatusRadio>;
  readonly unavailable: string | null;
  private timeoutMs: number;
  private scanMs: number;
  private revision: string;
  constructor(factory: () => Promise<FlipperStatusRadio>, options: { unavailable?: string; timeoutMs?: number; scanMs?: number; revision?: string } = {}) {
    this.factory = factory; this.unavailable = options.unavailable ?? null;
    this.timeoutMs = options.timeoutMs ?? 20000; this.scanMs = options.scanMs ?? 10000;
    this.revision = options.revision ?? 'unrecorded';
  }
  snapshot() { return Object.freeze({ phase: this.phase, message: this.message, candidates: this.candidates,
    report: this.report, held: this.run !== null, foreground: this.foreground, unavailable: this.unavailable }); }
  observe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const fn of this.listeners) { try { fn(); } catch { /* UI cannot change ownership. */ } } }
  private current(run: Run) { return this.run === run && !run.stopped && this.foreground && run.epoch === this.epoch; }
  private check(run: Run) { if (!this.current(run)) throw new Error('Operation cancelled'); }
  private begin(): Run {
    if (this.unavailable) throw new Error(this.unavailable);
    if (!this.foreground || this.run || this.phase === 'blocked') throw new Error('Wait for Bluetooth cleanup, or restart if cleanup is uncertain');
    this.report = null;
    return this.run = { epoch: ++this.epoch, pending: new Set(), stopped: false, scanIssued: false,
      id: null, connectionIssued: false, disconnected: false, abort: new AbortController() };
  }
  private async effect<T>(run: Run, action: () => Promise<T>): Promise<T> {
    this.check(run);
    const raw = Promise.resolve().then(() => { this.check(run); return action(); });
    run.pending.add(raw);
    void raw.then(() => run.pending.delete(raw), () => run.pending.delete(raw));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    try {
      const result = await Promise.race([raw, new Promise<never>((_, reject) => {
        cancel = () => reject(new Error('Operation cancelled'));
        run.abort.signal.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => reject(new Error('Bluetooth operation timed out')), this.timeoutMs);
      })]);
      this.check(run); return result;
    } finally { clearTimeout(timer); run.abort.signal.removeEventListener('abort', cancel); }
  }
  private async ready(run: Run) {
    if (!this.radio) await this.effect(run, async () => { this.radio = await this.factory(); });
    const state = await this.effect(run, () => this.radio!.state());
    if (state !== 'PoweredOn') throw new Error(state === 'Unauthorized' ? 'Allow Bluetooth for APEX in iPhone Settings.' : 'Turn on Bluetooth in iPhone Settings, then try again.');
  }
  async scan() {
    const run = this.begin(); this.candidates = []; this.phase = 'preparing'; this.message = 'Checking Bluetooth permission…'; this.emit();
    try {
      await this.ready(run);
      this.phase = 'scanning'; this.message = 'Looking for a Flipper Zero for 10 seconds. Select only your device.'; this.emit();
      await this.effect(run, () => {
        run.scanIssued = true;
        return this.radio!.scan((error, candidate) => {
          if (!this.current(run) || this.phase !== 'scanning') return;
          if (error) { void this.fail(run, 'Bluetooth scan failed. Check permission and Bluetooth in Settings.'); return; }
          if (!candidate || typeof candidate.id !== 'string' || !candidate.id.length || candidate.id.length > 128 || typeof candidate.name !== 'string' || candidate.name.length > 128) return;
          if (candidate.rssi !== null && (!Number.isFinite(candidate.rssi) || candidate.rssi < -127 || candidate.rssi > 20)) return;
          const clean = Object.freeze({ id: candidate.id, name: candidate.name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, '').slice(0, 64) || 'Unnamed Flipper candidate', rssi: candidate.rssi });
          const list = this.candidates.filter(d => d.id !== clean.id);
          if (list.length < 32) { this.candidates = Object.freeze([...list, clean]); this.emit(); }
        });
      });
      this.scanTimer = setTimeout(() => { void this.finishScan(); }, this.scanMs);
    } catch (error) { if (this.current(run)) await this.fail(run, error instanceof Error ? error.message : 'Bluetooth scan failed'); }
  }
  async finishScan() {
    const run = this.run;
    if (!run || this.phase !== 'scanning') return;
    const count = this.candidates.length;
    await this.close(run, 'idle', count ? 'Select your Flipper to read its status.' : 'No Flipper found. Turn on its Bluetooth and disconnect other companion apps, then retry.');
  }
  async inspect(id: string, owned: boolean) {
    if (owned !== true) throw new Error('Confirm this is your Flipper or that you have permission to inspect it.');
    const candidate = this.candidates.find(d => d.id === id);
    if (!candidate) throw new Error('Select a device from the current scan.');
    const selectionEpoch = this.epoch;
    if (this.phase === 'scanning') await this.finishScan();
    if (selectionEpoch !== this.epoch || !this.foreground) throw new Error('Device selection cancelled');
    const run = this.begin(); run.id = id; this.candidates = [];
    this.phase = 'connecting'; this.message = 'Connecting. If iOS asks to pair, enter the code shown on your Flipper.'; this.emit();
    try {
      await this.ready(run);
      run.remove = this.radio!.onDisconnect(id, () => {
        if (this.run !== run) return;
        run.disconnected = true;
        if (this.current(run)) void this.fail(run, 'Flipper disconnected before the status read completed.');
      });
      await this.effect(run, () => { run.connectionIssued = true; return this.radio!.connect(id); });
      const services = (await this.effect(run, () => this.radio!.discover(id))).map(normaliseBluetoothUuid);
      if (![FLIPPER_SERIAL_SERVICE, DEVICE_INFORMATION, BATTERY_SERVICE].every(uuid => services.includes(uuid))) throw new Error('This device does not expose the expected Flipper status services.');
      this.phase = 'reading'; this.message = 'Reading firmware and battery status…'; this.emit();
      const values: Record<string, StatusValue> = {};
      for (const field of FLIPPER_STATUS_FIELDS) {
        const bytes = await this.effect(run, () => this.radio!.read(id, field));
        values[field.key] = decodeFlipperStatus(field, bytes);
      }
      const report: FlipperStatusReport = Object.freeze({ schema: 'apex.flipper-status.v1', capturedAt: new Date().toISOString(),
        appRevision: this.revision, source: 'device-reported', authenticatedIdentity: false, transport: 'ios-bluetooth-gatt',
        deviceName: candidate.name, values: Object.freeze(values), connectionClosed: true });
      const epoch = this.epoch;
      await this.close(run, 'complete', 'Status read complete. Flipper disconnected.');
      if (this.epoch === epoch && this.foreground && this.snapshot().phase === 'complete') { this.report = report; this.emit(); }
    } catch (error) { if (this.current(run)) await this.fail(run, error instanceof Error ? error.message : 'Status read failed'); }
  }
  private async fail(run: Run, message: string) { this.report = null; await this.close(run, 'error', message); }
  private close(run: Run, after: Phase, message: string): Promise<void> {
    if (run.closing) return run.closing;
    run.stopped = true; run.abort.abort(); clearTimeout(this.scanTimer);
    this.phase = 'closing'; this.message = 'Closing Bluetooth. Please wait…'; this.emit();
    run.closing = Promise.resolve().then(async () => {
      let uncertain = false;
      // Interrupt a pending connect/read, then drain the original native promises.
      // A timed-out Promise is never treated as proof that the OS operation ended.
      const interrupts: Promise<unknown>[] = [];
      if (this.radio && run.scanIssued) interrupts.push(Promise.resolve().then(() => this.radio!.stopScan()));
      if (this.radio && run.connectionIssued && run.pending.size && !run.disconnected) interrupts.push(Promise.resolve().then(() => this.radio!.disconnect(run.id!)));
      const interrupted = await Promise.allSettled(interrupts);
      if (interrupted.some(r => r.status === 'rejected')) uncertain = true;
      while (run.pending.size) await Promise.allSettled([...run.pending]);
      // A scan start may settle after the first stop; issue the final stop only
      // after that native start has settled. The iOS bridge is dispatch-acknowledged.
      if (this.radio && run.scanIssued) {
        try { await this.radio.stopScan(); } catch { uncertain = true; }
      }
      // A late successful connection must be closed as well, even after cancellation.
      if (this.radio && run.connectionIssued) {
        try {
          if (await this.radio.isConnected(run.id!)) await this.radio.disconnect(run.id!);
          if (await this.radio.isConnected(run.id!)) uncertain = true;
        } catch { uncertain = true; }
      }
      try { run.remove?.(); } catch { uncertain = true; }
      if (uncertain) { this.phase = 'blocked'; this.message = 'Bluetooth cleanup could not be confirmed. Restart APEX before trying again.'; this.report = null; }
      else {
        this.run = null;
        const cancelled = this.epoch !== run.epoch || !this.foreground;
        this.phase = cancelled ? 'idle' : after;
        this.message = cancelled ? 'Cancelled. Start a new scan when ready.' : message;
      }
      this.emit();
    });
    return run.closing;
  }
  async cancel() {
    ++this.epoch; this.report = null; this.candidates = [];
    if (this.run) await this.close(this.run, 'idle', 'Cancelled. Start a new scan when ready.');
    this.emit();
  }
  setForeground(value: boolean) { this.foreground = value; if (!value) void this.cancel(); this.emit(); }
  clearReport() { this.report = null; this.emit(); }
  showError(error: unknown) { this.message = error instanceof Error ? error.message : 'Operation failed'; this.emit(); }
}
