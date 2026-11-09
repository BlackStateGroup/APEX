import { importMayhemC8, MAYHEM_C8_LIMITS, type MayhemC8Import } from '../packages/core/mayhem-c8-import.ts';
import { prepareIq, IQ_METADATA_LIMIT, IQ_DATA_LIMIT } from '../packages/core/iq-offline.ts';
import type { IqByteHasher, IqImportContext } from '../packages/core/iq-offline.ts';
import type { IqAnalysisOptions } from '../packages/core/iq-analysis.ts';
import { analyzeIq, analyzeIqTimeFrequency } from '../packages/core/iq-analysis.ts';
import { IqAnalysisEngine, IQ_ENGINE_IDLE } from './iq-engine.ts';

import { analyzeIqActivity } from '../packages/core/iq-activity.ts';
import type { IqActivityOptions } from '../packages/core/iq-activity.ts';

export type IqFftSize = 256 | 512 | 1024 | 2048 | 4096;
export type IqWindowMode = 'default' | 'explicit' | 'time-frequency' | 'activity';
export const IQ_FFT_SIZES: readonly IqFftSize[] = Object.freeze([256,512,1024,2048,4096]);
const defaults = () => ({ activitySettings:activityDefaults(), windowMode: 'default' as IqWindowMode, fftSize: 1024 as IqFftSize | null, startText: '0', startSample: 0 as number | null, hopText: '1024', hopSamples: 1024 as number | null, frameCountText: '1', frameCount: 1 as number | null });
export type IqInputProfile = 'sigmf' | 'mayhem-c8';
export type IqC8Provenance = Immutable<Pick<MayhemC8Import, 'sourceProfile' | 'parserVersion' | 'sourceClaims' | 'conversion' | 'original' | 'verification'>>;
export type IqSide = 'metadata' | 'data';
export interface IqPair { readonly profile?: IqInputProfile; readonly metadata: IqFile; readonly data: IqFile }
export interface IqFile { readonly name: string; readonly size: number; arrayBuffer(): Promise<ArrayBuffer> }
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
type Analysis = ReturnType<typeof analyzeIq>;
type Spectrum = NonNullable<Analysis['spectrum']>;
export type IqBin = Immutable<Spectrum['bins'][number]>;
export interface IqLabel { readonly name: string; readonly size: number }
export interface IqReport {
 readonly c8Import?: IqC8Provenance;
 readonly origin: IqImportContext['origin']; readonly importedAt: string; readonly producerTime: string | null;
 readonly metadataSha256: string; readonly dataSha256: string; readonly metadataLength: number; readonly dataLength: number;
 readonly sha512Status: 'byte-match-only' | 'not-provided'; readonly sampleRate: number; readonly centerFrequency: number;
 readonly statistics: Immutable<Analysis['statistics']>; readonly spectrum: Immutable<Omit<Spectrum, 'bins'>> | null;
 readonly warnings: readonly string[];
}
type TimeFrequency = ReturnType<typeof analyzeIqTimeFrequency>;
export type IqFrameSummary = Immutable<Omit<TimeFrequency['frames'][number], 'amplitude' | 'dbRelativeToUnitAmplitude' | 'displayDb'>>;
export interface IqTimeFrequencyReport extends Omit<IqReport, 'statistics' | 'spectrum'> {
 readonly geometry: Immutable<TimeFrequency['options']>;
 readonly cellCount: number; readonly windowDurationSeconds: number; readonly binSpacingHz: number;
 readonly normalization: string; readonly displayFloorDb: number;
 readonly spacing: 'overlap' | 'contiguous' | 'gaps'; readonly gapSamples: number;
}
type Activity = ReturnType<typeof analyzeIqActivity>;
export type IqActivityField = keyof IqActivityOptions;
export type IqActivitySettings = Readonly<Record<IqActivityField,string>>;
export type IqActivityFrame = Immutable<Activity['frames'][number]>;
export type IqActivityRun = Immutable<Omit<Activity['runs'][number],'measuredSampleIntervals'> & {index:number; intervalCount:number}>;
export type IqActivityInterval = Immutable<Activity['runs'][number]['measuredSampleIntervals'][number]>;
export interface IqActivityReport extends Omit<IqReport,'statistics'|'spectrum'>, Immutable<Pick<Activity,'analysisVersion'|'options'|'limits'|'processedCells'|'windowRelationship'|'units'|'comparison'|'timeBasis'|'runMeaning'>> {}
const activityDefaults = (): IqActivitySettings => Object.freeze({startSample:'0',windowSamples:'1024',hopSamples:'1024',frameCount:'1',thresholdNumerator:'0',thresholdDenominator:'1'});
const activityFields = Object.freeze(Object.keys(activityDefaults()) as IqActivityField[]);
function validActivityText(field:IqActivityField,text:unknown): text is string {
 if (typeof text !== 'string') return false;
 const digits = field === 'windowSamples' ? 4 : field === 'frameCount' ? 3 : field.startsWith('threshold') ? 128 : 5;
 if (text.length<1 || text.length>digits || /[^0-9]/.test(text)) return false;
 if (field === 'thresholdNumerator') return true;
 if (field === 'thresholdDenominator') return /[1-9]/.test(text);
 const n=Number(text), max=field==='startSample'?65535:field==='windowSamples'?4096:field==='hopSamples'?65536:256;
 return n >= (field==='startSample'?0:1) && n<=max;
}
export function validActivitySettings(settings:IqActivitySettings):boolean { return activityFields.every(field=>validActivityText(field,settings[field])); }
const emptyActivity = () => ({activityReport:null,activityFrames:Object.freeze([]) as readonly IqActivityFrame[],activityFramePage:0,activityFramePageCount:0,activityRuns:Object.freeze([]) as readonly IqActivityRun[],activityRunPage:0,activityRunPageCount:0,selectedActivityRun:null,activityIntervals:Object.freeze([]) as readonly IqActivityInterval[],activityIntervalPage:0,activityIntervalPageCount:0});
const emptyFrames: readonly IqFrameSummary[] = Object.freeze([]);
const emptyTimeFrequency = () => ({timeFrequencyReport: null, frames: emptyFrames, framePage: 0, framePageCount: 0, selectedFrame: null});
export interface IqState {
 readonly inputRevision: number; readonly inputProfile: IqInputProfile;
 readonly analysisEngine: string;
 readonly activitySettings:IqActivitySettings; readonly activityReport:IqActivityReport|null;
 readonly activityFrames:readonly IqActivityFrame[]; readonly activityFramePage:number; readonly activityFramePageCount:number;
 readonly activityRuns:readonly IqActivityRun[]; readonly activityRunPage:number; readonly activityRunPageCount:number;
 readonly selectedActivityRun:IqActivityRun|null; readonly activityIntervals:readonly IqActivityInterval[]; readonly activityIntervalPage:number; readonly activityIntervalPageCount:number;
 readonly windowMode: IqWindowMode; readonly fftSize: IqFftSize | null; readonly startText: string; readonly startSample: number | null;
 readonly hopText: string; readonly hopSamples: number | null; readonly frameCountText: string; readonly frameCount: number | null;
 readonly timeFrequencyReport: IqTimeFrequencyReport | null; readonly frames: readonly IqFrameSummary[];
 readonly framePage: number; readonly framePageCount: number; readonly selectedFrame: IqFrameSummary | null;
 readonly metadata: IqLabel | null; readonly data: IqLabel | null; readonly origin: IqImportContext['origin'];
 readonly busy: boolean; readonly pending: boolean; readonly message: string;
 readonly report: IqReport | null; readonly page: number; readonly pageCount: number; readonly bins: readonly IqBin[];
}
interface Source { label: IqLabel; read: () => Promise<ArrayBuffer> }
const emptyBins = Object.freeze([]) as readonly IqBin[];
const initial = (): IqState => Object.freeze({ inputRevision: 0, inputProfile:'sigmf', analysisEngine:IQ_ENGINE_IDLE, ...defaults(), ...emptyActivity(), ...emptyTimeFrequency(), metadata: null, data: null, origin: 'external-file', busy: false, pending: false, message: 'Stage a pair, then explicitly Inspect.', report: null, page: 0, pageCount: 0, bins: emptyBins });
// Copy every mutable analysis object before publication, without exposing core/source aliases.
function immutable<T>(value: T): Immutable<T> {
 if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as Immutable<T>;
 if (value !== null && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([k,v]) => [k, immutable(v)]))) as Immutable<T>;
 return value as Immutable<T>;
}
function validSizes(metadata: number, data: number, profile: IqInputProfile): boolean {
 if (profile === 'mayhem-c8') return Number.isSafeInteger(metadata) && metadata >= 1 && metadata <= MAYHEM_C8_LIMITS.sidecarBytes && Number.isSafeInteger(data) && data >= 2 && data <= MAYHEM_C8_LIMITS.dataBytes && data % 2 === 0;
 return Number.isSafeInteger(metadata) && metadata >= 1 && metadata <= IQ_METADATA_LIMIT && Number.isSafeInteger(data) && data >= 4 && data <= IQ_DATA_LIMIT && data % 4 === 0;
}
function label(name: string, size: number): IqLabel { return Object.freeze({ name: name.slice(0,160), size }); }
function returnedBytes(value: ArrayBuffer, expected: number): Uint8Array {
 // Intrinsic rejects spoofed objects and SharedArrayBuffer. No text decoding/normalization here.
 const length = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!.call(value);
 const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get?.call(value);
 if (length !== expected || resizable) throw new Error('Read length mismatch');
 return new Uint8Array(value).slice();
}
/** Private handles and a single actual outstanding operation. Fencing is not cancellation. */
export class IqController {
 #state: IqState = initial(); #active: boolean; #lease = 0; #generation = 0; #running = false; #notifying = false;
 #sources: Partial<Record<IqSide, Source>> = {}; #bins: readonly IqBin[] = emptyBins;
 #timeFrequency: Immutable<Pick<TimeFrequency, 'axis' | 'frames'>> | null = null;
 #frameSummaries: readonly IqFrameSummary[] = emptyFrames;
 #activityFrames: readonly IqActivityFrame[] = Object.freeze([]);
 #activityRuns: Immutable<Activity['runs']> = Object.freeze([]);
 #activityRunSummaries:readonly IqActivityRun[] = Object.freeze([]);
 #clearActivity() { this.#activityFrames=Object.freeze([]); this.#activityRuns=Object.freeze([]); this.#activityRunSummaries=Object.freeze([]); }
 readonly #engine:IqAnalysisEngine;
 readonly #hasher: IqByteHasher; readonly #now: () => string; #listeners = new Set<() => void>();
 constructor(active: boolean, hasher: IqByteHasher, now: () => string = () => new Date().toISOString(), engine:IqAnalysisEngine = new IqAnalysisEngine()) { this.#active = active; this.#hasher = hasher; this.#now = now; this.#engine=engine; Object.freeze(this); }
 get state() { return this.#state; } get lease() { return this.#lease; }
 isActive(lease: number) { return this.#active && lease === this.#lease; }
 subscribe(listener: () => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
 #publish(change: Partial<IqState>) {
  this.#state = Object.freeze({ ...this.#state, ...change, busy: this.#running });
  // Observers may read/mutate state, but cannot strand job ownership by throwing.
  // Snapshot the set and suppress nested dispatch, not the observer's state change.
  if (this.#notifying) return;
  this.#notifying = true;
  try { for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Observer failure does not alter inspection outcome. */ } } }
  finally { this.#notifying = false; }
 }
 #current(lease: number, state: IqState) { return this.isActive(lease) && this.#state === state; }
 #invalidate(message: string) { this.#engine.cancel(); ++this.#generation; this.#bins = emptyBins; this.#timeFrequency = null; this.#frameSummaries = emptyFrames; this.#clearActivity(); this.#publish({ ...emptyActivity(), ...emptyTimeFrequency(), analysisEngine:IQ_ENGINE_IDLE, report: null, bins: emptyBins, pending: false, page: 0, pageCount: 0, message }); }
 #selection(sources: Partial<Record<IqSide, Source>>, origin: IqImportContext['origin'], message: string, reset = false, inputChange = true, inputProfile: IqInputProfile = this.#state.inputProfile) {
  // Commit handles, provenance, labels and invalidation before one notification.
  // A synchronous observer's newer selection/clear/exit then remains authoritative.
  this.#engine.cancel(); ++this.#generation; this.#sources = sources; this.#bins = emptyBins; this.#timeFrequency = null; this.#frameSummaries = emptyFrames; this.#clearActivity();
  this.#publish({inputProfile,inputRevision: this.#state.inputRevision + (inputChange ? 1 : 0), ...emptyActivity(), ...emptyTimeFrequency(),...(reset ? defaults() : {}),metadata:sources.metadata?.label ?? null,data:sources.data?.label ?? null,origin,analysisEngine:IQ_ENGINE_IDLE,report:null,bins:emptyBins,pending:false,page:0,pageCount:0,message});
 }
 activate() { if (!this.#active) { this.#active = true; ++this.#lease; } }
 deactivate() { this.#engine.release(); this.#active = false; ++this.#lease; this.#selection({},this.#state.origin,'Selection released on exit/background. Outstanding work drains without publication.',true,false); }
 inputProfile(profile: IqInputProfile, lease: number, state: IqState) {
  if (!this.#current(lease,state) || (profile !== 'sigmf' && profile !== 'mayhem-c8') || profile === state.inputProfile) return;
  this.#selection({},'external-file','Input profile changed. Choose a new pair, then explicitly Inspect.',true,true,profile);
 }
 stageFile(side: IqSide, file: IqFile | null, lease: number, state: IqState) {
  if (!this.#current(lease,state) || (side !== 'metadata' && side !== 'data')) return;
  const sources: Partial<Record<IqSide, Source>> = state.origin === 'synthetic-fixture' ? {} : {...this.#sources};
  let message = 'Selection staged only. Explicit Inspect required.';
  if (file) {
   try { const captured = label(file.name,file.size); const read = file.arrayBuffer.bind(file); sources[side] = {label:captured,read}; }
   catch { delete sources[side]; message = 'File handle refused.'; }
  } else { delete sources[side]; }
  this.#selection(sources,'external-file',message);
 }
 /** Atomically stage a native pair; no intermediate mixed pair or source reads. */
 stagePair(pair: IqPair, lease: number, state: IqState) {
  if (!this.#current(lease,state)) return;
  const sources: Partial<Record<IqSide, Source>> = {};
  let message = 'Selected pair staged only. Explicit Inspect required.';
  try {
   if ((pair.profile ?? 'sigmf') !== state.inputProfile) throw new Error('Pair profile changed');
   for (const side of ['metadata','data'] as const) {
    const file = pair[side];
    sources[side] = {label:label(file.name,file.size),read:file.arrayBuffer.bind(file)};
   }
  } catch {
   delete sources.metadata; delete sources.data;
   message = 'Selected pair refused.';
  }
  // Property access must not overwrite a newer reentrant intent.
  if (this.#current(lease,state)) this.#selection(sources,'external-file',message);
 }
 example(lease: number, state: IqState) {
  if (!this.#current(lease,state)) return;
  // Manually authored supported profile: 1024 zero complex samples. Loading does no digest or inspection.
  // Exact ASCII literal: one code unit is one byte, with no runtime text encoder required.
  const metadata = Uint8Array.from('{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":1024},"captures":[{"core:sample_start":0,"core:frequency":0}],"annotations":[]}',character=>character.charCodeAt(0));
  const data = new Uint8Array(4096);
  const sources = { metadata: {label:label('synthetic-zero.sigmf-meta',metadata.length),read:async()=>metadata.slice().buffer}, data: {label:label('synthetic-zero.sigmf-data',data.length),read:async()=>data.slice().buffer} };
  this.#selection(sources,'synthetic-fixture','Synthetic zero example staged, not inspected. Explicit Inspect required.',true,true,'sigmf');
 }
 toneExample(lease: number, state: IqState) {
  if (!this.#current(lease,state)) return;
  const metadata = Uint8Array.from('{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":8192},"captures":[{"core:sample_start":0,"core:frequency":0}],"annotations":[]}',c=>c.charCodeAt(0));
  const data = new Uint8Array(8192*4), view = new DataView(data.buffer);
  // Exact integer quarter cycles, not a trigonometric oracle. Second half reverses Q.
  const pairs = [[16384,0],[0,16384],[-16384,0],[0,-16384]] as const;
  for (let k=0;k<8192;k++) { const [i,q]=pairs[k%4]!; view.setInt16(k*4,i,true); view.setInt16(k*4+2,k<4096?q:-q,true); }
  this.#selection({metadata:{label:label('synthetic-quarter-cycle.sigmf-meta',metadata.length),read:async()=>metadata.slice().buffer},data:{label:label('synthetic-quarter-cycle.sigmf-data',data.length),read:async()=>data.slice().buffer}},'synthetic-fixture','Synthetic quarter-cycle example staged only. Explicit Inspect required.',true,true,'sigmf');
 }
 #settings(change: Partial<IqState>) {
  this.#engine.cancel(); ++this.#generation; this.#bins = emptyBins; this.#timeFrequency = null; this.#frameSummaries = emptyFrames; this.#clearActivity();
  this.#publish({...emptyActivity(), ...emptyTimeFrequency(),...change,analysisEngine:IQ_ENGINE_IDLE,report:null,bins:emptyBins,pending:false,page:0,pageCount:0,message:'Window settings staged only. Explicit Inspect required.'});
 }
 windowMode(mode: IqWindowMode, lease: number, state: IqState) {
  if (!this.#current(lease,state)) return;
  // Invalid runtime choices invalidate rather than silently reuse a previous window.
  this.#settings(mode === 'default' || mode === 'explicit' || mode === 'time-frequency' || mode === 'activity' ? {windowMode:mode} : {windowMode:'explicit',fftSize:null});
 }
 fftSize(size: IqFftSize, lease: number, state: IqState) {
  if (this.#current(lease,state)) this.#settings({fftSize:IQ_FFT_SIZES.includes(size)?size:null});
 }
 startSample(text: string, lease: number, state: IqState) {
  if (!this.#current(lease,state)) return;
  const valid = typeof text === 'string' && text.length >= 1 && text.length <= 5 && !/[^0-9]/.test(text) && Number(text)<=65535;
  // Never truncate an oversized edit into a valid value or retain arbitrary input.
  this.#settings({startText:valid?text:'',startSample:valid?Number(text):null});
 }
 hopSamples(text: string, lease: number, state: IqState) {
  if (!this.#current(lease,state)) return;
  const valid = typeof text === 'string' && text.length >= 1 && text.length <= 5 && !/[^0-9]/.test(text) && Number(text)>=1 && Number(text)<=65536;
  this.#settings({hopText:valid?text:'',hopSamples:valid?Number(text):null});
 }
 frameCount(text: string, lease: number, state: IqState) {
  if (!this.#current(lease,state)) return;
  const valid = typeof text === 'string' && text.length >= 1 && text.length <= 2 && !/[^0-9]/.test(text) && Number(text)>=1 && Number(text)<=64;
  this.#settings({frameCountText:valid?text:'',frameCount:valid?Number(text):null});
 }
 activitySetting(field:IqActivityField,text:string,lease:number,state:IqState) {
  if (!this.#current(lease,state) || !activityFields.includes(field)) return;
  this.#settings({activitySettings:Object.freeze({...state.activitySettings,[field]:validActivityText(field,text)?text:''})});
 }
 activityFramePage(page:number,lease:number,state:IqState) {
  if(this.#current(lease,state)&&Number.isSafeInteger(page)&&page>=0&&page<state.activityFramePageCount)
   this.#publish({activityFramePage:page,activityFrames:Object.freeze(this.#activityFrames.slice(page*4,page*4+4))});
 }
 activityRunPage(page:number,lease:number,state:IqState) {
  if(this.#current(lease,state)&&Number.isSafeInteger(page)&&page>=0&&page<state.activityRunPageCount)
   this.#publish({activityRunPage:page,activityRuns:Object.freeze(this.#activityRunSummaries.slice(page*4,page*4+4))});
 }
 #selectActivityRun(index:number) {
  const intervals=this.#activityRuns[index]!.measuredSampleIntervals;
  return {selectedActivityRun:this.#activityRunSummaries[index]!,activityIntervalPage:0,activityIntervalPageCount:Math.ceil(intervals.length/8),activityIntervals:Object.freeze(intervals.slice(0,8))};
 }
 selectActivityRun(index:number,lease:number,state:IqState) {
  if(this.#current(lease,state)&&Number.isSafeInteger(index)&&index>=0&&index<this.#activityRuns.length)
   this.#publish(this.#selectActivityRun(index));
 }
 activityIntervalPage(page:number,lease:number,state:IqState) {
  if(this.#current(lease,state)&&state.selectedActivityRun&&Number.isSafeInteger(page)&&page>=0&&page<state.activityIntervalPageCount)
   this.#publish({activityIntervalPage:page,activityIntervals:Object.freeze(this.#activityRuns[state.selectedActivityRun.index]!.measuredSampleIntervals.slice(page*8,page*8+8))});
 }
 framePage(page: number, lease: number, state: IqState) {
  if (this.#current(lease,state) && Number.isSafeInteger(page) && page>=0 && page<state.framePageCount)
   this.#publish({framePage:page,frames:Object.freeze(this.#frameSummaries.slice(page*4,page*4+4))});
 }
 #selectFrame(index: number) {
  const tf = this.#timeFrequency!, frame = tf.frames[index]!;
  this.#bins = Object.freeze(tf.axis.map((axis,k)=>Object.freeze({...axis,amplitude:frame.amplitude[k]!,dbRelativeToUnitAmplitude:frame.dbRelativeToUnitAmplitude[k]!,displayDb:frame.displayDb[k]!})));
  return {selectedFrame:this.#frameSummaries[index]!,page:0,pageCount:Math.ceil(this.#bins.length/8),bins:Object.freeze(this.#bins.slice(0,8))};
 }
 selectFrame(index: number, lease: number, state: IqState) {
  if (this.#current(lease,state) && this.#timeFrequency && Number.isSafeInteger(index) && index>=0 && index<this.#frameSummaries.length)
   this.#publish(this.#selectFrame(index));
 }
 clear(lease: number, state: IqState) { if (this.#current(lease,state)) this.#selection({},'external-file','Cleared. In-flight reads/hashes are fenced, not cancelled or securely erased.',true); }
 page(page: number, lease: number, state: IqState) { if (this.#current(lease,state) && Number.isSafeInteger(page) && page >= 0 && page < state.pageCount) this.#publish({page,bins:Object.freeze(this.#bins.slice(page*8,page*8+8))}); }
 showPeakPage(lease: number, state: IqState) {
  if (!this.#current(lease,state)) return;
  const spectrum = state.report?.spectrum;
  const size = state.timeFrequencyReport?.geometry.fftSize ?? spectrum?.fftSize;
  const signedBin = state.timeFrequencyReport ? state.selectedFrame?.peakSignedBin : spectrum?.peakBin?.signedBin;
  if (size === undefined || signedBin == null) return;
  this.page(Math.floor((signedBin + size/2)/8),lease,state);
 }
 async inspect(lease: number, state: IqState): Promise<void> {
  if (!this.#current(lease,state) || this.#running) return;
  const metadataSource = this.#sources.metadata, dataSource = this.#sources.data;
  // Snapshot validated primitives before any notification or await; never retain PreparedIq.
  const options: IqAnalysisOptions | null = state.fftSize === null || state.startSample === null ? null : state.windowMode === 'default' ? {} : {fftSize:state.fftSize,startSample:state.startSample};
  const activityMode = state.windowMode === 'activity';
  const a = state.activitySettings;
  const activityOptions:IqActivityOptions|null = validActivitySettings(a) ? {startSample:Number(a.startSample),windowSamples:Number(a.windowSamples),hopSamples:Number(a.hopSamples),frameCount:Number(a.frameCount),thresholdNumerator:a.thresholdNumerator,thresholdDenominator:a.thresholdDenominator} : null;
  const tfMode = state.windowMode === 'time-frequency';
  const tfOptions = state.fftSize === null || state.startSample === null || state.hopSamples === null || state.frameCount === null ? null : {fftSize:state.fftSize,startSample:state.startSample,hopSamples:state.hopSamples,frameCount:state.frameCount};
  const origin = state.origin, inputProfile = state.inputProfile;
  const sampleCount = (dataSource?.label.size ?? 0) / (inputProfile === 'mayhem-c8' ? 2 : 4);
  // Acquire ownership and the expected generation before any observer can reenter.
  const generation = this.#generation + 1, valid = () => this.isActive(lease) && generation === this.#generation;
  this.#running = true;
  try {
   this.#invalidate('Validating both captured sizes before reading either source.');
   if (!valid()) return;
   if (!metadataSource || !dataSource || !validSizes(metadataSource.label.size,dataSource.label.size,inputProfile)) { this.#publish({message:inputProfile === 'mayhem-c8' ? 'C8 pair refused: sidecar must be 1–4096 bytes; data 2–131072 bytes and divisible by two. No reads started.' : 'Pair refused: metadata must be 1–65536 bytes; data 4–262144 bytes and divisible by four. No reads started.'}); return; }
   if (!activityMode && !tfMode && (!options || (options.fftSize !== undefined && options.startSample! + options.fftSize > sampleCount))) { this.#publish({message:'Window refused: enter 1–5 ASCII decimal digits, 0–65535, and select a complete window within the data. No reads started.'}); return; }
   if (tfMode && (!tfOptions || tfOptions.fftSize*tfOptions.frameCount>16384 || tfOptions.startSample+(tfOptions.frameCount-1)*tfOptions.hopSamples+tfOptions.fftSize>sampleCount)) {
    this.#publish({message:'Time-frequency geometry refused: valid FFT/start, hop 1–65536, frames 1–64, at most 16384 cells, and final complete window must fit. No reads started.'}); return;
   }
   if (activityMode && (!activityOptions || activityOptions.windowSamples*activityOptions.frameCount>262144 || activityOptions.startSample+(activityOptions.frameCount-1)*activityOptions.hopSamples+activityOptions.windowSamples>sampleCount)) {
    this.#publish({message:'Selected-window energy / threshold refused: all six settings must be valid, at most 262144 processed cells, and final complete window must fit. No reads started.'}); return;
   }
   this.#publish({pending:true,message:'Reading and hashing exact local bytes. No upload. Work is fenced, not cancelled.'});
   if (!valid()) return;
   const context: IqImportContext = {schemaVersion:1,origin,importedAt:this.#now()};
   if (!valid()) return;
   const metadataBuffer = await metadataSource.read(); if (!valid()) return;
   const metadata = returnedBytes(metadataBuffer,metadataSource.label.size);
   const dataBuffer = await dataSource.read(); if (!valid()) return;
   const data = returnedBytes(dataBuffer,dataSource.label.size);
   // prepareIq awaits multiple digests. Fence each boundary, including before starting a subsequent hash.
   const fencedHasher: IqByteHasher = {digest: async (algorithm, bytes) => { if (!valid()) throw new Error('Stale inspection'); const hash = await this.#hasher.digest(algorithm,bytes); if (!valid()) throw new Error('Stale inspection'); return hash; }};
   if (!valid()) return;
   const converted = inputProfile === 'mayhem-c8' ? await importMayhemC8(data,metadata,context,fencedHasher) : null;
   if (!valid()) return;
   const prepared = converted ? converted.recording : await prepareIq(metadata,data,context,fencedHasher); if (!valid()) return;
   const importWarnings = converted?.warnings ?? [];
   const c8Import: IqC8Provenance | undefined = converted ? immutable({sourceProfile:converted.sourceProfile,parserVersion:converted.parserVersion,sourceClaims:converted.sourceClaims,conversion:converted.conversion,original:converted.original,verification:converted.verification}) : undefined;
   const captures = prepared.supplierClaim.captures as readonly Record<string, unknown>[];
   const producerTime = captures[0]?.['core:datetime'];
   const source = {...(c8Import ? {c8Import} : {}),origin:prepared.context.origin,importedAt:prepared.context.importedAt,producerTime:typeof producerTime === 'string' ? producerTime : null,metadataSha256:prepared.metadataSha256,dataSha256:prepared.dataSha256,metadataLength:prepared.metadataLength,dataLength:prepared.dataLength,sha512Status:prepared.sha512Status,sampleRate:prepared.sampleRate,centerFrequency:prepared.centerFrequency};
   if (activityMode) {
    const analysis=analyzeIqActivity(prepared,activityOptions!);
    if (!valid()) return;
    this.#activityFrames=immutable(analysis.frames);
    this.#activityRuns=immutable(analysis.runs);
    this.#activityRunSummaries=Object.freeze(analysis.runs.map(({measuredSampleIntervals,...run},index)=>immutable({...run,index,intervalCount:measuredSampleIntervals.length})));
    const {analysisVersion,options,limits,processedCells,windowRelationship,units,comparison,timeBasis,runMeaning}=analysis;
    const activityReport:IqActivityReport=immutable({...source,analysisVersion,options,limits,processedCells,windowRelationship,units,comparison,timeBasis,runMeaning,warnings:[...importWarnings,...prepared.warnings,...analysis.warnings]});
    this.#publish({analysisEngine:'JavaScript selected-window energy analysis. Native FFT is not used in this mode.',activityReport,activityFrames:Object.freeze(this.#activityFrames.slice(0,4)),activityFramePageCount:Math.ceil(this.#activityFrames.length/4),activityRuns:Object.freeze(this.#activityRunSummaries.slice(0,4)),activityRunPageCount:Math.ceil(this.#activityRuns.length/4),...(this.#activityRuns.length?this.#selectActivityRun(0):{}),pending:false,message:'Selected-window energy / threshold inspection complete. Offline acquisition not verified.'});
    return;
   }
   if (tfMode) {
    const executed = await this.#engine.timeFrequency(prepared,tfOptions!);
    const analysis = executed.analysis; // JS verification retained; native used only on exact match.
    if (!valid()) return;
    this.#timeFrequency = immutable({axis:analysis.axis,frames:analysis.frames});
    this.#frameSummaries = Object.freeze(analysis.frames.map(({amplitude:_a,dbRelativeToUnitAmplitude:_d,displayDb:_f,...summary})=>immutable(summary)));
    const {fftSize:n,hopSamples:hop} = analysis.options;
    const timeFrequencyReport: IqTimeFrequencyReport = immutable({...source,geometry:analysis.options,cellCount:analysis.cellCount,windowDurationSeconds:analysis.windowDurationSeconds,binSpacingHz:analysis.binSpacingHz,normalization:analysis.normalization,displayFloorDb:analysis.displayFloorDb,spacing:hop<n?'overlap':hop===n?'contiguous':'gaps',gapSamples:Math.max(0,hop-n),warnings:[...importWarnings,...prepared.warnings,...analysis.warnings]});
    this.#publish({analysisEngine:executed.engine.summary,timeFrequencyReport,frames:Object.freeze(this.#frameSummaries.slice(0,4)),framePage:0,framePageCount:Math.ceil(this.#frameSummaries.length/4),...this.#selectFrame(0),pending:false,message:'Time-frequency inspection complete. Full-file statistics omitted; offline acquisition not verified.'});
    return;
   }
   if (!options) throw new Error('Invalid selected window');
   const executed = await this.#engine.single(prepared,options);
   const analysis = immutable(executed.analysis); // Full-file statistics and provenance stay in the unchanged core.
   if (!valid()) return;
   this.#bins = analysis.spectrum?.bins ?? emptyBins;
   const spectrum = analysis.spectrum ? (({bins: _bins,...summary}) => Object.freeze(summary))(analysis.spectrum) : null;
   const report: IqReport = Object.freeze({...source,statistics:analysis.statistics,spectrum,warnings:Object.freeze([...importWarnings,...prepared.warnings,...analysis.warnings])});
   this.#publish({analysisEngine:executed.engine.summary,report,bins:Object.freeze(this.#bins.slice(0,8)),page:0,pageCount:Math.ceil(this.#bins.length/8),pending:false,message:'Inspection complete. Offline import; acquisition not verified.'});
  } catch { if (valid()) this.#publish({pending:false,message:'Inspection refused: unreadable bytes, unsupported strict profile, invalid digest or SHA-512 mismatch. No report.'}); }
  finally { this.#running = false; this.#publish({pending:false}); }
 }
}
