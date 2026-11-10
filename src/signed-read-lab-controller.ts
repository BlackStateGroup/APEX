import { AccessoryTrustAuthority } from '../packages/core/accessory-trust.ts';
import type { AccessoryTrustAdapters, PairingApproval, AccessoryReadOperation } from '../packages/core/accessory-trust.ts';
import { AccessorySignedConnection } from '../packages/core/accessory-signed-connection.ts';
import type { ByteTransport } from '../packages/core/transport.ts';
import { validateCapabilities, validateInfo } from '../packages/core/session.ts';

export type LabUsbDevice = Readonly<{ id: number; vendorId: number; productId: number; name: string }>;
export interface SignedLabDependencies {
  adapters: AccessoryTrustAdapters | null;
  usbUnavailable: string | null;
  listDevices(): Promise<LabUsbDevice[]>;
  createTransport(id: number): ByteTransport;
}
/** Memory-only human approval controller. No network/remote pairing entry point. */
export class SignedReadLabController {
  #authority: AccessoryTrustAuthority | null;
  #connection: AccessorySignedConnection | null = null;
  #offConnection?: () => void;
  #enabled = false;
  #foreground = true;
  #epoch = 0;
  #busy = false;
  #devices: readonly LabUsbDevice[] = [];
  #message = 'Disabled. Enable explicitly for your owned or authorised lab accessory.';
  #result: string | null = null;
  #listeners = new Set<() => void>();
  private dependencies: SignedLabDependencies;
  constructor(dependencies: SignedLabDependencies) {
    this.dependencies = dependencies;
    this.#authority = dependencies.adapters ? new AccessoryTrustAuthority(dependencies.adapters) : null;
  }
  snapshot() {
    const pairing = this.#authority?.listPairings()[0] ?? null;
    return Object.freeze({ enabled: this.#enabled, foreground: this.#foreground, pairing,
      supported: this.#authority !== null, usbUnavailable: this.dependencies.usbUnavailable,
      devices: this.#devices, busy: this.#busy, connection: this.#connection?.state ?? 'new',
      held: this.#connection?.held ?? false, message: this.#message, result: this.#result });
  }
  observe(fn: () => void) { this.#listeners.add(fn); return () => { this.#listeners.delete(fn); }; }
  #emit() { for (const fn of this.#listeners) { try { fn(); } catch { /* Observers cannot bypass approval. */ } } }
  #ready() { if (!this.#foreground || !this.#enabled || !this.#authority) throw new Error('Enable the laboratory in the foreground first'); }
  enable() {
    if (!this.#foreground || !this.#authority) throw new Error('Native Ed25519 is unavailable or the app is not active');
    if (this.#connection?.held) throw new Error('Wait for USB cleanup before enabling again');
    this.#enabled = true; this.#message = 'Compare the full public key using your independent provisioning record.'; this.#emit();
  }
  confirm(approval: PairingApproval) {
    this.#ready();
    if (this.#busy || this.#connection?.held || this.#authority!.listPairings().length) throw new Error('Revoke and close the previous pairing first');
    this.#authority!.confirmPairing(approval); this.#result = null;
    this.#message = 'Public key and selected read grants confirmed locally for this session.'; this.#emit();
  }
  async refresh() {
    this.#ready();
    if (this.dependencies.usbUnavailable) throw new Error(this.dependencies.usbUnavailable);
    if (this.#busy || this.#connection?.held) throw new Error('USB is busy');
    const epoch = this.#epoch; this.#busy = true; this.#emit();
    try {
      const devices = await this.dependencies.listDevices();
      if (epoch !== this.#epoch || !this.#foreground) return;
      if (!Array.isArray(devices) || devices.length > 128) throw new Error('Invalid USB inventory');
      this.#devices = Object.freeze(devices.map(d => {
        if (!Number.isInteger(d.id) || d.id < 0 || !Number.isInteger(d.vendorId) || !Number.isInteger(d.productId) || typeof d.name !== 'string' || d.name.length > 256) throw new Error('Invalid USB descriptor');
        return Object.freeze({ id: d.id, vendorId: d.vendorId, productId: d.productId, name: d.name });
      }));
      this.#message = `${devices.length} attached USB device(s). These names and IDs are not authenticated identities.`;
    } finally { if (epoch === this.#epoch) { this.#busy = false; this.#emit(); } }
  }
  async connect(id: number) {
    this.#ready();
    if (this.dependencies.usbUnavailable) throw new Error(this.dependencies.usbUnavailable);
    if (this.#busy || this.#connection?.held) throw new Error('USB is busy or cleanup remains uncertain');
    const pair = this.#authority!.listPairings()[0];
    if (!pair || !this.#devices.some(d => d.id === id)) throw new Error('Confirm a key and explicitly select a listed device');
    const epoch = this.#epoch;
    this.#offConnection?.();
    const connection = new AccessorySignedConnection(this.dependencies.createTransport(id), this.#authority!, pair.label);
    this.#connection = connection;
    this.#offConnection = connection.observe(() => {
      if (this.#connection === connection) {
        if (connection.state !== 'open') this.#result = null;
        this.#emit();
      }
    });
    this.#busy = true; this.#result = null; this.#emit();
    try {
      await connection.open();
      if (epoch === this.#epoch) this.#message = 'USB open. Choose an allowed signed read; connection alone does not authenticate the accessory.';
    } finally { if (epoch === this.#epoch) { this.#busy = false; this.#emit(); } }
  }
  async read(operation: AccessoryReadOperation, ping = '') {
    this.#ready();
    if (this.#busy || !this.#connection || this.#connection.state !== 'open') throw new Error('Open an explicitly paired USB connection first');
    const payload = new TextEncoder().encode(ping);
    if (payload.length > 128) throw new Error('Ping must be at most 128 UTF-8 bytes');
    const epoch = this.#epoch, connection = this.#connection;
    this.#busy = true; this.#result = null; this.#emit();
    try {
      const result = await connection.request(operation, operation === 'system.ping' ? payload : undefined);
      if (epoch !== this.#epoch || !this.#foreground || this.#connection !== connection) return;
      const bytes = Uint8Array.from(result.body);
      const value = operation === 'system.info' ? validateInfo(bytes) : operation === 'system.capabilities' ? validateCapabilities(bytes) : { echoHex: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') };
      this.#result = JSON.stringify(value, null, 2);
      this.#message = 'Verified signature for this response using the confirmed key. Device metadata remains a device claim.';
    } catch (error) { void connection.close().catch(() => {}); throw error; }
    finally { if (epoch === this.#epoch) { this.#busy = false; this.#emit(); } }
  }
  async stop() {
    this.#epoch++; this.#busy = false; this.#result = null;
    this.#message = 'Closing locally; replacement stays blocked until native cleanup completes.'; this.#emit();
    await this.#connection?.close();
    this.#message = 'Connection closed. Opening again is an explicit action.'; this.#emit();
  }
  async revoke() {
    for (const pair of this.#authority?.listPairings() ?? []) this.#authority!.revoke(pair.label);
    this.#enabled = false; this.#devices = []; this.#emit();
    await this.stop();
    this.#message = 'Pairing revoked. No trust or device choice was saved.'; this.#emit();
  }
  setForeground(value: boolean) {
    this.#foreground = value;
    if (!value) void this.revoke().catch(error => this.report(error));
    this.#emit();
  }
  report(error: unknown) { this.#message = error instanceof Error ? error.message : String(error); this.#emit(); }
  dispose() { this.#foreground = false; void this.revoke().catch(() => {}); this.#listeners.clear(); }
}
