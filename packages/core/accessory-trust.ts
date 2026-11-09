/** Opt-in host-side signed reads. No transport, firmware or application activation. */
import { encode, Kind, Opcode } from '../protocol/index.ts';
import type { Frame } from '../protocol/index.ts';

export const ACCESSORY_TRUST = Object.freeze({
  version: 1, opcode: 0x70, maxPeers: 32, maxIssuedChallenges: 4096,
  maxRequestBytes: 128, maxReplyBytes: 256, maxLeaseMs: 30_000,
  maxExchangeMs: 5000,
} as const);
export const ACCESSORY_TRUST_LIMITATIONS = 'Signature verification proves possession of the explicitly paired key and integrity of this reply only. It does not prove ownership, hardware identity, physical proximity, firmware integrity, sensor truth or reception. CRC is corruption detection, not authentication. Local grants do not authenticate the host to the accessory.';
const readOperations = Object.freeze({
  'system.info': Opcode.Info, 'system.capabilities': Opcode.Capabilities, 'system.ping': Opcode.Ping,
} as const);
export type AccessoryReadOperation = keyof typeof readOperations;
export interface PairingApproval {
  readonly label: string;
  /** Raw 32-byte Ed25519 public key, copied from an independent trusted channel. */
  readonly publicKeyHex: string;
  readonly confirmedPublicKeyHex: string;
  readonly keyVerification: 'out-of-band';
  readonly authorization: 'owned-or-authorized-lab';
  readonly allowedOperations: readonly AccessoryReadOperation[];
}
export interface AccessoryTrustAdapters {
  /** Trusted local CSPRNG. Repeated output is rejected, never repaired. */
  randomBytes(length: number): Uint8Array;
  /** Trusted local crypto provider. Must perform real Ed25519 verification. */
  verifyEd25519(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean>;
  /** Trusted monotonic clock, in milliseconds. Rollback permanently faults this authority. */
  now(): number;
}
export interface AccessoryReadResult {
  readonly operation: AccessoryReadOperation;
  readonly publicKeyHex: string;
  readonly body: readonly number[];
  readonly authentication: 'paired-key-ed25519-signature';
  readonly limitations: typeof ACCESSORY_TRUST_LIMITATIONS;
}
export interface AccessoryReader {
  readonly state: 'ready' | 'pending' | 'closed';
  request(operation: AccessoryReadOperation, payload?: Uint8Array): Promise<AccessoryReadResult>;
  close(): void;
}
/** Trusted connection adapter. The only wire command emitted is the new 0x70 extension.
 * It must not turn unsupported commands into legacy reads, reconnect or retry. */
export type AccessorySignedExchange = (request: Frame) => Promise<Frame>;

type Pair = { readonly label: string; readonly key: string; readonly allowed: readonly AccessoryReadOperation[] };
const prototype = Object.getPrototypeOf(Uint8Array.prototype);
const tag = Object.getOwnPropertyDescriptor(prototype, Symbol.toStringTag)!.get!;
const size = Object.getOwnPropertyDescriptor(prototype, 'byteLength')!.get!;
const storage = Object.getOwnPropertyDescriptor(prototype, 'buffer')!.get!;
const offset = Object.getOwnPropertyDescriptor(prototype, 'byteOffset')!.get!;
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function bytes(input: Uint8Array, min: number, max: number): Uint8Array {
  try {
    if (tag.call(input) !== 'Uint8Array') throw 0;
    const length: number = size.call(input), buffer: ArrayBuffer = storage.call(input);
    bufferSize.call(buffer);
    if (resizable?.call(buffer) || length < min || length > max) throw 0;
    return new Uint8Array(new Uint8Array(buffer, offset.call(input), length));
  } catch { throw new Error('Invalid trust byte storage or bounds'); }
}
function key(value: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('Invalid Ed25519 public key');
  return value;
}
function keyBytes(value: string): Uint8Array {
  key(value);
  return Uint8Array.from(value.match(/../g)!, part => Number.parseInt(part, 16));
}
function hex(value: Uint8Array): string { return Array.from(value, b => b.toString(16).padStart(2, '0')).join(''); }
function same(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function operationCode(operation: AccessoryReadOperation): number {
  if (typeof operation !== 'string' || !Object.hasOwn(readOperations, operation)) throw new Error('Unsupported trust operation');
  return readOperations[operation];
}
function integer(value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid trust bounds');
}
function snapshotFrame(frame: Frame): Frame {
  const { kind, opcode, id, payload } = frame;
  const result = { kind, opcode, id, payload: bytes(payload, 0, 512) };
  encode(result); // Retain the existing AXP/1 metadata validation, without treating CRC as a signature.
  return result;
}
function parsePayload(payload: Uint8Array, response: boolean): Uint8Array {
  const b = bytes(payload, response ? 100 : 36, response ? 356 : 164);
  const length = b[34]! | b[35]! << 8;
  if (b[0] !== ACCESSORY_TRUST.version || ![1, 2, 3].includes(b[1]!) ||
      length > (response ? ACCESSORY_TRUST.maxReplyBytes : ACCESSORY_TRUST.maxRequestBytes) ||
      b.length !== 36 + length + (response ? 64 : 0)) throw new Error('Invalid signed-read payload');
  return b;
}

/** Canonical signing input for peer implementations and independently exercised fixtures.
 * Request metadata, nonce, exact request bytes, pinned key and exact reply prefix are bound.
 * No verification, pairing or authorization occurs in this codec. */
export function accessorySignedReadTranscript(publicKeyHex: string, requestInput: Frame, replyInput: Uint8Array): Uint8Array {
  const publicKey = keyBytes(publicKeyHex), request = snapshotFrame(requestInput);
  if (request.kind !== Kind.Request || request.opcode !== ACCESSORY_TRUST.opcode) throw new Error('Not a signed-read request');
  const query = parsePayload(request.payload, false), reply = parsePayload(replyInput, true);
  if (!same(query.subarray(0, 34), reply.subarray(0, 34))) throw new Error('Signed-read challenge mismatch');
  const domain = new TextEncoder().encode('APEX/AXP1/SIGNED-READ/V1\0');
  const wire = encode(request), prefix = reply.subarray(0, -64);
  const result = new Uint8Array(domain.length + publicKey.length + wire.length + prefix.length);
  result.set(domain); result.set(publicKey, domain.length); result.set(wire, domain.length + publicKey.length);
  result.set(prefix, domain.length + publicKey.length + wire.length);
  return result;
}

/** Memory-only pairing authority. Its methods must be reachable only from trusted local
 * user-confirmation code, never from received JSON, firmware strings or model output. */
export class AccessoryTrustAuthority {
  #pairs = new Map<string, Pair>();
  #challenges = new Set<string>();
  #nextId = 1;
  #lastTime = -1;
  #clockFailed = false;
  #adapters: AccessoryTrustAdapters;
  constructor(adapters: AccessoryTrustAdapters) {
    const { randomBytes, verifyEd25519, now } = adapters;
    if (![randomBytes, verifyEd25519, now].every(value => typeof value === 'function')) throw new Error('Trust adapters required');
    this.#adapters = { randomBytes: randomBytes.bind(adapters), verifyEd25519: verifyEd25519.bind(adapters), now: now.bind(adapters) };
    this.#time();
  }
  #time(): number {
    if (this.#clockFailed) throw new Error('Trust clock unavailable');
    let now: number;
    try { now = this.#adapters.now(); } catch { this.#clockFailed = true; throw new Error('Trust clock unavailable'); }
    if (!Number.isFinite(now) || now < 0 || now < this.#lastTime || now > Number.MAX_SAFE_INTEGER - ACCESSORY_TRUST.maxLeaseMs) {
      this.#clockFailed = true; throw new Error('Trust clock unavailable');
    }
    this.#lastTime = now; return now;
  }
  confirmPairing(approval: PairingApproval): void {
    const { label, publicKeyHex, confirmedPublicKeyHex, keyVerification, authorization, allowedOperations } = approval;
    const pinned = key(publicKeyHex);
    if (keyVerification !== 'out-of-band' || authorization !== 'owned-or-authorized-lab' || pinned !== confirmedPublicKeyHex ||
        typeof label !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,63}$/.test(label) ||
        !Array.isArray(allowedOperations) || allowedOperations.length < 1 || allowedOperations.length > 3) throw new Error('Explicit pairing approval required');
    const allowed = Array.from({ length: allowedOperations.length }, (_, index) => allowedOperations[index]!); allowed.forEach(operationCode);
    if (new Set(allowed).size !== allowed.length) throw new Error('Duplicate read grant');
    if (this.#pairs.has(label) || [...this.#pairs.values()].some(pair => pair.key === pinned)) throw new Error('Already paired; revoke before changing a pairing');
    if (this.#pairs.size >= ACCESSORY_TRUST.maxPeers) throw new Error('Pairing capacity exhausted');
    this.#time();
    this.#pairs.set(label, Object.freeze({ label, key: pinned, allowed: Object.freeze(allowed) }));
  }
  revoke(label: string): void { this.#pairs.delete(label); }
  listPairings(): readonly Readonly<{ label: string; publicKeyHex: string; allowedOperations: readonly AccessoryReadOperation[] }>[] {
    return Object.freeze([...this.#pairs.values()].map(pair => Object.freeze({ label: pair.label, publicKeyHex: pair.key, allowedOperations: pair.allowed })));
  }
  createReader(label: string, exchange: AccessorySignedExchange, options: { leaseMs: number; exchangeMs: number }): AccessoryReader {
    const pair = this.#pairs.get(label);
    if (!pair) throw new Error('Accessory is not explicitly paired');
    const { leaseMs, exchangeMs } = options;
    integer(leaseMs, 1, ACCESSORY_TRUST.maxLeaseMs); integer(exchangeMs, 1, ACCESSORY_TRUST.maxExchangeMs);
    if (typeof exchange !== 'function') throw new Error('Signed exchange adapter required');
    const expiresAt = this.#time() + leaseMs;
    let state: AccessoryReader['state'] = 'ready';
    let cancel: (() => void) | undefined;
    const assertActive = () => {
      try {
        if (state === 'closed' || this.#pairs.get(label) !== pair || this.#time() >= expiresAt) throw new Error('Accessory trust lease is closed, revoked or expired');
      } catch (error) { state = 'closed'; throw error; }
    };
    const close = () => { state = 'closed'; cancel?.(); };
    return Object.freeze({
      get state() { return state; },
      close,
      request: async (operation: AccessoryReadOperation, payload = new Uint8Array()): Promise<AccessoryReadResult> => {
        if (state === 'pending') throw new Error('Signed read already pending');
        assertActive();
        const code = operationCode(operation), input = bytes(payload, 0, ACCESSORY_TRUST.maxRequestBytes);
        if (!pair.allowed.includes(operation)) throw new Error('Operation not explicitly authorized');
        if (operation !== 'system.ping' && input.length !== 0) throw new Error('Metadata reads require an empty payload');
        // Local invalid requests do not consume a challenge. Once started, every
        // failure closes the reader; neither retry nor legacy downgrade is attempted.
        state = 'pending';
        let timer: ReturnType<typeof setTimeout> | undefined;
        let exchangeDeadline = 0;
        const assertRequestActive = () => {
          assertActive();
          if (this.#time() >= exchangeDeadline) { state = 'closed'; throw new Error('Signed read timed out'); }
        };
        try {
          exchangeDeadline = Math.min(expiresAt, this.#time() + exchangeMs);
          if (this.#challenges.size >= ACCESSORY_TRUST.maxIssuedChallenges) throw new Error('Trust challenge budget exhausted');
          const nonce = bytes(this.#adapters.randomBytes(32), 32, 32), nonceHex = hex(nonce);
          if (this.#challenges.has(nonceHex)) throw new Error('Repeated trust challenge');
          this.#challenges.add(nonceHex);
          const query = new Uint8Array(36 + input.length);
          query.set([1, code]); query.set(nonce, 2); query[34] = input.length & 255; query[35] = input.length >>> 8; query.set(input, 36);
          const request: Frame = { kind: Kind.Request, opcode: ACCESSORY_TRUST.opcode, id: this.#nextId++, payload: query };
          // Keep private snapshots separate from adapter-owned frames and crypto buffers.
          const sent = snapshotFrame(request);
          assertRequestActive();
          const deadline = exchangeDeadline - this.#time();
          const cancelled = new Promise<never>((_, reject) => {
            cancel = () => reject(new Error('Signed read cancelled'));
            timer = setTimeout(() => reject(new Error('Signed read timed out')), deadline);
          });
          const work = async (): Promise<AccessoryReadResult> => {
            assertRequestActive();
            const response = snapshotFrame(await exchange(sent));
            assertRequestActive();
            if (response.kind !== Kind.Response || response.opcode !== request.opcode || response.id !== request.id) throw new Error('Signed-read envelope mismatch');
            const reply = parsePayload(response.payload, true);
            const transcript = accessorySignedReadTranscript(pair.key, request, reply);
            const verified = await this.#adapters.verifyEd25519(keyBytes(pair.key), transcript, reply.slice(-64));
            assertRequestActive();
            if (verified !== true) throw new Error('Accessory signature was not verified');
            const body = reply.slice(36, -64);
            if (operation === 'system.ping' && !same(input, body)) throw new Error('Signed ping did not match');
            return Object.freeze({ operation, publicKeyHex: pair.key, body: Object.freeze(Array.from(body)), authentication: 'paired-key-ed25519-signature' as const, limitations: ACCESSORY_TRUST_LIMITATIONS });
          };
          const result = await Promise.race([cancelled, work()]);
          assertRequestActive(); state = 'ready'; return result;
        } catch (error) {
          state = 'closed'; throw error instanceof Error ? error : new Error('Signed read failed');
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          cancel = undefined;
        }
      },
    });
  }
}
