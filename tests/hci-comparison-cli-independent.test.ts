import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,readdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {doc,report} from './hci-comparison-review-fixture.ts';
const run=(args:string[])=>spawnSync(process.execPath,['--permission','--allow-fs-read=*','tools/compare-hci-reports.ts',...args],{encoding:'utf8',timeout:10000});
const flags=['--left-report','0','--right-report','0'];
function refused(args:string[]){const x=run(args);assert.equal(x.status,1,x.stderr);assert.equal(x.stdout,'');assert.equal(x.stderr,'Offline HCI report comparison refused; no report emitted.\n');}
test('independent actual CLI strict args, symlinks, fatal decoding and atomic errors',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hci-compare-review-'));try{
 const a=join(dir,'left.json'),b=join(dir,'right.json'),text=await doc([report([2,1,6])]);await writeFile(a,text);await writeFile(b,text);
 const before=await readdir(dir),ok=run([a,b,...flags]);assert.equal(ok.status,0,ok.stderr);assert.equal(ok.stderr,'');assert.ok(Buffer.byteLength(ok.stdout)<=65536);assert.equal(JSON.parse(ok.stdout).rows.length,3);
 assert.deepEqual(await readdir(dir),before);assert.equal(await readFile(a,'utf8'),text);assert.equal(await readFile(b,'utf8'),text);
 for(const args of [[],[a,b],[a,b,...flags,'extra'],[a,b,'--left-report','0','--left-report','0'],[a,b,'--left-report','0','--other','0'],[a,b,'--left-report','0'],['-file',b,...flags]])refused(args);
 for(const bad of ['-0','-1','25','01','+0','0.0','1e0','Infinity','', '9007199254740992'])for(const key of [0,2]){const f=[...flags];f[key+1]=bad;refused([a,b,...f]);}
 assert.equal(run([a,b,'--right-report','0','--left-report','0']).stdout,ok.stdout);
 const link=join(dir,'link');await symlink(a,link);refused([link,b,...flags]);refused([b,link,...flags]);refused([dir,b,...flags]);refused([a,join(dir,'missing'),...flags]);
 const ancestor=join(dir,'ancestor');await symlink(dir,ancestor);assert.equal(run([join(ancestor,'left.json'),b,...flags]).stdout,ok.stdout);
 const invalid=[Buffer.from(await doc([report([0]),report([],5)])),Buffer.alloc(0),Buffer.alloc(12289,32),Buffer.from(text+' '.repeat(4097-text.length)),Buffer.concat([Buffer.from([239,187,191]),Buffer.from(text)]),Buffer.from([0xc0,0xaf]),Buffer.from([0xed,0xa0,0x80]),Buffer.from([0xf0,0x9f]),Buffer.from(text+'PRIVATE_SENTINEL'),Buffer.from(text.replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1'))];
 for(const bytes of invalid){await writeFile(a,bytes);refused([a,b,...flags]);refused([b,a,...flags]);}
 await writeFile(a,text+' '.repeat(4096-text.length));assert.equal(run([a,b,...flags]).status,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
