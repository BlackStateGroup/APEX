import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {encodeRequest, projectResponse, decodeComplex, maxRequest} from '../contract.mjs';
import {prepareReference,runReference} from '../reference.mjs';
const executable = new URL('./host',import.meta.url).pathname;
const run = input => spawnSync(executable,[],{input,maxBuffer:2**20,timeout:5000});
let seed=0x11223344; const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0};
let cases=0,cells=0,first;
for(const n of [256,512,1024,2048,4096]) for(const kind of ['zero','random','extrema','impulse','tone','tied']) {
 const count=Math.min(7,16384/n), hop=n-13,start=3,samples=start+(count-1)*hop+n;
 const data=Buffer.alloc(samples*4);
 for(let j=0;j<samples;j++) {
  let i=0,q=0;
  if(kind==='random'){i=(rand()%65536)-32768;q=(rand()%65536)-32768}
  if(kind==='extrema'){i=j%2?32767:-32768;q=j%3?32767:-32768}
  if(kind==='impulse' && j===start+113){i=-32768;q=32767}
  if(kind==='tone'){i=Math.round(28000*Math.cos(2*Math.PI*17.3*j/n));q=Math.round(28000*Math.sin(2*Math.PI*17.3*j/n))}
  if(kind==='tied'){i=Math.round(14000*Math.cos(2*Math.PI*17*j/n));q=0}
  data.writeInt16LE(i,j*4);data.writeInt16LE(q,j*4+2);
 }
 const fixture={data,fftSize:n,frameCount:count,startSample:start,hopSamples:hop,sampleRate:1024000.125,centerFrequency:-2437000000.25};
 const request=encodeRequest(fixture), result=run(request.input);assert.equal(result.status,0,result.stderr.toString());
 const actual=projectResponse(result.stdout,request.context),ref=runReference(await prepareReference(fixture),fixture);
 for(const key of ['cellCount','windowDurationSeconds','binSpacingHz','axis','frames'])assert.deepStrictEqual(actual[key],ref[key],`${n}/${kind}/${key}`);
 cases++;cells+=n*count;if(!first)first={...request,response:result.stdout,fixture};
}
let hostile=0;const reject=b=>{let r=run(b);assert.equal(r.status,2);assert.equal(r.stdout.length,0);hostile++};
for(const len of [0,1,7,31,32,100,first.input.length-1])reject(first.input.subarray(0,len));
reject(Buffer.concat([first.input,Buffer.from([0])]));reject(Buffer.alloc(maxRequest+1));
for(const [offset,values] of [[0,[0]],[4,[2]],[8,[0,3,262148,0xffffffff]],[12,[0,128,257,8192,0xffffffff]],[16,[65536,0xffffffff]],[20,[0,65537,0xffffffff]],[24,[0,65,0xffffffff]],[28,[0,1001,0xffffffff]]])for(const value of values){let b=Buffer.from(first.input);b.writeUInt32LE(value,offset);reject(b)}
for(const value of [NaN,Infinity,-Infinity,-0.1,1.1]){let b=Buffer.from(first.input);b.writeDoubleLE(value,32+first.fixture.data.length+255*8);reject(b)}
for(let j=0;j<50;j++){const b=Buffer.alloc(rand()%10000);for(let k=0;k<b.length;k++)b[k]=rand();reject(b)}
let jsRejects=0;const badResponse=(b,c=first.context)=>{assert.throws(()=>decodeComplex(b,c));jsRejects++};
badResponse(first.response,{});badResponse(first.response,{...first.context});badResponse(first.response.subarray(0,-1));badResponse(Buffer.concat([first.response,Buffer.from([0])]));
for(const at of [0,4,6,8,12]){let b=Buffer.from(first.response);b[at]^=1;badResponse(b)}
for(const x of [NaN,Infinity,-Infinity,513,-513]){let b=Buffer.from(first.response);b.writeDoubleLE(x,24);badResponse(b)}
const another=encodeRequest({...first.fixture,centerFrequency:123});assert.equal(projectResponse(first.response,another.context).axis[0].declaredRfHz,123-first.fixture.sampleRate/2);
console.log(JSON.stringify({status:'PASS',exactProjectionCases:cases,exactProjectionCells:cells,hostileRequestsRejected:hostile,invalidResponsesOrContextsRejected:jsRejects,sameShapeCrossContextAccepted:true},null,2));
