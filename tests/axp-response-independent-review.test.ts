import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInfo, validateCapabilities, DeviceSession } from '../packages/core/session.ts';
import { utf8, text, VERSION, encode, FrameDecoder, Kind, Opcode } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';
import type { ByteTransport } from '../packages/core/transport.ts';
const base = {id:'device',board:'board',firmware:'1',protocol:1,source:'host'};
const ops = ['system.info','system.capabilities','system.ping'];
function legacyInfo(b: Uint8Array) {
 const v = JSON.parse(text(b));
 if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error();
 for (const k of ['id','board','firmware']) if (typeof v[k] !== 'string' || v[k].length < 1 || v[k].length > 128 || /[\x00-\x1f]/.test(v[k])) throw Error();
 if(v.protocol !== VERSION || !['simulator','host','accessory'].includes(String(v.source))) throw Error();
 return v;
}
const extras = [null,true,false,0,-0,1.25,'é😀',[],{}, {a:[1,false,null,{b:'escaped\\"'}]}, JSON.parse('{"__proto__":{"x":1},"constructor":"ok"}')];
for (const source of ['host','accessory','simulator']) for(const [i, extra] of extras.entries()) test(`independent legacy info parity ${source}/${i}`,()=>{
 const b=utf8(JSON.stringify({...base,source,extra})); assert.deepEqual(validateInfo(b),legacyInfo(b));
});
for (const order of [ops,[ops[0],ops[2],ops[1]],[ops[1],ops[0],ops[2]],[ops[1],ops[2],ops[0]],[ops[2],ops[0],ops[1]],[ops[2],ops[1],ops[0]]]) test(`independent capability order ${order}`,()=>{
 for (const extra of extras) assert.deepEqual(validateCapabilities(utf8(JSON.stringify({operations:order,extra}))),order);
});
test('independent snapshot ignores all own accessors and subclass hooks',()=>{
 class Hostile extends Uint8Array { static get [Symbol.species]() { throw Error('species called'); } }
 const b=new Hostile(utf8(JSON.stringify(base))); let hooks=0;
 for(const k of ['buffer','byteLength','byteOffset','length','slice','subarray','constructor',Symbol.iterator,Symbol.toStringTag]) Object.defineProperty(b,k,{get(){hooks++; throw Error('hook called');}});
 assert.deepEqual(validateInfo(b),base); assert.equal(hooks,0);
 b.fill(0); assert.throws(()=>validateInfo(b));
});
test('independent fixed Buffer and offset snapshot bounds',()=>{
 assert.deepEqual(validateInfo(Buffer.from(JSON.stringify(base))),base);
 const b=utf8('junk'+JSON.stringify(base)+'tail'); assert.deepEqual(validateInfo(new Uint8Array(b.buffer,4,b.length-8)),base);
 const exact=utf8(JSON.stringify({...base,extra:'é'})); const padded=new Uint8Array(512); padded.fill(32); padded.set(exact); assert.deepEqual(validateInfo(padded),{...base,extra:'é'});
 assert.throws(()=>validateInfo(new Uint8Array(513).fill(32)));
});
test('independent exotic input rejects and malformed UTF8 fails closed',()=>{
 for (const v of [new Uint8Array(),new DataView(new ArrayBuffer(10)),new Uint16Array(10),new Proxy(utf8(JSON.stringify(base)),{}),new Uint8Array(new SharedArrayBuffer(100)),new Uint8Array(new ArrayBuffer(100,{maxByteLength:200}))]) assert.throws(()=>validateInfo(v as Uint8Array));
 const b=utf8(JSON.stringify(base)); structuredClone(b.buffer,{transfer:[b.buffer]}); assert.throws(()=>validateInfo(b));
 for(const invalid of [[0xc0,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xe2,0x82]]) assert.throws(()=>validateInfo(Uint8Array.from([...utf8(JSON.stringify(base).slice(0,-1)+',"extra":"'),...invalid,...utf8('"}')])));
});
class Peer implements ByteTransport {
 source='simulator' as const; data=new Set<(b:Uint8Array)=>void>(); closed=new Set<(e:Error)=>void>(); releases=0; fail=false;
 handler=(f:Frame): Pick<Frame,'payload'|'kind'>=>({kind:Kind.Response,payload:f.opcode===Opcode.Info?utf8(JSON.stringify(base)):f.opcode===Opcode.Capabilities?utf8(JSON.stringify({operations:ops})):f.payload});
 decoder=new FrameDecoder(f=>{const wire=encode({...f,...this.handler(f)}); for(const cb of this.data) cb(wire);});
 async connect(){} async write(b:Uint8Array){this.decoder.push(b);} async disconnect(){this.releases++;if(this.fail)throw Error('cleanup');}
 onData(cb:(b:Uint8Array)=>void){this.data.add(cb);return()=>{this.data.delete(cb);};} onDisconnect(cb:(e:Error)=>void){this.closed.add(cb);return()=>{this.closed.delete(cb);};}
}
const bad=['{"code":"X","\\u0063ode":"Y"}','{"code":"X","extra":{"\\ud83d\\ude00":1,"😀":2}}','{"code":"X","extra":'+ '['.repeat(8)+'0'+']'.repeat(8)+'}', '{"code":"X",}', '[]','null'];
test('independent actual error fallback, old code semantics, raw ping parity',async()=>{
 const p=new Peer(),s=new DeviceSession(p);await s.open();
 try{
 for(const doc of bad){p.handler=()=>({kind:Kind.Error,payload:utf8(doc)});await assert.rejects(s.request('system.ping'),{message:'DEVICE_ERROR'});assert.equal(s.pendingCount,0);assert.equal(s.state,'open');assert.equal(p.releases,0);}
 for(const code of ['', 'ok','z'.repeat(160),'line\nbreak']){p.handler=()=>({kind:Kind.Error,payload:utf8(JSON.stringify({code,extra:{a:1}}))});await assert.rejects(s.request('system.ping'),{message:code.slice(0,128)});}
 p.handler=f=>({kind:Kind.Response,payload:f.payload});const raw=Uint8Array.from({length:512},(_,i)=>i%256);assert.deepEqual(await s.request('system.ping',raw),raw);
 }finally{await s.close();}assert.equal(p.releases,1);
});
test('independent actual malformed handshake retains explicit cleanup retry authority',async()=>{
 for(const op of [Opcode.Info,Opcode.Capabilities]){
 const p=new Peer(),normal=p.handler;p.fail=true;p.handler=f=>f.opcode===op?{kind:Kind.Response,payload:utf8(op===Opcode.Info?JSON.stringify({...base,source:['host']}):'{"operations":[],"operations":[]}')}:normal(f);
 const s=new DeviceSession(p);await assert.rejects(s.open());assert.equal(s.state,'closed');assert.equal(s.info,null);assert.deepEqual(s.capabilities,[]);assert.equal(s.pendingCount,0);assert.equal(p.data.size+p.closed.size,0);assert.equal(p.releases,1);assert.equal(s.transportReleasePending,true);
 await assert.rejects(s.open(),/reused/);assert.equal(p.releases,1);p.fail=false;await s.close();assert.equal(p.releases,2);assert.equal(s.transportReleasePending,false);
 }
});
