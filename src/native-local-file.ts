/** Bounded, read-only import. Native bindings must open only the selected URI read-only. */
export interface NativeLocalFileAsset { readonly uri: string; readonly name: string; readonly size?: number }
export interface NativeLocalReadHandle {
 readonly size: number | null;
 readBytes(length: number): Promise<Uint8Array>;
 close(): void;
}
export type NativeLocalOpen = (uri: string) => NativeLocalReadHandle | Promise<NativeLocalReadHandle>;
export interface CapturedNativeLocalFile {
 readonly name: string;
 readonly size: number;
 read(open: NativeLocalOpen, isCurrent?: () => boolean): Promise<Uint8Array>;
}
export const NATIVE_LOCAL_READ_CHUNK = 16_384;
/** Release is uncertain: callers must not start another native read on this gate. */
export class NativeLocalFileCloseError extends AggregateError {
 constructor(errors: readonly unknown[]) {
  super(errors, 'Native file handle close failed; release is uncertain.');
  this.name = 'NativeLocalFileCloseError';
 }
}

function localUri(value: unknown): value is string {
 if (typeof value !== 'string' || value.length > 8192 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
 // Entire URI, not a valid-looking prefix. Deliberately accept only path-based local
 // handles: no userinfo, port, query or fragment. Percent-encoded spaces are fine.
 const path = '(?:[A-Za-z0-9._~!$&\'()*+,;=:@/-]|%[0-9A-Fa-f]{2})+';
 if (!new RegExp('^(?:file:///(?!/)' + path + '|content://[A-Za-z0-9._-]+/' + path + ')$').test(value)) return false;
 try {
  const decoded = decodeURIComponent(value);
  return !/[\\\u0000-\u001f\u007f]/u.test(decoded);
 } catch { return false; }
}
function current(check: () => boolean): void {
 if (!check()) throw new Error('File import is no longer current.');
}
function bytes(value: unknown, maximum: number, allowEmpty: boolean): Uint8Array {
 if (!(value instanceof Uint8Array) || !(value.buffer instanceof ArrayBuffer) ||
     ('resizable' in value.buffer && value.buffer.resizable) ||
     value.byteLength > maximum || (!allowEmpty && value.byteLength === 0))
  throw new Error('Selected file returned invalid bytes.');
 // Copy synchronously before yielding again. Shared/resizable buffers are rejected;
 // a normal fixed buffer cannot change concurrently during this copy. The injected
 // native binding must likewise not write returned buffers concurrently from native code.
 return new Uint8Array(value);
}
async function readExact(uri: string, size: number, open: NativeLocalOpen, check: () => boolean): Promise<Uint8Array> {
 current(check);
 const handle = await open(uri);
 let failed = false;
 let failure: unknown;
 try {
  current(check);
  if (handle.size !== size) throw new Error('Selected file size changed or is unavailable.');
  const output = new Uint8Array(size);
  let offset = 0;
  while (offset < size) {
   current(check);
   const requested = Math.min(NATIVE_LOCAL_READ_CHUNK, size - offset);
   const raw = await handle.readBytes(requested);
   current(check);
   const chunk = bytes(raw, requested, false);
   output.set(chunk, offset);
   offset += chunk.byteLength;
  }
  current(check);
  const rawEnd = await handle.readBytes(1);
  current(check);
  if (bytes(rawEnd, 1, true).byteLength !== 0 || handle.size !== size)
   throw new Error('Selected file changed while reading.');
  current(check);
  return output;
 } catch (error) {
  failed = true; failure = error; throw error;
 } finally {
  try { handle.close(); }
  catch (closeError) {
   throw new NativeLocalFileCloseError(failed ? [failure, closeError] : [closeError]);
  }
 }
}

/** Capture only: no stat, open, read or cache copy. URI stays private in the closure.
 * Size checks detect growth/truncation, not same-size mutation or authenticity.
 * Cancellation is cooperative: pending native operations drain before close, never
 * assumed interruptible. Each read returns a new, independently owned snapshot.
 */
export function captureNativeLocalFile(asset: NativeLocalFileAsset, minBytes: number, maxBytes: number): CapturedNativeLocalFile {
 if (!Number.isSafeInteger(minBytes) || !Number.isSafeInteger(maxBytes) || minBytes < 0 || maxBytes < minBytes)
  throw new Error('Invalid file size bounds.');
 if (!asset || typeof asset !== 'object') throw new Error('Invalid selected file.');
 const {name, uri, size} = asset;
 if (typeof name !== 'string' || name.length < 1 || name.length > 256) throw new Error('Invalid file label.');
 if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < minBytes || size > maxBytes)
  throw new Error('File size is missing or outside the supported bounds.');
 if (!localUri(uri)) throw new Error('Only selected local file or content-provider handles are supported.');
 return Object.freeze({
  name: name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, '\ufffd').slice(0,160),
  size,
  read: (open: NativeLocalOpen, isCurrent: () => boolean = () => true) => readExact(uri, size, open, isCurrent),
 });
}
