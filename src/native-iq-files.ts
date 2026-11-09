import { MAYHEM_C8_LIMITS } from '../packages/core/mayhem-c8-import.ts';
import { IQ_DATA_LIMIT, IQ_METADATA_LIMIT } from '../packages/core/iq-offline.ts';
import type { IqFile, IqPair, IqSide, IqInputProfile } from './iq-workbench.ts';

export interface NativeIqAsset { readonly uri: string; readonly name: string; readonly size?: number }
export interface NativeIqReadHandle {
 readonly size: number | null;
 readBytes(length: number): Promise<Uint8Array>;
 close(): void;
}
export type NativeIqOpen = (uri: string) => NativeIqReadHandle | Promise<NativeIqReadHandle>;
export const IQ_READ_CHUNK = 16_384;

function validSize(side: IqSide, size: unknown, profile: IqInputProfile): size is number {
 if (profile === 'mayhem-c8') return typeof size === 'number' && Number.isSafeInteger(size) && size >= (side === 'metadata' ? 1 : 2) && size <= (side === 'metadata' ? MAYHEM_C8_LIMITS.sidecarBytes : MAYHEM_C8_LIMITS.dataBytes) && (side === 'metadata' || size % 2 === 0);
 return typeof size === 'number' && Number.isSafeInteger(size) &&
  size >= (side === 'metadata' ? 1 : 4) && size <= (side === 'metadata' ? IQ_METADATA_LIMIT : IQ_DATA_LIMIT) &&
  (side === 'metadata' || size % 4 === 0);
}

/** Read only the selected URI. Never use unbounded arrayBuffer/text/base64 helpers. */
async function readExact(uri: string, size: number, open: NativeIqOpen): Promise<ArrayBuffer> {
 const handle = await open(uri);
 try {
  if (handle.size !== size) throw new Error('Selected file size changed or is unavailable.');
  const output = new Uint8Array(size);
  let offset = 0;
  while (offset < size) {
   const requested = Math.min(IQ_READ_CHUNK, size - offset);
   const chunk = await handle.readBytes(requested);
   if (!(chunk instanceof Uint8Array) || chunk.byteLength < 1 || chunk.byteLength > requested)
    throw new Error('Selected file returned an invalid or short read.');
   output.set(chunk, offset);
   offset += chunk.byteLength;
  }
  // A lying/stale provider size must not silently truncate a larger file.
  const extra = await handle.readBytes(1);
  if (!(extra instanceof Uint8Array) || extra.byteLength !== 0 || handle.size !== size)
   throw new Error('Selected file changed while reading.');
  return output.buffer;
 } finally {
  handle.close();
 }
}

/** Captures labels and local handles only. No stat, open, byte read, or cache copy. */
export function nativeIqPair(assets: readonly NativeIqAsset[] | null | undefined, open: NativeIqOpen, profile: IqInputProfile = 'sigmf'): IqPair {
 if (profile !== 'sigmf' && profile !== 'mayhem-c8') throw new Error('Unknown I/Q profile');
 if (!Array.isArray(assets) || assets.length !== 2) throw new Error('Choose exactly two files for the selected I/Q profile.');
 const files: Partial<Record<IqSide, IqFile>> = {};
 for (const asset of assets) {
  const name = asset.name, uri = asset.uri, size = asset.size;
  if (typeof name !== 'string' || name.length < 1 || name.length > 256) throw new Error('Invalid file label.');
  const side: IqSide | null = profile === 'mayhem-c8' ? (name.endsWith('.txt') ? 'metadata' : name.endsWith('.c8') ? 'data' : null) : name.endsWith('.sigmf-meta') ? 'metadata' : name.endsWith('.sigmf-data') ? 'data' : null;
  if (!side || files[side]) throw new Error('Choose one metadata/sidecar and one data file for the selected profile.');
  if (!validSize(side, size, profile)) throw new Error('File size is missing or outside the supported profile.');
  if (typeof uri !== 'string' || uri.length > 8192 || /[\u0000-\u001f\u007f]/.test(uri) ||
      !(/^(?:file:\/\/\/[^\s]|content:\/\/[^/\s]+\/[^\s])/.test(uri)))
   throw new Error('Only selected local file or content-provider handles are supported.');
  files[side] = Object.freeze({name: name.slice(0,160), size, arrayBuffer: () => readExact(uri, size, open)});
 }
 if (!files.metadata || !files.data) throw new Error('A complete I/Q pair is required.');
 return Object.freeze({...(profile === 'mayhem-c8' ? {profile} : {}),metadata: files.metadata, data: files.data});
}

export interface NativeIqPickResult { readonly canceled: boolean; readonly assets?: readonly NativeIqAsset[] | null }
export class NativeIqPickerBusyError extends Error {}

/** The native module has one OS picker. Keep this gate above component lifetimes. */
export function nativeIqSingleFlight(pick: (isCurrent: () => boolean) => Promise<NativeIqPickResult>) {
 let running = false;
 return async (isCurrent: () => boolean): Promise<NativeIqPickResult> => {
  if (!isCurrent()) return {canceled:true};
  if (running) throw new NativeIqPickerBusyError('The system picker is still open.');
  running = true;
  try { return await pick(isCurrent); }
  finally { running = false; }
 };
}

export interface NativeIqPickerState {
 readonly picking: boolean;
 readonly foreground: boolean;
 readonly candidate: Readonly<{ metadata: string; data: string }> | null;
 readonly message: string;
}

/** Picker lifetime is separate from analysis. Returned handles require a new explicit Stage tap. */
export class NativeIqPickerSession {
 #mounted = false; #foreground = false; #running = false; #epoch = 0; #notifying = false;
 #pair: IqPair | null = null; #profile: IqInputProfile = 'sigmf';
 #state: NativeIqPickerState = Object.freeze({picking:false,foreground:false,candidate:null,message:'Choose a pair, then Stage and Inspect.'});
 #listeners = new Set<() => void>();
 readonly #pick: (isCurrent: () => boolean) => Promise<NativeIqPickResult>; readonly #open: NativeIqOpen;
 constructor(pick: (isCurrent: () => boolean) => Promise<NativeIqPickResult>, open: NativeIqOpen) { this.#pick = pick; this.#open = open; }
 setProfile(profile: IqInputProfile) {
  if ((profile === 'sigmf' || profile === 'mayhem-c8') && profile !== this.#profile) { this.#profile = profile; this.reset(); }
 }
 get state() { return this.#state; }
 subscribe(listener: () => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
 #publish(message: string) {
  this.#state = Object.freeze({picking:this.#running,foreground:this.#mounted && this.#foreground,
   candidate:this.#pair ? Object.freeze({metadata:this.#pair.metadata.name,data:this.#pair.data.name}) : null,message});
  if (this.#notifying) return;
  this.#notifying = true;
  try { for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Observers cannot strand the picker. */ } } }
  finally { this.#notifying = false; }
 }
 attach(foreground: boolean) { this.#mounted = true; this.#foreground = foreground; this.#publish(this.#state.message); }
 detach() { this.#mounted = false; this.#foreground = false; this.reset(); }
 reset() { ++this.#epoch; this.#pair = null; this.#publish('Selection candidate released. Choose a pair, then Stage and Inspect.'); }
 foreground(active: boolean) {
  const wasForeground = this.#foreground;
  this.#foreground = active;
  // Native pickers themselves can background the app. They hold no analysed bytes.
  // Never auto-stage on return. A subsequent background discards settled handles.
  if (wasForeground && !active && !this.#running) this.reset();
  else this.#publish(this.#state.message);
 }
 async choose(expected: NativeIqPickerState = this.#state): Promise<void> {
  if (expected !== this.#state || !this.#mounted || !this.#foreground || this.#running) return;
  const epoch = ++this.#epoch;
  this.#pair = null; this.#running = true; this.#publish('Waiting for the system file picker.');
  try {
   const isCurrent = () => this.#mounted && this.#foreground && epoch === this.#epoch;
   if (!isCurrent()) return;
   const result = await this.#pick(isCurrent);
   if (!this.#mounted || epoch !== this.#epoch) return;
   if (result.canceled) { this.#publish('File selection cancelled.'); return; }
   const pair = nativeIqPair(result.assets,this.#open,this.#profile);
   if (!this.#mounted || epoch !== this.#epoch) return;
   this.#pair = pair;
   this.#publish('Pair selected, not staged or read. Return to APEX and explicitly Stage selected pair.');
  } catch (error) {
   if (this.#mounted && epoch === this.#epoch)
    this.#publish(error instanceof NativeIqPickerBusyError ? 'The system picker is still open. Finish or cancel it before choosing again.' : this.#profile === 'mayhem-c8' ? 'Pair selection refused. Choose one .txt sidecar (1–4096 bytes) and one .c8 file (2–131072 bytes, divisible by two), with known sizes.' : 'Pair selection refused. Choose exactly one .sigmf-meta (1–65536 bytes) and one .sigmf-data (4–262144 bytes, divisible by four), with known sizes.');
  } finally {
   this.#running = false;
   this.#publish(this.#state.message);
  }
 }
 takePair(expected: NativeIqPickerState = this.#state): IqPair | null {
  if (expected !== this.#state || !this.#mounted || !this.#foreground || this.#running || !this.#pair) return null;
  const pair = this.#pair;
  const epoch = ++this.#epoch; this.#pair = null; this.#publish('Pair handed to the workbench. Explicit Inspect is still required.');
  return this.#mounted && this.#foreground && epoch === this.#epoch ? pair : null;
 }
}
