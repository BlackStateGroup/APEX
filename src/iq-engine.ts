import { analyzeIq, analyzeIqTimeFrequency, fftComplexForward } from '../packages/core/iq-analysis.ts';
import type { IqAnalysisOptions, IqTimeFrequencyOptions } from '../packages/core/iq-analysis.ts';
import type { PreparedIq } from '../packages/core/iq-offline.ts';
import { encode, project } from '../experimental/hybrid-iq/bridge/codec.ts';
import type { Fixture, Projection } from '../experimental/hybrid-iq/bridge/codec.ts';
import { OptionalIqExecutor, Cancelled } from '../experimental/hybrid-iq/bridge/client.ts';
import type { NativeBridge } from '../experimental/hybrid-iq/bridge/client.ts';
export interface IqEngineStatus { readonly backend: 'javascript' | 'native-cpp'; readonly summary: string; }
export interface NativeIqSession { readonly bridge: NativeBridge; close(): void; }
export interface IqEngineResult<T> { analysis: T; engine: IqEngineStatus; }
export const IQ_ENGINE_IDLE = 'Engine selected during Inspect. Native C++ is used only when available and exactly verified; otherwise JavaScript.';
const js = (summary: string): IqEngineStatus => Object.freeze({backend:'javascript',summary});
const nativeStatus: IqEngineStatus = Object.freeze({backend:'native-cpp',summary:'Native C++ FFT active. Every result is exactly checked against JavaScript; verification mode, not a speedup claim. Rust mobile linkage is not active.'});
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const get = (key:PropertyKey) => Object.getOwnPropertyDescriptor(typedPrototype,key)!.get!;
const tag=get(Symbol.toStringTag), length=get('length'), buffer=get('buffer'), offset=get('byteOffset');
const arrayLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!;
const resizable=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get;
function rawBytes(response:Uint8Array,expected:number):DataView {
 if(tag.call(response)!=='Uint8Array'||length.call(response)!==expected)throw Error('Qualification response size');
 const backing=buffer.call(response);arrayLength.call(backing);if(resizable?.call(backing))throw Error('Resizable qualification response');
 const copy=new Uint8Array(new Uint8Array(backing,offset.call(response),expected));return new DataView(copy.buffer);
}
function rawOracle(f:Fixture):number[] {
 const data=new DataView(f.data.buffer,f.data.byteOffset,f.data.byteLength), values:number[]=[];
 for(let frame=0;frame<f.frameCount;frame++){
  const real=new Float64Array(f.fftSize),imaginary=new Float64Array(f.fftSize);
  for(let k=0;k<f.fftSize;k++){const w=0.5-0.5*Math.cos(2*Math.PI*k/f.fftSize),at=(f.startSample+frame*f.hopSamples+k)*4;real[k]=data.getInt16(at,true)/32768*w;imaginary[k]=data.getInt16(at+2,true)/32768*w;}
  const result=fftComplexForward(real,imaginary);values.push(...result.real,...result.imaginary);
 }
 return values;
}
function oracleProjection(f:Fixture,raw:number[]):Projection {
 const encoded=encode(f,{session:1,request:1}),bytes=new Uint8Array(32+raw.length*8),view=new DataView(bytes.buffer);
 bytes.set([65,88,79,66,1,0,0,0]);for(const [at,value] of [[8,1],[12,1],[16,f.fftSize],[20,f.frameCount],[24,raw.length*8]] as const)view.setUint32(at,value,true);
 raw.forEach((value,index)=>view.setFloat64(32+index*8,value,true));return project(bytes,encoded.context);
}
/** Exact values, including signed zero. Only bounded internally built plain data enters this comparison. */
function exact(a:unknown,b:unknown):boolean {
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const left=Object.keys(a),right=Object.keys(b);if(left.length!==right.length)return false;
 return left.every(key=>Object.hasOwn(b,key)&&exact((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}
function* qualificationFixtures():Generator<Fixture>{
 let random=0x1ae78501;
 for(const fftSize of [256,512,1024,2048,4096])for(const kind of ['zero','impulse','random']){
  const data=new Uint8Array(fftSize*4),view=new DataView(data.buffer);
  if(kind==='impulse'){const at=Math.floor(fftSize/3)*4;view.setInt16(at,16384,true);view.setInt16(at+2,-8192,true);}
  if(kind==='random')for(let at=0;at<data.length;at+=2){random=(Math.imul(random,1664525)+1013904223)>>>0;view.setInt16(at,(random>>>16)-32768,true);}
  yield {data,sampleRate:12345678.125,centerFrequency:-123456789.75,fftSize,startSample:0,hopSamples:fftSize,frameCount:1};
 }
 // Exercise maximum frame count and cell budget, not only one-frame dispatch.
 for(const [fftSize,frameCount,hopSamples,startSample] of [[256,64,1,11],[4096,4,4096,37]] as const){
  const data=new Uint8Array((startSample+(frameCount-1)*hopSamples+fftSize)*4),view=new DataView(data.buffer);
  for(let at=0;at<data.length;at+=2){random=(Math.imul(random,1664525)+1013904223)>>>0;view.setInt16(at,(random>>>16)-32768,true);}
  yield {data,sampleRate:8192,centerFrequency:1e6,fftSize,startSample,hopSamples,frameCount};
 }
}
function tfProjection(report:ReturnType<typeof analyzeIqTimeFrequency>):Projection {
 return {fftSize:report.options.fftSize,frameCount:report.options.frameCount,cellCount:report.cellCount,windowDurationSeconds:report.windowDurationSeconds,binSpacingHz:report.binSpacingHz,axis:report.axis,frames:report.frames};
}
function singleProjection(report:ReturnType<typeof analyzeIq>,fs:number):Projection {
 const s=report.spectrum;if(!s)throw Error('No FFT');const n=s.fftSize,start=s.startSample;
 return {fftSize:n,frameCount:1,cellCount:n,windowDurationSeconds:s.windowDurationSeconds,binSpacingHz:s.binSpacingHz,
  axis:s.bins.map(({signedBin,rawIndex,offsetHz,declaredRfHz})=>({signedBin,rawIndex,offsetHz,declaredRfHz})),
  frames:[{index:0,startSample:start,endSampleExclusive:start+n,nominalStartSeconds:start/fs,nominalCenterSeconds:(start+n/2)/fs,nominalEndExclusiveSeconds:(start+n)/fs,
   amplitude:s.bins.map(b=>b.amplitude),dbRelativeToUnitAmplitude:s.bins.map(b=>b.dbRelativeToUnitAmplitude),displayDb:s.bins.map(b=>b.displayDb),peakSignedBin:s.peakBin?.signedBin??null}]};
}
/** Initial activation deliberately retains per-request JS verification. The unchanged
 * core owns validation, statistics, provenance and report semantics. Native supplies
 * FFT numbers only after runtime raw qualification and exact request comparison. */
export class IqAnalysisEngine {
 readonly #open:()=>NativeIqSession|null; readonly #unavailable:string;
 #session:NativeIqSession|null=null;#executor:OptionalIqExecutor|null=null;#initialized=false;#qualified=false;#quarantined=false;
 #current:Projection|null=null;#raw:number[]|null=null;#busy=false;#generation=0;#releasePending=false;
 constructor(open:()=>NativeIqSession|null=()=>null,unavailable='JavaScript analysis. Native module is not configured.') {this.#open=open;this.#unavailable=unavailable;}
 cancel(){++this.#generation;this.#executor?.cancel();}
 release(){this.cancel();this.#releasePending=true;if(!this.#busy)this.#close();}
 #close(){this.#executor?.dispose();try{this.#session?.close();}catch{/* No new native call is admitted here. */}this.#session=null;this.#executor=null;this.#initialized=false;this.#qualified=false;this.#releasePending=false;}
 #initialize(){
  if(this.#initialized||this.#quarantined)return;this.#initialized=true;
  try{
   const session=this.#open();if(!session)return;this.#session=session;
   const bridge:NativeBridge={session:session.bridge.session,cancel:(s,r)=>session.bridge.cancel(s,r),execute:async bytes=>{
    const response=await session.bridge.execute(bytes);
    if(this.#raw){const view=rawBytes(response,32+this.#raw.length*8);for(let k=0;k<this.#raw.length;k++)if(!Object.is(view.getFloat64(32+k*8,true),this.#raw[k]))throw Error('Native raw qualification mismatch');}
    return response;
   }};
   this.#executor=new OptionalIqExecutor(()=>{if(!this.#current)throw Error('Missing JS reference');return this.#current;},bridge);
  }catch{this.#close();this.#initialized=true;}
 }
 async #transform(fixture:Fixture,expected:Projection,live:()=>void):Promise<{value:Projection;engine:IqEngineStatus}>{
  this.#initialize();live();
  if(this.#quarantined)return {value:expected,engine:js('JavaScript fallback. Native verification failed; this engine is quarantined until reload.')};
  if(!this.#executor)return {value:expected,engine:js(this.#unavailable)};
  if(!this.#qualified){
   for(const probe of qualificationFixtures()){
    live();this.#raw=rawOracle(probe);this.#current=oracleProjection(probe,this.#raw);
    let result;try{result=await this.#executor.run(probe);}finally{this.#raw=null;}
    live();
    if(result.backend!=='native'||!exact(result.value,this.#current)){this.#quarantined=true;this.#close();return {value:expected,engine:js('JavaScript fallback. Native runtime self-test failed; no native result used.')};}
   }
   this.#qualified=true;
  }
  live();this.#current=expected;const result=await this.#executor.run(fixture);live();
  if(result.backend!=='native'||!exact(result.value,expected)){this.#quarantined=true;this.#close();return {value:expected,engine:js('JavaScript fallback. Native request failed exact verification; no native result used.')};}
  return {value:result.value,engine:nativeStatus};
 }
 async #run<T>(work:(live:()=>void)=>Promise<IqEngineResult<T>>):Promise<IqEngineResult<T>>{
  if(this.#busy)throw Error('IQ engine busy');this.#busy=true;const generation=this.#generation;
  const live=()=>{if(generation!==this.#generation)throw new Cancelled();};
  try{return await work(live);}catch(error){live();throw error;}finally{this.#busy=false;this.#current=null;this.#raw=null;if(this.#releasePending)this.#close();}
 }
 single(recording:PreparedIq,options:IqAnalysisOptions={}):Promise<IqEngineResult<ReturnType<typeof analyzeIq>>>{
  return this.#run<ReturnType<typeof analyzeIq>>(async live=>{
   const baseline=analyzeIq(recording,options);live();
   if(!baseline.spectrum)return {analysis:baseline,engine:js('JavaScript full-file statistics only. Insufficient samples for default FFT; native FFT not invoked.')};
   const s=baseline.spectrum,fixture={data:recording.getDataBytes(),sampleRate:recording.sampleRate,centerFrequency:recording.centerFrequency,fftSize:s.fftSize,startSample:s.startSample,hopSamples:s.fftSize,frameCount:1};
   const result=await this.#transform(fixture,singleProjection(baseline,recording.sampleRate),live);live();
   if(result.engine.backend==='javascript')return {analysis:baseline,engine:result.engine};
   const frame=result.value.frames[0]!,bins=result.value.axis.map((axis,k)=>({...axis,amplitude:frame.amplitude[k]!,dbRelativeToUnitAmplitude:frame.dbRelativeToUnitAmplitude[k]!,displayDb:frame.displayDb[k]!}));
   return {analysis:{...baseline,spectrum:{...s,bins,peakBin:frame.peakSignedBin===null?null:bins[frame.peakSignedBin+s.fftSize/2]!}},engine:result.engine};
  });
 }
 timeFrequency(recording:PreparedIq,options:IqTimeFrequencyOptions):Promise<IqEngineResult<ReturnType<typeof analyzeIqTimeFrequency>>>{
  return this.#run<ReturnType<typeof analyzeIqTimeFrequency>>(async live=>{
   const baseline=analyzeIqTimeFrequency(recording,options);live();
   const fixture={data:recording.getDataBytes(),sampleRate:recording.sampleRate,centerFrequency:recording.centerFrequency,...baseline.options};
   const result=await this.#transform(fixture,tfProjection(baseline),live);live();
   return {analysis:result.engine.backend==='native-cpp'?{...baseline,axis:result.value.axis,frames:result.value.frames}:baseline,engine:result.engine};
  });
 }
}
