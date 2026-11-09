import assert from 'node:assert/strict';
import { openFramedHost } from './jni-host-client.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode, project } from '../../../experimental/hybrid-iq/bridge/codec.ts';
import { fixtures, packPairs } from '../../../experimental/cpp-iq/proof-codec.mjs';
import { extraFixtures } from '../../../experimental/cpp-iq/extra-fixtures.mjs';
import { prepareReference, runReference } from '../../../experimental/hybrid-iq/reference.mjs';
import { fftComplexForward, analyzeIq, analyzeIqTimeFrequency } from '../../../packages/core/iq-analysis.ts';
import { IqAnalysisEngine } from '../../../src/iq-engine.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const build = process.argv[2];
assert.ok(build && process.argv.length === 3, 'Provide the host-check temporary build directory');
const library = readFileSync(resolve(build, 'libapex_iq.so'));
for (const [path, expected] of [
  ['packages/core/iq-analysis.ts', 'c1d65937e402e53f93e40838fa89fc4063b391b7'],
  ['packages/core/iq-offline.ts', 'df6a1bea6fe1dd527e91be2979538ee054a4387f'],
  ['packages/core/bounded-json.ts', 'aed4bc98243b3bcda2ed205bf210940b95e7c49b'],
  ['experimental/cpp-iq/proof-codec.mjs', 'd4446c5beee30d84139780806e0be67f02276d36'],
  ['experimental/cpp-iq/extra-fixtures.mjs', '3439245113f986011a9c810005665cae9804959f'],
]) {
  const bytes = readFileSync(resolve(root, path));
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), expected, `Oracle drift: ${path}`);
}

function openHost() {
  return openFramedHost('java', ['-Xcheck:jni', `-Djava.library.path=${build}`, '-cp', resolve(build, 'classes'), 'expo.modules.apexiq.ApexIqWireHost']);
}
function numeric(r){return {fftSize:r.options.fftSize,frameCount:r.options.frameCount,cellCount:r.cellCount,windowDurationSeconds:r.windowDurationSeconds,binSpacingHz:r.binSpacingHz,axis:r.axis,frames:r.frames};}
function* impulses(){for(const n of [256,512,1024,2048,4096])for(let pos=0;pos<n;){const count=Math.min(n-pos,16384/n),data=Buffer.alloc(n*count*4);for(let k=0;k<count;k++){data.writeInt16LE(16384,(k*n+pos+k)*4);data.writeInt16LE(-8192,(k*n+pos+k)*4+2);}yield {name:`impulse-${n}-${pos}`,data,fftSize:n,startSample:0,hopSamples:n,frameCount:count,sampleRate:8192,centerFrequency:1e6};pos+=count;}}
function* randomCases(){let state=0x1ae78501;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;for(const n of [256,512,1024,2048,4096])for(let k=0;k<12;k++){const count=1+next()%Math.min(64,16384/n),start=next()%64,hop=1+next()%Math.floor((65536-start-n)/Math.max(1,count-1)+1),length=start+(count-1)*hop+n;yield {name:`random-${n}-${k}`,data:packPairs(Array.from({length},()=>[(next()>>>16)-32768,(next()>>>16)-32768])),fftSize:n,startSample:start,hopSamples:hop,frameCount:count,sampleRate:[1,1e9,12345678.125][k%3],centerFrequency:[-1e12,1e12,-123456789.75][k%3]};}}
let requests=0,windows=0,bins=0;const corpus=createHash('sha256');
const host=await openHost();
try {
  for(const f of [...fixtures(),...extraFixtures(),...impulses(),...randomCases()]){
    const request=encode(f,{session:host.session,request:++requests}),response=await host.execute(request.bytes);
    assert.deepEqual(project(response,request.context),numeric(runReference(await prepareReference(f),f)),f.name);
    const view=new DataView(response.buffer,response.byteOffset,response.byteLength);let at=32;
    for(let frame=0;frame<f.frameCount;frame++){
      const real=new Float64Array(f.fftSize),imaginary=new Float64Array(f.fftSize),data=new DataView(f.data.buffer,f.data.byteOffset,f.data.length);
      for(let k=0;k<f.fftSize;k++){const w=0.5-0.5*Math.cos(2*Math.PI*k/f.fftSize),offset=(f.startSample+frame*f.hopSamples+k)*4;real[k]=data.getInt16(offset,true)/32768*w;imaginary[k]=data.getInt16(offset+2,true)/32768*w;}
      const expected=fftComplexForward(real,imaginary);
      for(const values of [expected.real,expected.imaginary])for(const value of values){assert.ok(Object.is(view.getFloat64(at,true),value),`${f.name} raw ${at}`);at+=8;}
    }
    windows+=f.frameCount;bins+=f.frameCount*f.fftSize;corpus.update(f.name);corpus.update(f.data);
  }
  assert.equal(requests,1485);assert.equal(windows,8924);assert.equal(bins,23029248);
  await host.finish();
} finally { await host.abort(); }

// Actual application verification logic consumes the real coordinator/JNI path,
// rather than a canned response or the portable C++ subprocess used by unit tests.
const appHost=await openHost();let appCalls=0;let appReports=0;
const engine=new IqAnalysisEngine(()=>({bridge:{session:appHost.session,execute:bytes=>{appCalls++;return appHost.execute(bytes);},cancel(){throw Error('Cancellation transport is outside this test-only adapter');}},close(){}}));
try {
  for(const fftSize of [256,512,1024,2048,4096]){
    const f=fixtures().find(value=>value.fftSize===fftSize);assert.ok(f);
    const recording=await prepareReference(f),options={fftSize,startSample:f.startSample};
    const actual=await engine.single(recording,options);assert.equal(actual.engine.backend,'native-cpp');assert.deepEqual(actual.analysis,analyzeIq(recording,options));appReports++;
  }
  for(const f of [...fixtures(),...extraFixtures()].filter(f=>f.frameCount===64||f.fftSize===4096&&f.frameCount===4)){
    const recording=await prepareReference(f),options={fftSize:f.fftSize,startSample:f.startSample,hopSamples:f.hopSamples,frameCount:f.frameCount};
    const actual=await engine.timeFrequency(recording,options);assert.equal(actual.engine.backend,'native-cpp');assert.deepEqual(actual.analysis,analyzeIqTimeFrequency(recording,options));appReports++;
  }
  assert.ok(appReports>=7);assert.equal(appCalls,17+appReports);engine.release();await appHost.finish();
} finally { engine.release();await appHost.abort(); }
console.log(JSON.stringify({status:'PASS',route:'Node JS codec → production Java coordinator → actual JNI → C++ → unchanged JS oracle',requests,windows,bins,exactRawComponents:bins*2,appQualificationRequests:17,appReports,appCalls,corpusSha256:corpus.digest('hex'),librarySha256:createHash('sha256').update(library).digest('hex'),node:process.version,hostPlatform:process.platform,hostArch:process.arch,android:false,hermes:false,expoMarshalling:false,mobileRust:false,performanceClaim:false}));
