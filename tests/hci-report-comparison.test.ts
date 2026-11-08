import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareHciLegacyReportBytes as compare, serializeHciReportComparison as serialize} from '../packages/core/hci-report-comparison.ts';
import {document,report,hash} from './hci-comparison-fixture.ts';

test('nonfirst selection exact matrix and differing metadata compare supplied fields only',async()=>{
  const left=await document([report('00'),report('020106',0,0,'010203040506',255)]);
  const right=await document([report(''),report('02010500',4,3,'060504030201',20)]);
  const r=await compare(left,1,right,1,hash);
  assert.deepEqual(r.rows,[
    {dataByteOffset:0,leftHex:'02',rightHex:'02',leftDerivativeOffset:65,rightDerivativeOffset:64,relation:'equal'},
    {dataByteOffset:1,leftHex:'01',rightHex:'01',leftDerivativeOffset:66,rightDerivativeOffset:65,relation:'equal'},
    {dataByteOffset:2,leftHex:'06',rightHex:'05',leftDerivativeOffset:67,rightDerivativeOffset:66,relation:'different'},
    {dataByteOffset:3,leftHex:null,rightHex:'00',leftDerivativeOffset:null,rightDerivativeOffset:67,relation:'right-only'},
  ]);
  assert.deepEqual(r.differingOffsets,[2,3]); assert.equal(r.dataBytesEqual,false);
  assert.deepEqual(r.metadataEquality,{eventType:false,kind:false,addressType:false,addressWireHex:false});
  assert.equal(r.left.reportDerivativeOffset,56); assert.equal(r.right.reportDerivativeOffset,55);
  assert.equal(r.left.rssiDbm,-1); assert.equal(r.right.rssiDbm,20); assert.equal(r.left.addressDisplay,'06:05:04:03:02:01');
  assert.match(r.warnings.join(' '),/not sender or device identity/);
});
test('empty, identical, zero vs absent, changed headers and insertion/deletion are positional only',async()=>{
  const empty=await document([report('')]); const zero=await document([report('00')]);
  assert.deepEqual((await compare(empty,0,empty,0,hash)).rows,[]);
  assert.equal((await compare(empty,0,empty,0,hash)).dataBytesEqual,true);
  assert.deepEqual((await compare(zero,0,empty,0,hash)).rows,[{dataByteOffset:0,leftHex:'00',rightHex:null,leftDerivativeOffset:54,rightDerivativeOffset:null,relation:'left-only'}]);
  const a=await document([report('020106')]), b=await document([report('03020106')]);
  const r=await compare(a,0,b,0,hash);
  assert.deepEqual(r.rows.map(x=>[x.leftHex,x.rightHex,x.relation]),[['02','03','different'],['01','02','different'],['06','01','different'],[null,'06','right-only']]);
  assert.deepEqual((await compare(b,0,a,0,hash)).rows.map(x=>x.relation),['different','different','different','left-only']);
  const same=await compare(a,0,a,0,hash); assert.equal(same.dataBytesEqual,true); assert.deepEqual(same.differingOffsets,[]);
});
test('maximum report selection/data bounds and separate malformed/unknown/encrypted AD status',async()=>{
  const max=await document([...Array.from({length:24},()=>report('')),report('020106')]);
  const selected=await compare(max,24,max,24,hash); assert.equal(selected.left.reportCount,25); assert.equal(selected.left.dataDerivativeOffset,294);
  assert.equal(selected.left.derivative.byteCount,298);
  const full=await document([report('00'.repeat(31))]); const r=await compare(full,0,full,0,hash);
  assert.equal(r.rows.length,31); assert.equal(r.rows[30]!.leftDerivativeOffset,84);
  for(const [data,status] of [['09ff01','malformed'],['02ee08','parsed'],['0416d2fc41','parsed']] as const) {
    const d=await document([report(data)]), result=await compare(d,0,d,0,hash);
    assert.equal(result.left.adInterpretation.status,status); assert.equal(result.dataBytesEqual,true);
    assert.ok(!serialize(result).includes('serviceReadings')); assert.match(result.warnings.join(' '),/encrypted.*opaque/);
  }
});
test('all primitive/structural failures on either side precede any hashing',async()=>{
  const d=await document(); let calls=0; const spy=async(b:Uint8Array)=>{calls++;return hash(b);};
  for(const index of [-0,-1,25,1.5,NaN,Infinity,'0',null,{},new Number(0)]) {
    await assert.rejects(compare(d,index as number,d,0,spy)); await assert.rejects(compare(d,0,d,index as number,spy));
  }
  for(const bad of [null,{},new String(d),' '.repeat(4097),d+'x','\ufeff'+d,d.replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1')]) {
    await assert.rejects(compare(bad as string,0,d,0,spy)); await assert.rejects(compare(d,0,bad as string,0,spy));
  }
  assert.equal(calls,0); await assert.rejects(compare(d,0,d,0,null as never));
  const exact=' '.repeat(4096-d.length)+d; assert.equal((await compare(exact,0,d,0,hash)).dataBytesEqual,true);
});
test('whole-event late failure, digest errors, sequential bounded hashes and selection after full verification',async()=>{
  const d=await document(); const bad=await document([report(),report('',5)]);
  let calls=0,active=0; const spy=async(b:Uint8Array)=>{assert.equal(active,0);active++;calls++;await Promise.resolve();active--;return hash(b);};
  await assert.rejects(compare(d,0,bad,0,spy)); assert.equal(calls,2);
  calls=0; await assert.rejects(compare(bad,0,d,0,spy)); assert.equal(calls,1);
  calls=0; await assert.rejects(compare(d,1,d,0,spy)); assert.equal(calls,2);
  calls=0; await compare(d,0,d,0,spy); assert.equal(calls,2);
  for(const adapter of [async()=>{throw Error('private hash failure');},async()=>'',async()=>'0'.repeat(64),async()=>'F'.repeat(64)]) await assert.rejects(compare(d,0,d,0,adapter));
  const corrupted=JSON.parse(d); corrupted.derivative.sha256='b'.repeat(64); await assert.rejects(compare(d,0,JSON.stringify(corrupted),0,hash));
});
test('hash argument isolation, deep freezing, original substitutions and excluded report privacy',async()=>{
  const marker='PRIVATE_EXCLUDED_SENTINEL'; const d=await document([report(Buffer.from(marker).toString('hex')),report()]);
  const modified=JSON.parse(d); modified.sourceReference={sha256:'f'.repeat(64),byteCount:2000,recordIndex:3,recordOffset:100};
  const r=await compare(d,1,JSON.stringify(modified),1,async b=>{const digest=await hash(b);b.fill(255);return digest;});
  assert.equal(r.dataBytesEqual,true); assert.equal(r.right.sourceReference.verification,'UNVERIFIED'); assert.equal(r.right.sourceReference.recordOffset,100);
  const output=serialize(r); assert.ok(!output.includes(marker)); assert.ok(!output.includes(Buffer.from(marker).toString('hex')));
  for(const key of ['recordHex','fileHeaderHex','document','serviceReadings','timestampRaw','dataHex']) assert.ok(!output.includes('"'+key+'"'));
  const frozen=(x:unknown)=>{if(x&&typeof x==='object'){assert.ok(Object.isFrozen(x));Object.values(x).forEach(frozen);}}; frozen(r);
  assert.throws(()=>{(r.rows as any).push({});}); assert.throws(()=>{(r.left.context as any).label='changed';});
  assert.throws(()=>serialize({...r,warnings:['x'.repeat(65536)]}));
});
