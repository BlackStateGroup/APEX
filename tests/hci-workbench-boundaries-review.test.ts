import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { HciWorkbenchController as Controller, decodeHciHex } from '../src/hci-workbench.ts';
import { hciDigest as webHash } from '../src/platform/hci-digest.ts';
const hash=async(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const header='6274736e6f6f700000000001000003ea';
function event(count=1,bad=false){const p=[4,62,2+10*count,2,count];for(let i=0;i<count;i++)p.push(bad&&i===count-1?255:0,0,171,205,239,137,103,69,0,200);const h=Buffer.alloc(24);h.writeUInt32BE(p.length);h.writeUInt32BE(p.length,4);h.writeUInt32BE(3,8);return h.toString('hex')+Buffer.from(p).toString('hex');}
const source=header+event(6)+event(6,true)+event(1).repeat(5);
const make=(h=hash)=>{const c=new Controller(true,h);c.edit(source,c.lease);c.declare('synthetic-fixture',c.lease);return c;};
function gate(){let resolve!:(s:string)=>void,reject!:(e:Error)=>void;const promise=new Promise<string>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function frozenTree(v:unknown){if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));for(const x of Object.values(v))frozenTree(x);}}
test('independent: whole rejection matrix preserves exact previous input and fence across declaration/tab changes',async()=>{
 const c=make();await c.inspect(c.lease);
 for(const bad of [' 00','00\n','00\r','00\t','00\u0000','00\u200b','00\ufeff','0x00','００','G0','0'.repeat(65537)]){
 c.edit(bad,c.lease);assert.equal(c.state.draft,source);assert.equal(c.state.metadata,null);assert.equal(c.state.rejectedEdit,true);
 c.declare('recorded-import',c.lease);c.deactivate();c.activate();await c.inspect(c.lease);assert.equal(c.state.metadata,null);assert.equal(c.state.rejectedEdit,true);
 c.edit(source,c.lease);assert.equal(c.state.rejectedEdit,false);await c.inspect(c.lease);assert.ok(c.state.metadata);
 }
 c.edit('ABC',c.lease);await c.inspect(c.lease);assert.equal(c.state.metadata,null);assert.equal(c.state.draft,'ABC');
});
test('independent: overlapping generations cannot overwrite a newer successful inspection, including old error',async()=>{
 for(const reject of [false,true]){const a=gate(),b=gate();let calls=0;const c=make(()=>++calls===1?a.promise:b.promise);const old=c.inspect(c.lease);c.edit(header,c.lease);const fresh=c.inspect(c.lease);b.resolve(await hash(decodeHciHex(header)));await fresh;const accepted=c.state;assert.equal(accepted.metadata!.recordCount,0);if(reject)a.reject(new Error('PRIVATE FAILURE'));else a.resolve(await hash(decodeHciHex(source)));await old;assert.equal(c.state,accepted);assert.doesNotMatch(JSON.stringify(c.state),/PRIVATE FAILURE/);}
});
test('independent: invalid hash outcomes never publish metadata and recover explicitly',async()=>{
 for(const bad of [null,undefined,{},'f'.repeat(63),'f'.repeat(65),'A'.repeat(64),'g'.repeat(64),'f'.repeat(64)+'\n']){const c=make(async()=>bad as any);await c.inspect(c.lease);assert.equal(c.state.pending,false);assert.equal(c.state.metadata,null);assert.equal(c.state.reports.length,0);}
 const c=make(async()=>{throw new Error('SECRET HASH ERROR');});await c.inspect(c.lease);assert.doesNotMatch(c.state.message,/SECRET/);
});
test('independent: same-source failed selection atomically removes an earlier valid selected event; snapshots deeply immutable',async()=>{
 const c=make();await c.inspect(c.lease);const original=c.state;frozenTree(original);c.select(0,c.lease,c.state);assert.equal(c.state.reportCount,6);const first=c.state;frozenTree(first);
 assert.throws(()=>Object.defineProperty(first.reports[0]!,'dataHex',{value:'corrupt'}));assert.throws(()=>Object.setPrototypeOf(first.metadata!.records[0]!,{}));assert.throws(()=>{(first.metadata!.warnings as string[]).push('bad');});assert.throws(()=>{(c as any).state={};});
 c.reportPage(1,c.lease,c.state);assert.equal(c.state.reports.length,2);const second=c.state;c.select(1,c.lease,c.state);assert.equal(c.state.selectedIndex,null);assert.equal(c.state.reportCount,0);assert.equal(c.state.reportPage,0);assert.equal(c.state.reports.length,0);assert.match(c.state.message,/refused/);assert.equal(first.reports.length,4);assert.equal(second.reports.length,2);
 const failed=c.state;c.reportPage(0,c.lease,second);c.select(0,c.lease,first);assert.equal(c.state,failed);c.select(0,c.lease,c.state);assert.equal(c.state.reportCount,6);
 for(const n of [-1,1,3,8,Infinity,NaN,0.5]){const before=c.state;c.page(n,c.lease,c.state);assert.equal(c.state,before);}c.page(4,c.lease,c.state);assert.equal(c.state.metadata!.records.length,3);assert.equal(c.state.metadata!.nextStart,null);
});
test('independent: old activation lease invalidates all controls while rejected draft survives tab leave',async()=>{
 const c=make();await c.inspect(c.lease);const observed=c.state,lease=c.lease;c.edit('bad input',lease);c.deactivate();c.activate();const after=c.state;
 c.example(lease);c.clear(lease);c.edit('00',lease);c.declare('recorded-import',lease);c.select(0,lease,observed);c.page(4,lease,observed);c.reportPage(1,lease,observed);await c.inspect(lease);assert.equal(c.state,after);assert.equal(after.draft,source);assert.equal(after.rejectedEdit,true);c.clear(c.lease);assert.equal(c.state.rejectedEdit,false);
});
test('independent: actual native adapter with narrow expo digest mock and web digest agree with Node on non-ASCII subviews',async()=>{
 const calls:Uint8Array[]=[];(globalThis as any).__reviewHciDigest=(algorithm:string,b:Uint8Array)=>{assert.equal(algorithm,'SHA-256');calls.push(b);return Promise.resolve(Uint8Array.from(createHash('sha256').update(b).digest()).buffer);};
 const url=new URL('../src/platform/hci-digest.native.ts',import.meta.url).href;
 const hook=registerHooks({resolve(s,c,next){if(c.parentURL===url&&s==='expo-crypto')return{url:'data:text/javascript,'+encodeURIComponent('export const CryptoDigestAlgorithm={SHA256:"SHA-256"}; export const digest=globalThis.__reviewHciDigest;'),shortCircuit:true};return next(s,c);}});
 try{const {hciDigest}=await import('../src/platform/hci-digest.native.ts');for(const b of [new Uint8Array([0,128,255,195,169]),Buffer.from([1,255,128,0,2]).subarray(1,4),Uint8Array.from({length:256},(_,i)=>i)]){const expected=await hash(b);assert.equal(await hciDigest(b),expected);assert.equal(await webHash(b),expected);assert.notEqual(calls.at(-1),b);assert.deepEqual([...calls.at(-1)!],[...b]);}const b=Uint8Array.from([255,0,128]);const expected=await hash(b);const pending=webHash(b);b.fill(0);assert.equal(await pending,expected);assert.equal(calls.length,3);}finally{hook.deregister();delete(globalThis as any).__reviewHciDigest;}
});
test('independent: malformed AD remains visibly distinct from successfully parsed advertising',async()=>{
 const p=Buffer.from([4,62,15,2,1,0,0,1,2,3,4,5,6,3,5,9,65,200]);const h=Buffer.alloc(24);h.writeUInt32BE(p.length);h.writeUInt32BE(p.length,4);h.writeUInt32BE(3,8);
 const c=make();c.edit(header+h.toString('hex')+p.toString('hex'),c.lease);await c.inspect(c.lease);c.select(0,c.lease,c.state);
 assert.equal(c.state.selectedIndex,0);assert.equal(c.state.reports[0]!.adElements,0);
 assert.equal((c.state.reports[0] as any).adStatus,'malformed','bounded AD parser status must survive projection');
});
