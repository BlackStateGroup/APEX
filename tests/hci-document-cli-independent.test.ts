/** Independent, subprocess-based CLI review. All inputs are synthetic. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, statSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHciLegacyEventDocument, prepareHci} from '../packages/core/hci-offline.ts';
import {capture, context, hash, header, chosen, chosenOffset, record} from './hci-selected-review-fixture.ts';
const base=['--provenance','synthetic-fixture','--label','independent CLI'];
function run(tool:string,args:string[]) {
  // Node write/child-process denial is a scoped test guard, not OS network isolation.
  return spawnSync(process.execPath,['--permission','--allow-fs-read=*',`tools/${tool}.ts`,...args],{encoding:'utf8',timeout:10000});
}
function refused(r:ReturnType<typeof run>,message:string) {
  assert.equal(r.status,1,JSON.stringify(r)); assert.equal(r.stdout,''); assert.equal(r.stderr,message+'\n');
}
const prepareError='Offline HCI inspection refused; no report emitted.';
const selectedError='Offline HCI selected-document inspection refused; no report emitted.';
test('prepare option: exact selected binary, original coordinates, default compatibility and atomic refusals',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hci-cli-review-'));const path=join(dir,'PRIVATE_SOURCE.snoop');
 try {
  writeFileSync(path,capture);const before=statSync(path);const prepare=run('inspect-hci',[path,...base,'--prepare-legacy-document','2']);
  assert.equal(prepare.status,0,prepare.stderr);const d=JSON.parse(prepare.stdout);
  assert.equal(d.derivative.recordHex,record(chosen).toString('hex'));assert.equal(d.sourceReference.recordOffset,chosenOffset);assert.equal(d.sourceReference.recordIndex,2);
  assert.equal(d.derivative.fileHeaderHex,header.toString('hex'));
  for(const marker of ['COMMAND_SENTINEL','ACL_SENTINEL','KEY_EVENT_SENTINEL']) {assert.ok(!prepare.stdout.includes(marker));assert.ok(!prepare.stdout.includes(Buffer.from(marker).toString('hex')));}
  const metadata=run('inspect-hci',[path,...base]);assert.equal(metadata.status,0,metadata.stderr);assert.ok(!metadata.stdout.includes('recordHex'));assert.ok(!metadata.stdout.includes('dataHex'));assert.ok(!metadata.stdout.includes('addressDisplay'));
  for(const v of ['-1','-0','+2','02','2.0','2e0',' 2','9007199254740992','5','0','1','3','4']) refused(run('inspect-hci',[path,...base,'--prepare-legacy-document',v]),prepareError);
  for(const other of ['--record','--extended-record','--start','--prepare-legacy-document']) refused(run('inspect-hci',[path,...base,'--prepare-legacy-document','2',other,'2']),prepareError);
  refused(run('inspect-hci',[path,...base,'--prepare-legacy-document']),prepareError);
  assert.deepEqual(readFileSync(path),capture);assert.equal(statSync(path).mtimeMs,before.mtimeMs);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('reopen: fatal UTF8, BOM, strict arguments, bounded regular input and no mutation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hci-reopen-review-'));const path=join(dir,'PRIVATE_DOCUMENT.json');
 const text=await createHciLegacyEventDocument(await prepareHci(capture,context,hash),2,hash);
 try {
  const valid=Buffer.from(text);writeFileSync(path,valid);const before=statSync(path);
  const ok=run('inspect-hci-selected',[path]);assert.equal(ok.status,0,ok.stderr);
  assert.match(ok.stdout,/UNVERIFIED/);assert.match(ok.stdout,/verified-binary-sha256-and-legacy-structure/);
  assert.deepEqual(readFileSync(path),valid);assert.equal(statSync(path).mtimeMs,before.mtimeMs);
  for(const args of [[],[path,'extra'],[path,'--record','0'],['--help'],[path,path]]) refused(run('inspect-hci-selected',args),selectedError);
  const bad=[Buffer.alloc(0),Buffer.alloc(4097,32),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),valid]),Buffer.concat([valid,Buffer.from([0xc0,0xaf])]),Buffer.from(text.replace('independent selected review','\ufffd'))];
  // U+FFFD is valid JSON and valid UTF8: replace its UTF8 bytes with malformed lead bytes.
  bad[4]=Buffer.from(text.replace('independent selected review','X'));const at=bad[4]!.indexOf(Buffer.from('"X"'));bad[4]![at+1]=0xff;
  for(const bytes of bad) {writeFileSync(path,bytes);refused(run('inspect-hci-selected',[path]),selectedError);assert.deepEqual(readFileSync(path),bytes);}
  writeFileSync(path,valid);symlinkSync(path,join(dir,'link'));for(const p of [dir,join(dir,'missing'),join(dir,'link')]) refused(run('inspect-hci-selected',[p]),selectedError);
  const padded=Buffer.concat([valid,Buffer.alloc(4096-valid.length,32)]);writeFileSync(path,padded);assert.equal(run('inspect-hci-selected',[path]).status,0);
  const multibyte=JSON.parse(text);multibyte.context.label='😀'.repeat(100);const unicode=Buffer.from(JSON.stringify(multibyte));const unicodeText=unicode.toString();writeFileSync(path,unicodeText+' '.repeat(4096-unicodeText.length));assert.equal(run('inspect-hci-selected',[path]).status,0);writeFileSync(path,unicodeText+' '.repeat(4097-unicodeText.length));refused(run('inspect-hci-selected',[path]),selectedError);writeFileSync(path,Buffer.alloc(12289,32));refused(run('inspect-hci-selected',[path]),selectedError);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('reopen reports forged original references only as unverified; binary tampering and late bad reports remain atomic',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hci-references-review-'));const path=join(dir,'document.json');
 const text=await createHciLegacyEventDocument(await prepareHci(capture,context,hash),2,hash);
 try {
  const value=JSON.parse(text);value.sourceReference={sha256:'f'.repeat(64),byteCount:1000,recordIndex:5,recordOffset:800};
  writeFileSync(path,JSON.stringify(value));const result=run('inspect-hci-selected',[path]);assert.equal(result.status,0,result.stderr);
  const reopened=JSON.parse(result.stdout);assert.equal(reopened.verification.originalSourceReference,'UNVERIFIED');
  assert.deepEqual(reopened.value.sourceReference,value.sourceReference);assert.equal(reopened.selection.record.index,0);assert.equal(reopened.selection.record.offset,16);
  const exact=Buffer.concat([header,record(chosen)]);assert.equal(reopened.selection.source.sha256,await hash(exact));assert.equal(reopened.selection.source.byteCount,exact.length);
  assert.equal(reopened.selection.reports.length,3);
  for(const report of reopened.selection.reports) assert.equal(exact.subarray(report.dataOffset,report.dataOffset+report.dataLength).toString('hex'),report.dataHex);
  // Modified AD with stale digest must fail, not return a partial interpretation.
  const stale=structuredClone(value);const staleBytes=Buffer.from(stale.derivative.recordHex,'hex');staleBytes[staleBytes.length-2]!^=1;stale.derivative.recordHex=staleBytes.toString('hex');writeFileSync(path,JSON.stringify(stale));refused(run('inspect-hci-selected',[path]),selectedError);
  // Recomputing the digest does not bless unsupported late report semantics.
  const late=structuredClone(value);const bad=Buffer.from(late.derivative.recordHex,'hex');bad[bad.length-1]=21;late.derivative.recordHex=bad.toString('hex');late.derivative.sha256=await hash(Buffer.concat([header,bad]));writeFileSync(path,JSON.stringify(late));refused(run('inspect-hci-selected',[path]),selectedError);
  // Duplicate escaped member name must fail even if equivalent.
  writeFileSync(path,text.replace('"schemaVersion":1','"schemaVersion":1,"schema\\u0056ersion":1'));refused(run('inspect-hci-selected',[path]),selectedError);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
