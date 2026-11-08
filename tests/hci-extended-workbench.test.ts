import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { HciWorkbenchController as Controller, HCI_EXAMPLE } from '../src/hci-workbench.ts';
import { marker, header, record, source } from './hci-extended-workbench-fixture.ts';
const hash=async(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function ready(hex=source(), h=hash) {const c=new Controller(true,h);c.edit(hex,c.lease);c.declare('synthetic-fixture',c.lease);await c.inspect(c.lease);return c;}
function frozen(v:unknown) {if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));Object.values(v).forEach(frozen);}}
const cleared=(c:Controller)=>{assert.equal(c.state.selectedIndex,null);assert.equal(c.state.extendedIndex,null);assert.deepEqual(c.state.reports,[]);assert.deepEqual(c.state.extendedReports,[]);};
test('extended explicit selection stays metadata-only across all data statuses; deeply immutable private observations',async()=>{
 for(let status=0;status<4;status++) {const c=await ready(source([record([header(status)])]));cleared(c);c.selectExtended(0,c.lease,c.state);
 const r=c.state.extendedReports[0]!;assert.equal(r.dataStatus.raw,status);assert.equal(r.dataOffset,69);assert.equal(r.dataLength,marker.length);assert.equal(r.reportLength,24+marker.length);
 assert.equal(r.advertiserType.raw,255);assert.equal(r.advertiserType.state,'unavailable');assert.equal('display' in r.advertiserAddress,false);assert.equal(r.directType.state,'inapplicable');assert.equal('display' in r.directAddress,false);
 assert.equal(r.primaryPhy.state,'feature-context-unknown');assert.equal(r.secondaryPhy.raw,4);assert.equal(r.rssi.value,-64);assert.equal(r.periodicInterval.value,7.5);
 const text=JSON.stringify(c.state.extendedReports);assert.doesNotMatch(text,/dataHex|advertising|serviceReadings|PRIVATE_EXTENDED_PAYLOAD/);assert.ok(!text.includes(Buffer.from(marker).toString('hex')));frozen(c.state);assert.deepEqual(Object.keys(c),[]);
 assert.throws(()=>{(r.primaryPhy as any).raw=1});assert.throws(()=>{(c.state.extendedReports as any).push(r)});
 }
});
test('switching kinds and failed whole-event selection clears every previous result',async()=>{
 const bad=record([header(),header()]);bad[bad.length-marker.length-1]=marker.length+1;
 const legacy=Buffer.from(HCI_EXAMPLE.slice(32),'hex'),badLegacy=Buffer.from(legacy);badLegacy[26]=11;
 const c=await ready(source([legacy,record(),bad,badLegacy]));
 c.select(0,c.lease,c.state);assert.equal(c.state.reports.length,1);c.selectExtended(1,c.lease,c.state);assert.equal(c.state.selectedIndex,null);assert.equal(c.state.reports.length,0);
 c.select(0,c.lease,c.state);assert.equal(c.state.extendedReports.length,0);assert.equal(c.state.extendedIndex,null);
 c.selectExtended(2,c.lease,c.state);cleared(c);assert.match(c.state.message,/Whole extended event refused/);
 c.selectExtended(1,c.lease,c.state);c.select(3,c.lease,c.state);cleared(c);assert.match(c.state.message,/Whole legacy event refused/);
});
test('exact observed state fences both kinds and pages; bounded whole reports, invalid bounds, old activation',async()=>{
 const c=await ready(source(Array.from({length:5},()=>record(Array.from({length:7},()=>header(0,Buffer.alloc(0)))))));
 const before=c.state;c.selectExtended(0,c.lease,before);assert.equal(c.state.extendedReports.length,4);c.extendedPage(1,c.lease,c.state);assert.equal(c.state.extendedReports.length,3);
 const page=c.state;for(const n of [-1,2,NaN,0.5,Infinity])c.extendedPage(n,c.lease,c.state);assert.equal(c.state,page);
 c.extendedPage(0,c.lease,before);c.selectExtended(1,c.lease,before);assert.equal(c.state,page);
 c.page(4,c.lease,c.state);const after=c.state;c.selectExtended(0,c.lease,c.state);assert.equal(c.state,after);c.selectExtended(4,c.lease,c.state);assert.equal(c.state.extendedIndex,4);
 const lease=c.lease,old=c.state;c.deactivate();c.activate();c.selectExtended(4,lease,old);c.extendedPage(1,lease,old);cleared(c);
});
test('all reset paths clear extended and legacy results; pending hash never resurrects them',async()=>{
 for(const op of ['edit','reject','declare','clear','leave','example']) {
 const c=await ready();c.selectExtended(0,c.lease,c.state);
 const reset=()=>{if(op==='edit')c.edit('aa',c.lease);if(op==='reject')c.edit('zz',c.lease);if(op==='declare')c.declare('recorded-import',c.lease);if(op==='clear')c.clear(c.lease);if(op==='leave'){c.deactivate();c.activate();}if(op==='example')c.example(c.lease);};reset();cleared(c);assert.equal(c.state.metadata,null);
 for(const fail of [false,true]){let resolve!:(s:string)=>void,reject!:(e:Error)=>void;let calls=0;const gate=new Promise<string>((a,b)=>{resolve=a;reject=b});const d=new Controller(true,async()=>{calls++;return gate});d.edit(source(),d.lease);d.declare('synthetic-fixture',d.lease);const pending=d.inspect(d.lease);
 if(op==='edit')d.edit('aa',d.lease);if(op==='reject')d.edit('zz',d.lease);if(op==='declare')d.declare('recorded-import',d.lease);if(op==='clear')d.clear(d.lease);if(op==='leave'){d.deactivate();d.activate();}if(op==='example')d.example(d.lease);
 const after=d.state;if(fail)reject(new Error('late'));else resolve('a'.repeat(64));await pending;assert.equal(d.state,after);cleared(d);assert.equal(calls,1);}
 }
});
