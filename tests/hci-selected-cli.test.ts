import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, writeFile, readFile, readdir, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {capture, header, record, event, report, chosen, chosenOffset, context, hash} from './hci-selected-review-fixture.ts';
import {prepareHci, listHciRecords, selectHciLegacyEvent, selectHciExtendedMetadata, serializeHciReport} from '../packages/core/hci-offline.ts';
const prepareTool = 'tools/inspect-hci.ts', reopenTool = 'tools/inspect-hci-selected.ts';
function run(tool: string, args: string[]) {
  return spawnSync(process.execPath, ['--permission','--allow-fs-read=*',tool,...args], {encoding:'utf8',timeout:10000});
}
function success(tool: string, args: string[]) {
  const result = run(tool,args); assert.equal(result.status,0,result.stderr); assert.equal(result.stderr,''); return result.stdout;
}
function refused(tool: string, args: string[]) {
  const result = run(tool,args); assert.equal(result.status,1, result.stderr); assert.equal(result.stdout,'');
  assert.equal(result.stderr,tool === prepareTool ? 'Offline HCI inspection refused; no report emitted.\n' : 'Offline HCI selected-document inspection refused; no report emitted.\n');
}
async function fixture(fn: (dir: string, source: string, args: string[], doc: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(),'apex-selected-cli-'));
  try {
    const source=join(dir,'PRIVATE_SOURCE.snoop'); await writeFile(source,capture);
    const args=[source,'--provenance',context.provenance,'--label',context.label];
    const doc=success(prepareTool,[...args,'--prepare-legacy-document','2']);
    await fn(dir,source,args,doc);
  } finally { await rm(dir,{recursive:true,force:true}); }
}
test('explicit preparation/reopen uses binary digest, excludes unrelated records and performs no file writes', async()=>fixture(async(dir,source,args,doc)=>{
  const parsed=JSON.parse(doc), expected=Buffer.concat([header,record(chosen)]);
  assert.equal(parsed.derivative.fileHeaderHex+parsed.derivative.recordHex,expected.toString('hex'));
  assert.equal(parsed.derivative.sha256,await hash(expected)); assert.equal(parsed.sourceReference.sha256,await hash(capture));
  assert.equal(parsed.sourceReference.recordIndex,2); assert.equal(parsed.sourceReference.recordOffset,chosenOffset);
  for(const marker of ['COMMAND_SENTINEL','ACL_SENTINEL','KEY_EVENT_SENTINEL']) {
    assert.ok(!doc.includes(marker)); assert.ok(!doc.includes(Buffer.from(marker).toString('hex')));
  }
  const path=join(dir,'selected.json'); await writeFile(path,doc); const before=await readdir(dir);
  const out=success(reopenTool,[path]), result=JSON.parse(out);
  assert.equal(result.document,doc); assert.equal(result.selection.reports.length,3);
  assert.equal(result.selection.record.index,0); assert.equal(result.selection.record.offset,16);
  assert.equal(result.selection.source.sha256,await hash(expected));
  assert.deepEqual(result.verification,{derivative:'verified-binary-sha256-and-legacy-structure',originalSourceReference:'UNVERIFIED',provenance:'operator-declaration'});
  assert.match(result.warnings.join(' '),/whole selected event may contain several advertisers/);
  assert.match(result.warnings.join(' '),/Original source hash, size, index and offset are UNVERIFIED/);
  assert.match(result.warnings.join(' '),/Operator provenance is a declaration/);
  assert.deepEqual(await readdir(dir),before); assert.equal(await readFile(path,'utf8'),doc); assert.deepEqual(await readFile(source),capture);
  assert.equal(success(prepareTool,[...args,'--prepare-legacy-document','2']),doc);
}));
test('old metadata, page, legacy and extended subprocess outputs remain byte-for-byte compatible',async()=>fixture(async(_dir,_source,args)=>{
  const p=await prepareHci(capture,context,hash);
  for(const [extra,result] of [ [[],listHciRecords(p)], [['--start','2'],listHciRecords(p,2)], [['--record','2'],selectHciLegacyEvent(p,2)], [['--extended-record','4'],selectHciExtendedMetadata(p,4)] ] as const) {
    const output=success(prepareTool,[...args,...extra]); assert.equal(output,serializeHciReport(result)+'\n');
    assert.ok(!output.includes('recordHex')); assert.ok(!output.includes('APEX-HCI-selected-legacy-event'));
  }
}));
test('preparation rejects conflicts, bad indices, duplicate flags, extra args, wrong record types and missing context',async()=>fixture(async(_dir,source,args)=>{
  for(const flag of ['--start','--record','--extended-record','--prepare-legacy-document'])
    refused(prepareTool,[...args,'--prepare-legacy-document','2',flag,'2']);
  for(const index of ['-1','01','1.5','1e0','+2','9007199254740992','5','0','1','3','4','']) refused(prepareTool,[...args,'--prepare-legacy-document',index]);
  for(const extra of [['--prepare-legacy-document'],['--unknown','2'],['extra'],['--label','duplicate']]) refused(prepareTool,[...args,...extra]);
  refused(prepareTool,[source,'--prepare-legacy-document','2']);
}));
test('reopen rejects strict argument errors and unsafe filesystem targets; ancestor links are allowed',async()=>fixture(async(dir,source,args,doc)=>{
  const path=join(dir,'selected.json'); await writeFile(path,doc);
  for(const extra of [[],[path,'extra'],[path,'--record','0'],['--help'],[''],['-x']]) refused(reopenTool,extra);
  for(const path of [dir,join(dir,'missing')]) refused(reopenTool,[path]);
  const link=join(dir,'link'); await symlink(path,link); refused(reopenTool,[link]);
  const sourceLink=join(dir,'source-link'); await symlink(source,sourceLink); refused(prepareTool,[sourceLink,...args.slice(1),'--prepare-legacy-document','2']);
  const ancestor=join(dir,'ancestor'); await symlink(dir,ancestor);
  assert.equal(success(reopenTool,[join(ancestor,'selected.json')]),success(reopenTool,[path]));
}));
test('reopen rejects malformed UTF8, preserved BOM, byte and decoded limits, strict JSON and digest corruption atomically',async()=>fixture(async(dir,_source,_args,doc)=>{
  const path=join(dir,'PRIVATE_DOCUMENT.json');
  const digest=JSON.parse(doc); digest.derivative.sha256='0'.repeat(64);
  const extra=JSON.parse(doc); extra.unexpected='PRIVATE_MARKER';
  for(const data of [Buffer.alloc(0),Buffer.alloc(12289,32),Buffer.from(' '.repeat(4097)),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(doc)]),Buffer.concat([Buffer.from(doc),Buffer.from([0xc0,0xaf])]),Buffer.from([0xed,0xa0,0x80]),Buffer.from([0xf0,0x9f]),Buffer.from(doc+'PRIVATE_MARKER'),Buffer.from(JSON.stringify(digest)),Buffer.from(JSON.stringify(extra)),Buffer.from(doc.replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1'))]) {
    await writeFile(path,data); refused(reopenTool,[path]);
  }
  const unicode=JSON.parse(doc); unicode.context.label='漢'.repeat(256); await writeFile(path,JSON.stringify(unicode)); success(reopenTool,[path]);
}));
test('late source framing and event failures never publish prepared or reopened partial output',async()=>fixture(async(dir,source,args,doc)=>{
  await writeFile(source,Buffer.concat([capture,Buffer.from([0])])); refused(prepareTool,[...args,'--prepare-legacy-document','2']);
  const badEvent=event([report('020106'),report('',5)]), badRecord=record(badEvent);
  await writeFile(source,Buffer.concat([header,badRecord])); refused(prepareTool,[...args,'--prepare-legacy-document','0']);
  const value=JSON.parse(doc), binary=Buffer.concat([header,badRecord]);
  value.derivative={fileHeaderHex:header.toString('hex'),recordHex:badRecord.toString('hex'),byteCount:binary.length,sha256:createHash('sha256').update(binary).digest('hex')};
  value.sourceReference={sha256:'a'.repeat(64),byteCount:binary.length,recordIndex:0,recordOffset:16};
  const path=join(dir,'late.json'); await writeFile(path,JSON.stringify(value)); refused(reopenTool,[path]);
}));
test('plausible original claims can change without derivative failure and remain explicitly unverified',async()=>fixture(async(dir,_source,_args,doc)=>{
  const value=JSON.parse(doc); value.sourceReference={sha256:'f'.repeat(64),byteCount:2000,recordIndex:3,recordOffset:100};
  value.context={provenance:'recorded-import',label:'operator claim only'};
  const path=join(dir,'claims.json'); await writeFile(path,JSON.stringify(value)); const out=JSON.parse(success(reopenTool,[path]));
  assert.equal(out.verification.originalSourceReference,'UNVERIFIED'); assert.equal(out.verification.provenance,'operator-declaration');
  assert.equal(out.selection.record.offset,16); assert.equal(out.value.sourceReference.recordOffset,100);
}));
