import { captureNativeLocalFile, NativeLocalFileCloseError } from './native-local-file.ts';
import type { CapturedNativeLocalFile, NativeLocalFileAsset } from './native-local-file.ts';

export const NATIVE_HCI_MIN_BYTES = 16;
export const NATIVE_HCI_MAX_BYTES = 32_768;
export interface NativeHciPickResult { readonly canceled: boolean; readonly assets?: readonly NativeLocalFileAsset[] | null }
export type NativeHciPick = (current: () => boolean) => Promise<NativeHciPickResult>;
export type NativeHciRead = (file: CapturedNativeLocalFile, current: () => boolean) => Promise<Uint8Array>;
export class NativeHciBusyError extends Error {}

/** Put above component lifetimes. A pending OS operation is not cancelled by unmount. */
export function nativeHciSingleFlight<A extends unknown[], R>(operation: (...args: A) => Promise<R>, latchFailedClose = false) {
 let running = false, failedClose: NativeLocalFileCloseError | null = null;
 return async (...args: A): Promise<R> => {
  if (failedClose) throw failedClose;
  if (running) throw new NativeHciBusyError('An earlier HCI file operation is still pending.');
  running = true;
  try { return await operation(...args); }
  catch (error) { if (latchFailedClose && error instanceof NativeLocalFileCloseError) failedClose = error; throw error; }
  finally { running = false; }
 };
}
export interface NativeHciFileState {
 readonly picking: boolean; readonly reading: boolean; readonly foreground: boolean;
 readonly candidate: Readonly<{name: string; size: number}> | null; readonly message: string;
}

/** Picker results contain handles only. An explicit foreground Load reads bytes;
 * the workbench still requires a separate Inspect. No source URI enters state. */
export class NativeHciFileSession {
 #mounted = false; #foreground = false; #epoch = 0; #operation: 'pick' | 'read' | null = null;
 #file: CapturedNativeLocalFile | null = null; #notifying = false; #listeners = new Set<() => void>();
 #state: NativeHciFileState = Object.freeze({picking:false,reading:false,foreground:false,candidate:null,message:'Choose a file, then explicitly Load its bytes and Inspect.'});
 readonly #pick: NativeHciPick; readonly #read: NativeHciRead;
 constructor(pick: NativeHciPick, read: NativeHciRead) {this.#pick=pick;this.#read=read;Object.freeze(this);}
 get state() {return this.#state;}
 subscribe(listener: () => void) {this.#listeners.add(listener);return () => {this.#listeners.delete(listener);};}
 #publish(message: string) {
  this.#state = Object.freeze({picking:this.#operation==='pick',reading:this.#operation==='read',foreground:this.#mounted&&this.#foreground,
   candidate:this.#file?Object.freeze({name:this.#file.name,size:this.#file.size}):null,message});
  if (this.#notifying) return;
  this.#notifying=true;
  try {for (const listener of [...this.#listeners]) {try {listener();} catch { /* UI observers cannot strand native ownership. */ }}}
  finally {this.#notifying=false;}
 }
 attach(foreground: boolean) {this.#mounted=true;this.#foreground=foreground;this.#publish(this.#state.message);}
 detach() {this.#mounted=false;this.#foreground=false;this.reset();}
 reset() {++this.#epoch;this.#file=null;this.#publish('File selection released. Choose and Load again.');}
 foreground(active: boolean) {
  const prior=this.#foreground;this.#foreground=active;
  // OS pickers may background APEX. They do not read bytes into this session.
  // A returned candidate still needs a new foreground Load; later backgrounding discards it.
  if (prior&&!active&&this.#operation!=='pick') this.reset();
  else this.#publish(this.#state.message);
 }
 async choose(expected: NativeHciFileState = this.#state) {
  if (expected!==this.#state||!this.#mounted||!this.#foreground||this.#operation) return;
  const epoch=++this.#epoch;this.#file=null;this.#operation='pick';this.#publish('Waiting for the system file picker.');
  const current=()=>this.#mounted&&this.#foreground&&epoch===this.#epoch;
  try {
   if (!current()) return;
   const result=await this.#pick(current);
   if (!this.#mounted||epoch!==this.#epoch) return;
   if (result.canceled) {this.#publish('File selection cancelled. Existing HCI draft unchanged.');return;}
   if (!Array.isArray(result.assets)||result.assets.length!==1) throw new Error('Choose exactly one file.');
   const file=captureNativeLocalFile(result.assets[0]!,NATIVE_HCI_MIN_BYTES,NATIVE_HCI_MAX_BYTES);
   if (!this.#mounted||epoch!==this.#epoch) return;
   this.#file=file;this.#publish('File selected, not read. Return to APEX and explicitly Load selected HCI bytes.');
  } catch (error) {
   if (this.#mounted&&epoch===this.#epoch) this.#publish(error instanceof NativeHciBusyError
    ? 'An earlier HCI file picker is still open. Finish or cancel it before choosing again.'
    : 'Selection refused. Choose one local file with a known size of 16–32768 bytes. Existing draft unchanged.');
  } finally {this.#operation=null;this.#publish(this.#state.message);}
 }
 async load(expected: NativeHciFileState = this.#state, sourceCurrent: () => boolean = () => true): Promise<Uint8Array | null> {
  if (expected!==this.#state||!this.#mounted||!this.#foreground||this.#operation||!this.#file||!sourceCurrent()) return null;
  const file=this.#file,epoch=++this.#epoch;this.#file=null;this.#operation='read';this.#publish('Reading bounded selected bytes. Inspect has not run.');
  const current=()=>this.#mounted&&this.#foreground&&epoch===this.#epoch&&sourceCurrent();
  let result: Uint8Array | null=null;
  try {
   if (current()) result=await this.#read(file,current);
   if (current()) this.#publish('File bytes read and closed. Loading the exact bytes into the draft still requires a current workbench.');
  } catch (error) {
   if (current()) this.#publish(error instanceof NativeLocalFileCloseError
    ? 'File cleanup failed. New HCI file reads are blocked; restart the app before retrying.'
    : error instanceof NativeHciBusyError ? 'An earlier HCI file read is still draining. Choose and Load again after it settles.'
    : 'File read refused or changed. Existing draft unchanged; choose and Load again.');
  } finally {this.#operation=null;this.#publish(this.#state.message);}
  // A listener may clear, navigate or background during the final publication.
  return current()?result:null;
 }
}
