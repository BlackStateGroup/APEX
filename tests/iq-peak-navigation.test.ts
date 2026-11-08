/** Synthetic host checks only, not browser/native acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {analyzeIq,analyzeIqTimeFrequency} from '../packages/core/iq-analysis.ts';
let singleCalls=0,multiCalls=0;
(globalThis as any).__peakKernels={single:(...args:Parameters<typeof analyzeIq>)=>{singleCalls++;return analyzeIq(...args);},multi:(...args:Parameters<typeof analyzeIqTimeFrequency>)=>{multiCalls++;return analyzeIqTimeFrequency(...args);}};
const controllerUrl=new URL('../src/iq-workbench.ts',import.meta.url).href;
const hooks=registerHooks({resolve(s,c,next){if(c.parentURL===controllerUrl&&s==='../packages/core/iq-analysis.ts')return{url:'data:text/javascript,'+encodeURIComponent('export const analyzeIq=globalThis.__peakKernels.single,analyzeIqTimeFrequency=globalThis.__peakKernels.multi;'),shortCircuit:true};return next(s,c);}});
const {IqController,IQ_FFT_SIZES}=await import('../src/iq-workbench.ts');
hooks.deregister();test.after(()=>delete(globalThis as any).__peakKernels);
import type {IqFftSize,IqWindowMode} from '../src/iq-workbench.ts';
const metadata=Buffer.from('{"global":{"core:datatype":"ci16_le","core:version":"1.2.6","core:sample_rate":8192},"captures":[{"core:sample_start":0,"core:frequency":0}],"annotations":[]}');
async function setup(n:IqFftSize,mode:IqWindowMode,bins:(number|null)[]) {
 const counts={reads:0,hashes:0};
 const c=new IqController(true,{digest:async(a,b)=>{counts.hashes++;return createHash(a==='SHA-256'?'sha256':'sha512').update(b).digest('hex');}});
 const bytes=new Uint8Array(n*bins.length*4),view=new DataView(bytes.buffer);
 bins.forEach((bin,f)=>{if(bin===null)return;for(let k=0;k<n;k++){view.setInt16((f*n+k)*4,Math.round(12000*Math.cos(2*Math.PI*bin*k/n)),true);view.setInt16((f*n+k)*4+2,Math.round(12000*Math.sin(2*Math.PI*bin*k/n)),true);}});
 for(const side of ['metadata','data'] as const){const b=side==='metadata'?metadata:bytes;c.stageFile(side,{name:side,size:b.length,arrayBuffer:async()=>{counts.reads++;return Uint8Array.from(b).buffer;}},c.lease,c.state);}
 c.windowMode(mode,c.lease,c.state);c.fftSize(n,c.lease,c.state);c.hopSamples(String(n),c.lease,c.state);c.frameCount(String(bins.length),c.lease,c.state);
 await c.inspect(c.lease,c.state);return{c,counts};
}
test('peak page uses actual shifted FFT size for first, last and zero bins in both modes; retained snapshots and sources unchanged',async()=>{
 for(const n of IQ_FFT_SIZES)for(const mode of ['explicit','time-frequency'] as const)for(const bin of [-n/2,n/2-1,0]){
  const {c,counts}=await setup(n,mode,[bin]);const old=c.state,oldJson=JSON.stringify(old),kernelCounts=[singleCalls,multiCalls];
  assert.equal(mode==='explicit'?old.report!.spectrum!.peakBin!.signedBin:old.selectedFrame!.peakSignedBin,bin);
  c.showPeakPage(c.lease,old);const now=c.state;
  assert.equal(now.page,Math.floor((bin+n/2)/8));assert.ok(now.bins.some(b=>b.signedBin===bin));
  for(const key of Object.keys(old) as (keyof typeof old)[])if(key!=='page'&&key!=='bins')assert.equal(now[key],old[key],key);
  assert.equal(JSON.stringify(old),oldJson);assert.ok(Object.isFrozen(now.bins));for(const row of now.bins)assert.ok(Object.isFrozen(row));
  assert.deepEqual(counts,{reads:2,hashes:2});c.showPeakPage(c.lease,c.state);assert.deepEqual(counts,{reads:2,hashes:2});assert.deepEqual([singleCalls,multiCalls],kernelCounts);
 }
});
test('null peak and absent spectrum are exact no-ops, including default short input',async()=>{
 for(const mode of ['default','explicit','time-frequency'] as const){const {c,counts}=await setup(256,mode,[null]);const old=c.state;c.showPeakPage(c.lease,old);assert.equal(c.state,old);assert.deepEqual(counts,{reads:2,hashes:2});}
 const c=new IqController(true,{digest:async()=>assert.fail('no hashing')});const old=c.state;c.showPeakPage(c.lease,old);assert.equal(c.state,old);
});
test('current selected frame controls peak; overview retained and stale callbacks cannot navigate after changes',async()=>{
 const {c,counts}=await setup(256,'time-frequency',[64,-64,0,null,127]);c.framePage(1,c.lease,c.state);const overview=c.state.frames;
 for(const frame of [0,1,2,4]){const stale=c.state,lease=c.lease;c.selectFrame(frame,c.lease,c.state);const selected=c.state;c.showPeakPage(lease,stale);assert.equal(c.state,selected);c.showPeakPage(c.lease,c.state);assert.equal(c.state.frames,overview);assert.equal(c.state.framePage,1);assert.equal(c.state.selectedFrame!.index,frame);assert.ok(c.state.bins.some(b=>b.signedBin===c.state.selectedFrame!.peakSignedBin));}
 c.selectFrame(3,c.lease,c.state);const zero=c.state;c.showPeakPage(c.lease,zero);assert.equal(c.state,zero);assert.deepEqual(counts,{reads:2,hashes:2});
 for(const change of ['edit','clear','mode','exit','replace','page']){const {c,counts}=await setup(256,'explicit',[64]);const old=c.state,lease=c.lease;
  if(change==='edit')c.startSample('1',lease,old);if(change==='clear')c.clear(lease,old);if(change==='mode')c.windowMode('time-frequency',lease,old);if(change==='exit'){c.deactivate();c.activate();}if(change==='replace')c.example(lease,old);if(change==='page')c.page(1,lease,old);
  const current=c.state;c.showPeakPage(lease,old);assert.equal(c.state,current);assert.deepEqual(counts,{reads:2,hashes:2});
 }
});
