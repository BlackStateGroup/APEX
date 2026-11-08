import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,readdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {document,report} from './hci-comparison-fixture.ts';
const tool='tools/compare-hci-reports.ts';
function run(args:string[]) {return spawnSync(process.execPath,['--permission','--allow-fs-read=*',tool,...args],{encoding:'utf8',timeout:10000});}
function success(args:string[]) {const r=run(args);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');return r.stdout;}
function refused(args:string[]) {const r=run(args);assert.equal(r.status,1,r.stderr);assert.equal(r.stdout,'');assert.equal(r.stderr,'Offline HCI report comparison refused; no report emitted.\n');}
async function fixture(fn:(dir:string,l:string,r:string,args:string[],text:string)=>Promise<void>) {
  const dir=await mkdtemp(join(tmpdir(),'hci-comparison-'));try {
    const l=join(dir,'PRIVATE_LEFT.json'),r=join(dir,'PRIVATE_RIGHT.json'),text=await document();
    await writeFile(l,text);await writeFile(r,text);await fn(dir,l,r,[l,r,'--left-report','0','--right-report','0'],text);
  } finally {await rm(dir,{recursive:true,force:true});}
}
test('actual CLI produces complete bounded result with filesystem writes prohibited',async()=>fixture(async(dir,l,r,args,text)=>{
  const before=await readdir(dir); const out=success(args),result=JSON.parse(out);
  assert.equal(result.analysis,'offline-hci-selected-report-byte-comparison');assert.equal(result.dataBytesEqual,true);
  assert.equal(result.rows.length,3);assert.ok(Buffer.byteLength(out)<=65536);assert.equal(out.endsWith('\n'),true);
  assert.equal(success([l,r,'--right-report','0','--left-report','0']),out);
  assert.deepEqual(await readdir(dir),before);assert.equal(await readFile(l,'utf8'),text);assert.equal(await readFile(r,'utf8'),text);
}));
test('strict CLI explicit indices and paths, no defaults/duplicates/unknown flags',async()=>fixture(async(_dir,l,r,args)=>{
  for(const bad of [[],[l],[l,r],[l,r,'--left-report','0'],[...args,'extra'],[l,r,'--left-report','0','--left-report','0'],[l,r,'--right-report','0','--right-report','0'],[l,r,'--record','0','--right-report','0'],['-x',...args.slice(1)]]) refused(bad);
  for(const index of ['-0','-1','01','+0','0.0','1e0','25','9007199254740992','','1']) {
    refused([l,r,'--left-report',index,'--right-report','0']);refused([l,r,'--left-report','0','--right-report',index]);
  }
}));
test('both inputs refuse malformed UTF8/BOM/byte and character bounds/digest/late framing atomically',async()=>fixture(async(_dir,l,r,args,text)=>{
  const wrong=JSON.parse(text);wrong.derivative.sha256='0'.repeat(64);
  const late=await document([report(),report('',5)]);
  const bad=[Buffer.alloc(0),Buffer.alloc(12289,32),Buffer.alloc(12288,32),Buffer.from(' '.repeat(4097)),Buffer.from('\ufeff'+text),Buffer.concat([Buffer.from(text),Buffer.from([0xc0,0xaf])]),Buffer.from([0xed,0xa0,0x80]),Buffer.from([0xf0,0x9f]),Buffer.from(text+'PRIVATE_MARKER'),Buffer.from(JSON.stringify(wrong)),Buffer.from(late)];
  for(const path of [l,r]) {for(const bytes of bad){await writeFile(path,bytes);refused(args);}await writeFile(path,text);}
  const unicode=JSON.parse(text);unicode.context.label='漢'.repeat(256);await writeFile(l,JSON.stringify(unicode));success(args);
  await writeFile(l,' '.repeat(4096-text.length)+text);success(args);
}));
test('bounded regular reader rejects terminal symlinks/directories/missing targets, ancestor links unchanged',async()=>fixture(async(dir,l,r,args)=>{
  const link=join(dir,'link');await symlink(l,link);
  for(const bad of [link,dir,join(dir,'missing')]) {refused([bad,...args.slice(1)]);refused([l,bad,...args.slice(2)]);}
  const ancestor=join(dir,'ancestor');await symlink(dir,ancestor);
  assert.equal(success([join(ancestor,'PRIVATE_LEFT.json'),r,...args.slice(2)]),success(args));
}));
test('CLI nonfirst selection excludes unselected report marker and changed data remains positional',async()=>fixture(async(_dir,l,r,args)=>{
  const marker=Buffer.from('PRIVATE_UNSELECTED').toString('hex');
  await writeFile(l,await document([report(marker),report('020106')]));await writeFile(r,await document([report('02010500')]));
  const out=success([l,r,'--left-report','1','--right-report','0']);const parsed=JSON.parse(out);
  assert.deepEqual(parsed.differingOffsets,[2,3]);assert.ok(!out.includes(marker));assert.ok(!out.includes('PRIVATE_UNSELECTED'));
  assert.equal(parsed.rows[3].leftHex,null);assert.equal(parsed.rows[3].rightHex,'00');
}));
