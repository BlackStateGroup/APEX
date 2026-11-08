/** Independent synthetic review. Fixtures are literal/original, no capture inputs. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as f from './hci-selected-review-fixture.ts';
import * as h from '../packages/core/hci-offline.ts';
import {parseBleAdvertisingHex,interpretBleServiceData} from '../packages/core/ble-advertisements.ts';
const prepare=(b:Uint8Array=f.capture)=>h.prepareHci(b,f.context,f.hash);
const create=h.createHciLegacyEventDocument,read=h.readHciLegacyEventDocument;
async function doc(){return create(await prepare(),2,f.hash);}
async function changed(fn:(v:any)=>void){const v=JSON.parse(await doc());fn(v);return JSON.stringify(v);}
async function rehash(v:any){const b=Buffer.from(v.derivative.fileHeaderHex+v.derivative.recordHex,'hex');v.derivative.sha256=await f.hash(b);}
function frozen(v:any){if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));Object.values(v).forEach(frozen);}}

test('independent exact binary slice, hash oracle, unrelated sentinels and derivative coordinates',async()=>{
 const text=await doc(),v=JSON.parse(text),result=await read(text,f.hash);
 assert.equal(v.derivative.fileHeaderHex,f.capture.subarray(0,16).toString('hex'));
 const r=f.capture.subarray(f.chosenOffset,f.chosenOffset+24+f.chosen.length);
 assert.equal(v.derivative.recordHex,r.toString('hex'));
 const b=Buffer.concat([f.header,r]);assert.equal(v.derivative.sha256,await f.hash(b));
 assert.notEqual(v.derivative.sha256,await f.hash(Buffer.from(v.derivative.fileHeaderHex+v.derivative.recordHex)));
 assert.notEqual(v.derivative.sha256,await f.hash(f.capture));
 assert.deepEqual(v.sourceReference,{sha256:await f.hash(f.capture),byteCount:f.capture.length,recordIndex:2,recordOffset:f.chosenOffset});
 for(const s of ['COMMAND_SENTINEL','ACL_SENTINEL','KEY_EVENT_SENTINEL']){assert.ok(!text.includes(s));assert.ok(!text.includes(Buffer.from(s).toString('hex')));}
 assert.equal(result.selection.record.offset,16);assert.equal(result.selection.record.index,0);assert.equal(result.selection.record.payloadOffset,40);
 assert.equal(result.selection.source.sha256,await f.hash(b));assert.equal(result.selection.source.byteCount,b.length);
 assert.deepEqual(result.selection.reports.map(x=>x.kind),['advertisement','scan-response','advertisement']);
 for(const r of result.selection.reports){assert.equal(b.subarray(r.dataOffset,r.dataOffset+r.dataLength).toString('hex'),r.dataHex);}
 frozen(result);assert.equal(result.verification.originalSourceReference,'UNVERIFIED');
});
test('literal minimum 55 bytes and maximum 298 bytes with exact 255 parameter limit',async()=>{
 assert.equal(f.minimum.length,15);
 const max=f.event([...Array.from({length:24},()=>f.report()),f.report('020106')]);
 assert.equal(max.length,258);assert.equal(max[2],255);
 for(const [payload,size,count]of [[f.minimum,55,1],[max,298,25]]as const){
  const text=await create(await prepare(Buffer.concat([f.header,f.record(payload)])),0,f.hash),v=JSON.parse(text);
  assert.equal(v.derivative.byteCount,size);assert.equal(v.derivative.recordHex.length,(size-16)*2);assert.equal((await read(text,f.hash)).selection.reports.length,count);
 }
});
test('existing serialized metadata, legacy and extended output is byte-for-byte unchanged',async()=>{
 const p=await prepare();const baseline=JSON.parse(readFileSync(new URL('../verification/hci-selected-document-independent/baseline.json',import.meta.url),'utf8'));
 assert.deepEqual([h.serializeHciReport(h.listHciRecords(p)),h.serializeHciReport(h.selectHciLegacyEvent(p,2)),h.serializeHciReport(h.selectHciExtendedMetadata(p,4))],baseline);
});
test('caller input and preparation/creation/read hash buffers cannot alias retained bytes',async()=>{
 const bytes=Buffer.from(f.capture);let held:Uint8Array|undefined;
 const p=await h.prepareHci(bytes,f.context,async b=>{const digest=await f.hash(b);held=b;b.fill(0);return digest;});bytes.fill(255);held!.fill(1);
 const text=await create(p,2,async b=>{const digest=await f.hash(b);held=b;await Promise.resolve();b.fill(0);return digest;});held!.fill(2);
 assert.equal(JSON.parse(text).derivative.recordHex,f.record(f.chosen).toString('hex'));
 const result=await read(text,async b=>{const digest=await f.hash(b);held=b;b.fill(0);return digest;});held!.fill(3);
 assert.equal(result.selection.reports[0]!.dataHex,'020106');assert.equal(h.selectHciLegacyEvent(p,2).reports[0]!.dataHex,'020106');
});
test('brand spoofs, nonlegacy and invalid selectors reject before hash exposure',async()=>{
 const p=await prepare();let calls=0;const spy=async(b:Uint8Array)=>{calls++;return f.hash(b);};
 for(const fake of [{...p},Object.create(p),new Proxy(p,{})])await assert.rejects(create(fake,2,spy));
 for(const i of [-1,0,1,3,4,5,1.5,NaN,Infinity])await assert.rejects(create(p,i,spy));
 assert.equal(calls,0);
});
test('hash failures reject atomically; valid shape is not hash honesty',async()=>{
 const p=await prepare(),text=await doc();
 for(const cb of [async()=>{throw Error('hash failed');},async()=> 'A'.repeat(64),async()=> '0'.repeat(63)]){await assert.rejects(create(p,2,cb));await assert.rejects(read(text,cb));}
 const lying=async()=> '0'.repeat(64),dishonest=await create(p,2,lying);
 await assert.rejects(read(dishonest,f.hash));const result=await read(dishonest,lying);
 assert.match(result.warnings.join(' '),/trusted.*honesty/);
});
test('exact imported whitespace and escaped Unicode survive, bounded by UTF16 length',async()=>{
 const text=await doc();const decorated=' \n'+text.replace('independent selected review','\\u0069ndependent selected review')+'\r\t';
 assert.equal((await read(decorated,f.hash)).document,decorated);
 const padded=text+' '.repeat(4096-text.length);assert.equal((await read(padded,f.hash)).document,padded);await assert.rejects(read(padded+' ',f.hash));
});
test('all exact object fields reject missing and extra fields before hashing',async()=>{
 const v=JSON.parse(await doc());let calls=0;const spy=async(b:Uint8Array)=>{calls++;return f.hash(b);};
 for(const path of ['', 'context','sourceReference','derivative']){
  const keys=Object.keys(path?v[path]:v);
  for(const key of [...keys,'extra','__proto__']){const c=JSON.parse(JSON.stringify(v)),o=path?c[path]:c;if(keys.includes(key))delete o[key];else Object.defineProperty(o,key,{value:0,enumerable:true});await assert.rejects(read(JSON.stringify(c),spy));}
 }
 assert.equal(calls,0);
});
test('decoded and escaped duplicate keys at every depth reject before hash',async()=>{
 const text=await doc();let calls=0;const spy=async(b:Uint8Array)=>{calls++;return f.hash(b);};
 for(const key of ['schemaVersion','format','sourceKind','representation','context','sourceReference','derivative','provenance','label','sha256','byteCount','recordIndex','recordOffset','fileHeaderHex','recordHex']){
  const escaped='\\u'+key.charCodeAt(0).toString(16).padStart(4,'0')+key.slice(1);
  for(const duplicate of [key,escaped])await assert.rejects(read(text.replace('"'+key+'":','"'+duplicate+'":null,"'+key+'":'),spy),key);
 }
 assert.equal(calls,0);
});
test('wrong types, nested objects, arrays, nonJSON and unsafe string controls reject',async()=>{
 for(const value of [null,[],true,3,'text'])await assert.rejects(read(JSON.stringify(value),f.hash));
 for(const [path,key,values]of [['','schemaVersion',[2,'1',null,{},[]]],['context','label',['',null,7,{},[], 'x\u0000y','x\ny','x\u007fy','x'.repeat(257)]],['context','provenance',['other',null]],['derivative','recordHex',[null,[],{}]]]as const){for(const value of values)await assert.rejects(read(await changed(v=>{(path?v[path]:v)[key]=value;}),f.hash));}
 const text=await doc();for(const bad of [text+'x',text.slice(0,-1),text.replace(':1,',':NaN,'),text.replace(':1,',':Infinity,'),text.replace('"label":','"label":/*x*/'),text.replace('independent selected review','x\ty')])await assert.rejects(read(bad,f.hash));
});
test('hex, exact header, hash syntax, byte counts and original-range plausibility are strict',async()=>{
 const mutations:Array<(v:any)=>void>=[
 v=>v.derivative.fileHeaderHex='00'.repeat(16),v=>v.derivative.fileHeaderHex=v.derivative.fileHeaderHex.toUpperCase(),
 v=>v.derivative.recordHex+='0',v=>v.derivative.recordHex=v.derivative.recordHex.toUpperCase(),v=>v.derivative.recordHex='00'.repeat(38),v=>v.derivative.recordHex='00'.repeat(283),v=>v.derivative.recordHex='gg'+v.derivative.recordHex.slice(2),
 v=>v.derivative.byteCount++,v=>v.derivative.byteCount=54,v=>v.derivative.byteCount=299,
 v=>v.sourceReference.recordIndex=0,v=>v.sourceReference.recordIndex=4096,v=>v.sourceReference.recordIndex=-1,v=>v.sourceReference.recordOffset=16,v=>v.sourceReference.recordOffset=15,v=>v.sourceReference.recordOffset=63,v=>v.sourceReference.recordOffset=1.5,
 v=>v.sourceReference.byteCount=262145,v=>v.sourceReference.byteCount=v.sourceReference.recordOffset+v.derivative.recordHex.length/2-1,v=>v.sourceReference.byteCount=v.sourceReference.recordOffset+v.derivative.recordHex.length/2+23,
 ];
 for(const target of ['sourceReference','derivative'])for(const sha of ['A'.repeat(64),'0'.repeat(63),'g'.repeat(64),null])mutations.push(v=>v[target].sha256=sha);
 let calls=0;const spy=async(b:Uint8Array)=>{calls++;return f.hash(b);};for(const mutation of mutations)await assert.rejects(read(await changed(mutation),spy));assert.equal(calls,0);
});
test('plausible original claims can change and always remain explicitly UNVERIFIED',async()=>{
 const text=await changed(v=>{v.sourceReference.sha256='0'.repeat(64);v.sourceReference.recordIndex=7;v.sourceReference.recordOffset=184;v.sourceReference.byteCount=262144;});
 const result=await read(text,f.hash);assert.equal(result.verification.originalSourceReference,'UNVERIFIED');assert.notEqual(result.selection.source.sha256,'0'.repeat(64));assert.equal(result.selection.record.index,0);assert.equal(result.selection.record.offset,16);
 for(const suffix of [0,24]){const text=await changed(v=>v.sourceReference.byteCount=v.sourceReference.recordOffset+v.derivative.recordHex.length/2+suffix);assert.equal((await read(text,f.hash)).verification.originalSourceReference,'UNVERIFIED');}
});
test('structural and late bad reports reject even with recomputed matching derivative digest',async()=>{
 const base=JSON.parse(await doc());
 for(const mutate of [(b:Buffer)=>b.writeUInt32BE(2,8),(b:Buffer)=>b[26]!--,(b:Buffer)=>b[28]=0,(b:Buffer)=>b[28]=26,(b:Buffer)=>b[27]=13,(b:Buffer)=>b[b.length-1]=128,(b:Buffer)=>b[29+13+15+1]=4]){
  const v=structuredClone(base),b=Buffer.from(v.derivative.recordHex,'hex');mutate(b);v.derivative.recordHex=b.toString('hex');await rehash(v);await assert.rejects(read(JSON.stringify(v),f.hash));
 }
 await assert.rejects(read(await changed(v=>v.derivative.sha256='0'.repeat(64)),f.hash));
 const bad=Buffer.from(f.chosen);bad[bad.length-1]=128;const p=await prepare(Buffer.concat([f.header,f.record(bad)]));let calls=0;await assert.rejects(create(p,0,async()=>{calls++;return '0'.repeat(64);}));assert.equal(calls,0);
});
test('malformed, unknown, encrypted AD and inert URL retain bytes and recomputed interpretation parity',async()=>{
 for(const hex of ['','0001','03ff01','02eeab','0516d2fc41ff','0716aafe10c40361','0416ffff00','0409ff0000']){
  const text=await create(await prepare(Buffer.concat([f.header,f.record(f.event([f.report(hex),f.report(hex,4)]))])),0,f.hash);
  const result=await read(text,f.hash);assert.equal(result.selection.reports.length,2);
  for(const r of result.selection.reports){const ad=parseBleAdvertisingHex(hex);assert.equal(r.dataHex,hex);assert.deepEqual(r.advertising,ad);assert.deepEqual(r.serviceReadings,ad.elements.flatMap(e=>e.value.kind==='service-data'?[{elementOffset:e.offset,reading:interpretBleServiceData(e.value.uuid,e.value.payloadHex)}]:[]));}
 }
});
