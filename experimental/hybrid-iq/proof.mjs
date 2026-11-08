#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { arch, cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { encodeRequest, decodeComplex, projectResponse, sizes, maxRequest, maxResponse } from './contract.mjs';
import { fixtures, packPairs } from '../cpp-iq/proof-codec.mjs';
import { extraFixtures } from '../cpp-iq/extra-fixtures.mjs';
import { prepareReference, runReference, directWindowDft } from './reference.mjs';
import { fftComplexForward } from '../../packages/core/iq-analysis.ts';
const cwd = fileURLToPath(new URL('.', import.meta.url));
const mode = process.argv[2] ?? 'verify';
const backend = process.argv[3] ?? 'cpp';
if (!['verify', 'sanitize', 'benchmark'].includes(mode) || !['cpp','rust'].includes(backend) || process.argv.length > 4 || (backend === 'rust' && mode !== 'verify')) throw new Error('Use verify|sanitize|benchmark [cpp], or verify rust');
const runName = backend === 'cpp' ? mode : 'rust-verify';
const build = join(cwd, '.build'), out = join(cwd, 'proof-results'); mkdirSync(build, {recursive:true}); mkdirSync(out, {recursive:true});
const host = backend === 'cpp' ? join(build, `host-${mode}`) : join(cwd,'rust/target/release/apex-hybrid-iq-host-proof');
const flags = ['-std=c++17', mode === 'sanitize' ? '-O1' : '-O3', '-fno-fast-math', '-ffp-contract=off', '-Wall', '-Wextra', '-Wpedantic', '-Wconversion', '-Werror'];
if (mode === 'sanitize') flags.push('-g', '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie');
const report = { schemaVersion:1, mode, backend, status:'RUNNING', startedAt:new Date().toISOString(), referenceCommit:'d4434c5cf789938447e83e49a5cfcbdf68b59277',
  syntheticOnly:true, appIntegrated:false, rustCompiled:false, mobileAcceptance:'NOT RUN',
  environment:{platform:platform(), arch:arch(), release:release(), node:process.version, cpu:cpus()[0]?.model},
  contract:'JS-runtime-owned Hann/twiddle plans; strict C++ binary64 FFT; JS hypot/log/peak. Exact numerical projection, including signed zeros; no tolerances in differential gate.',
  sourceSha256:{}, stages:[] };
const hash = x => createHash('sha256').update(x).digest('hex');
const referenceBlobs = {
  '../../packages/core/iq-analysis.ts': 'c1d65937e402e53f93e40838fa89fc4063b391b7',
  '../../packages/core/iq-offline.ts': 'df6a1bea6fe1dd527e91be2979538ee054a4387f',
  '../../packages/core/bounded-json.ts': 'aed4bc98243b3bcda2ed205bf210940b95e7c49b',
  '../cpp-iq/proof-codec.mjs': 'd4446c5beee30d84139780806e0be67f02276d36',
  '../cpp-iq/extra-fixtures.mjs': '3439245113f986011a9c810005665cae9804959f',
};
function checkReferenceBlobs() {
  for (const [file, expected] of Object.entries(referenceBlobs)) {
    const bytes = readFileSync(join(cwd, file));
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(actual, expected, `Pinned reference drift: ${file}`);
  }
  report.stages.push({name:'pinned-current-source-blobs',status:'PASS',blobs:referenceBlobs});
}
for (const file of ['contract.mjs','proof.mjs','reference.mjs','src/kernel.h','src/kernel.cpp','src/host.cpp','src/abi_test.cpp','../../packages/core/iq-analysis.ts','../../packages/core/iq-offline.ts','../../packages/core/bounded-json.ts','../cpp-iq/proof-codec.mjs','../cpp-iq/extra-fixtures.mjs','rust/Cargo.toml','rust/Cargo.lock','rust/build.rs','rust/src/lib.rs','rust/src/main.rs']) report.sourceSha256[file]=hash(readFileSync(join(cwd,file)));
function command(program,args,options={}) { return spawnSync(program,args,{cwd,timeout:120000,maxBuffer:maxResponse+65536,
  env:{...process.env,ASAN_OPTIONS:'detect_leaks=0:abort_on_error=1',UBSAN_OPTIONS:'halt_on_error=1:print_stacktrace=1'},...options}); }
function required(name,program,args) { const r=command(program,args);writeFileSync(join(out,`${runName}-${name}.txt`),(`${r.stdout??''}${r.stderr??''}`).replace(/\n+$/, '\n'));assert.equal(r.error,undefined);assert.equal(r.status,0,`${name}: ${r.stderr}`);report.stages.push({name,status:'PASS',command:[program,...args]});return r; }
function native(input) { const r=command(host,[],{input});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr?.toString());assert.equal(r.stderr.length,0);return r.stdout; }
function numericView(r) { return {fftSize:r.options.fftSize,frameCount:r.options.frameCount,cellCount:r.cellCount,windowDurationSeconds:r.windowDurationSeconds,binSpacingHz:r.binSpacingHz,axis:r.axis,frames:r.frames}; }
function rawOracle(f,index) {
  const n=f.fftSize,start=f.startSample+index*f.hopSamples,real=new Float64Array(n),imaginary=new Float64Array(n);
  for(let k=0;k<n;k++){const w=0.5-0.5*Math.cos(2*Math.PI*k/n);real[k]=f.data.readInt16LE((start+k)*4)/32768*w;imaginary[k]=f.data.readInt16LE((start+k)*4+2)/32768*w;}
  return fftComplexForward(real,imaginary);
}
function exactBytes(a,b,label) { assert.ok(Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength)),label); }
async function differential(cases,name) {
  let fixtureCount=0,windows=0,bins=0;const digest=createHash('sha256');
  for(const f of cases) {
    const before=hash(f.data),prepared=await prepareReference(f),expected=runReference(prepared,f);
    const {input,context}=encodeRequest(f),response=native(input),actual=projectResponse(response,context),raw=decodeComplex(response,context);
    assert.deepEqual(actual,numericView(expected),f.name);
    for(let i=0;i<f.frameCount;i++){const r=rawOracle(f,i);exactBytes(raw.frames[i].real,r.real,`${f.name} real ${i}`);exactBytes(raw.frames[i].imaginary,r.imaginary,`${f.name} imaginary ${i}`);}
    assert.equal(hash(f.data),before,'input immutability');digest.update(f.name);digest.update(f.data);fixtureCount++;windows+=f.frameCount;bins+=f.frameCount*f.fftSize;
  }
  report.stages.push({name,status:'PASS',cases:fixtureCount,windows,bins,rawComplexComponentsExactlyEqual:bins*2,projection:'deepStrictEqual',corpusSha256:digest.digest('hex')});
}
function* impulses() {
  // Every sample position at every supported size, grouped into disjoint frames.
  // The group never exceeds the ordinary 16,384-cell/65,536-sample limits.
  for(const n of sizes)for(let position=0;position<n;){
    const count=Math.min(n-position,16384/n),data=Buffer.alloc(n*count*4);
    for(let i=0;i<count;i++){const at=(i*n+position+i)*4;data.writeInt16LE(16384,at);data.writeInt16LE(-8192,at+2);}
    yield {name:`every-impulse-${n}-${position}`,data,fftSize:n,startSample:0,hopSamples:n,frameCount:count,sampleRate:8192,centerFrequency:1e6};position+=count;
  }
}
function* randomCases() {
  let state=0x1ae78501;
  const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  for(const n of sizes)for(let test=0;test<12;test++){
    const count=1+next()%Math.min(64,16384/n),start=next()%64,hop=1+next()%Math.floor((65536-start-n)/Math.max(1,count-1)+1);
    const length=start+(count-1)*hop+n;
    const pairs=Array.from({length},()=>[(next()>>>16)-32768,(next()>>>16)-32768]);
    yield {name:`seeded-${n}-${test}`,data:packPairs(pairs),fftSize:n,startSample:start,hopSamples:hop,frameCount:count,
      sampleRate:[1,1e9,12345678.125][test%3],centerFrequency:[-1e12,1e12,-123456789.75][test%3]};
  }
}
function rejectionTests() {
  const f=fixtures()[0],{input:valid,context}=encodeRequest(f),bad=[];
  bad.push(Buffer.alloc(0),valid.subarray(0,31),valid.subarray(0,valid.length-1),Buffer.concat([valid,Buffer.from([0])]),Buffer.alloc(maxRequest+1));
  for(const at of [0,4,5,6,7]){const b=Buffer.from(valid);b[at]^=2;bad.push(b);}
  for(const [at,values] of [[8,[0,1,262148,0xffffffff]],[12,[0,128,257,8192,0xffffffff]],[16,[1,0xffffffff]],[20,[0,65537,0xffffffff]],[24,[0,65,0xffffffff]],[28,[0,1001,0xffffffff]]])for(const value of values){const b=Buffer.from(valid);b.writeUInt32LE(value,at);bad.push(b);}
  const planAt=32+f.data.length;
  for(const at of [planAt,planAt+(f.fftSize-1)*8,planAt+f.fftSize*8,valid.length-8])for(const value of [NaN,Infinity,-Infinity,1.01,-1.01]){const b=Buffer.from(valid);b.writeDoubleLE(value,at);bad.push(b);}
  for(const b of bad){const r=command(host,[],{input:b});assert.equal(r.error,undefined);assert.equal(r.status,2,r.stderr?.toString());assert.equal(r.stdout.length,0);assert.equal(r.stderr.toString(),'apex-hybrid-iq: rejected input\n');}
  const arg=command(host,['unexpected']);assert.equal(arg.status,2);assert.equal(arg.stdout.length,0);
  const good=native(valid),responses=[Buffer.alloc(0),good.subarray(0,23),good.subarray(0,good.length-1),Buffer.concat([good,Buffer.from([0])])];
  for(const at of [0,4,5,6,7,8,12]){const b=Buffer.from(good);b[at]^=2;responses.push(b);}
  for(const at of [24,good.length-8])for(const value of [NaN,Infinity,-Infinity,1e20]){const b=Buffer.from(good);b.writeDoubleLE(value,at);responses.push(b);}
  for(const b of responses)assert.throws(()=>projectResponse(b,context));
  assert.throws(()=>projectResponse(good,{}));
  const other=encodeRequest(fixtures().find(f=>f.fftSize===512));assert.throws(()=>projectResponse(good,other.context));
  const snapshot=Buffer.from(valid);f.data.fill(7);assert.ok(valid.equals(snapshot),'request owns original bytes');
  report.stages.push({name:'bounded-rejection-and-ownership',status:'PASS',nativeRejected:bad.length+1,responseRejected:responses.length+2});
}
async function dft() {
  let cases=0,bins=0,maxError=0;
  for(const f of [...fixtures(),...extraFixtures()].filter(f=>f.fftSize===256&&f.frameCount===1)){
    const {input,context}=encodeRequest(f),actual=projectResponse(native(input),context).frames[0].amplitude,expected=directWindowDft(f);
    expected.forEach((x,i)=>{const error=Math.abs(x-actual[i]);assert.ok(error<=1e-9*(1+Math.abs(x)),f.name);maxError=Math.max(maxError,error);bins++;});cases++;
  }
  report.stages.push({name:'independent-quadratic-dft',status:'PASS',cases,bins,maxAbsoluteAmplitudeError:maxError,tolerance:'1e-9*(1+abs(DFT)) only for independent approximation, never for equivalence'});
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
async function benchmark() {
  const results=[];
  for(const f of fixtures().filter(f=>['integer-mix-4096','selection-256-64-1-0','selection-4096-4-4096-37'].includes(f.name))){
    const prepared=await prepareReference(f),expected=numericView(runReference(prepared,f));
    const nativeMs=[],projectMs=[],jsMs=[],singleRoundtripMs=[],requestBytes=[],responseBytes=[];
    for(let batch=0;batch<7;batch++){
      const nativeBatch=()=>{const request=encodeRequest(f,25),response=native(request.input);const raw=decodeComplex(response,request.context);nativeMs.push(Number(raw.elapsedNs)/1e6/25);
        for(let i=0;i<3;i++)projectResponse(response,request.context);let value;const t=performance.now();for(let i=0;i<25;i++)value=projectResponse(response,request.context);projectMs.push((performance.now()-t)/25);assert.deepEqual(value,expected);};
      const jsBatch=()=>{for(let i=0;i<3;i++)runReference(prepared,f);let value;const t=performance.now();for(let i=0;i<25;i++)value=runReference(prepared,f);jsMs.push((performance.now()-t)/25);assert.deepEqual(numericView(value),expected);};
      if(batch%2){nativeBatch();jsBatch();}else{jsBatch();nativeBatch();}
      const t=performance.now(),request=encodeRequest(f),response=native(request.input),value=projectResponse(response,request.context);singleRoundtripMs.push(performance.now()-t);assert.deepEqual(value,expected);requestBytes.push(request.input.length);responseBytes.push(response.length);
    }
    results.push({fixture:f.name,nativeFftMs:nativeMs,jsDecodeAndProjectionMs:projectMs,referenceJsMs:jsMs,hostSingleProcessRoundtripMs:singleRoundtripMs,
      nativeFftMedianMs:median(nativeMs),jsDecodeAndProjectionMedianMs:median(projectMs),referenceJsMedianMs:median(jsMs),hostSingleProcessRoundtripMedianMs:median(singleRoundtripMs),requestBytes:requestBytes[0],responseBytes:responseBytes[0]});
  }
  report.stages.push({name:'host-diagnostic-timings',status:'PASS',batches:7,iterations:25,results,
    limits:['Shared Linux host, no CPU affinity, descriptive measurements only. No mobile/device or language-only speedup.',
      'Native FFT excludes parsing/allocation; output buffer is reused and validation is timed. JS projection includes response validation and array allocation. Summed medians are not measured bridge latency.',
      'JS reference also copies prepared bytes and creates full metadata. Native/projection costs are not identical work to full reference.',
      'Single process roundtrip includes request/plan serialization, process launch, 3 native warmups + 1 measured FFT, response serialization/decode/projection. Not cold-kernel or real mobile bridge latency.',
      'Plans are warm cached JS runtime plans. No Rust component is compiled or timed.']});
}
try{
  checkReferenceBlobs();
  report.environment.compiler=required('compiler-version','g++',['--version']).stdout.toString().trim();
  if (backend === 'cpp') required('compile','g++',[...flags,'src/kernel.cpp','src/host.cpp','-o',host]);
  else {
    required('rust-version','rustc',['--version']);
    required('rust-build','cargo',['build','--manifest-path','rust/Cargo.toml','--locked','--offline','--release']);
    report.rustCompiled=true;
  }
  report.executableSha256=hash(readFileSync(host));
  required('abi-compile','g++',[...flags,'src/kernel.cpp','src/abi_test.cpp','-o',join(build,`abi-${mode}`)]);required('abi-tests',join(build,`abi-${mode}`),[]);
  await differential([...fixtures(),...extraFixtures()],'prior-61-case-exact-equivalence');
  await differential(impulses(),'all-7936-impulse-positions-exact-equivalence');
  await differential(randomCases(),'seeded-full-range-selection-exact-equivalence');
  rejectionTests();await dft();
  if(mode==='sanitize')report.stages.push({name:'address-and-undefined-behavior-sanitizers',status:'PASS',leakChecking:'NOT RUN: detect_leaks=0 explicitly; no leak-freedom claim'});
  if(mode==='benchmark')await benchmark();
  report.status='PASS';report.conclusion='Exact tested host numerical projection and raw FFT compatibility only; not universal, Hermes, app ABI integration, mobile, or production acceptance. Rust acceptance requires backend=rust and rustCompiled=true.';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();writeFileSync(join(out,`${runName}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
