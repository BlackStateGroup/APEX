/** Independent CLI boundary tests with deterministic filesystem race scheduling. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMayhemC8Cli } from '../tools/inspect-mayhem-c8.ts';

const cwd=fileURLToPath(new URL('..',import.meta.url));
const source='sample_rate=32\ncenter_frequency=915000000\nformat=c8 (signed int8 I,Q)\n';
const bytes=new Uint8Array([128,127,255,0]);
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function fixture<T>(f:(dir:string,data:string,sidecar:string)=>Promise<T>):Promise<T>{
  const dir=await fs.mkdtemp(join(cwd,'review-evidence/mayhem-c8-independent/cli-'));
  const data=join(dir,'selected.c8'),sidecar=join(dir,'selected.txt');
  try{await fs.writeFile(data,bytes);await fs.writeFile(sidecar,source);return await f(dir,data,sidecar);}finally{await fs.rm(dir,{recursive:true,force:true});}
}
async function hookOpen<T>(hook:(original:typeof fs.open,...args:Parameters<typeof fs.open>)=>ReturnType<typeof fs.open>,f:()=>Promise<T>):Promise<T>{
  const original=fs.open;
  fs.open=(...args)=>hook(original,...args); syncBuiltinESMExports();
  try{return await f();}finally{fs.open=original;syncBuiltinESMExports();}
}

async function manifest(dir:string){
  return Promise.all((await fs.readdir(dir)).sort().map(async name=>{
    const path=join(dir,name),stat=await fs.lstat(path,{bigint:true});
    return {name,size:String(stat.size),mtime:String(stat.mtimeNs),ctime:String(stat.ctimeNs),mode:Number(stat.mode),sha:stat.isFile()?sha(await fs.readFile(path)):null};
  }));
}

test('review CLI: actual process succeeds with filesystem writes, subprocesses, workers and addons denied',async()=>fixture(async(dir,data,sidecar)=>{
  const before=await manifest(dir);
  const child=spawnSync(process.execPath,['--permission',`--allow-fs-read=${cwd}`,'tools/inspect-mayhem-c8.ts',data,sidecar],{cwd,encoding:'utf8',timeout:10000});
  assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);assert.equal(child.stderr,'');
  const result=JSON.parse(child.stdout);assert.equal(result.kind,'mayhem-c8-import-report');
  assert.equal(result.original.dataSha256,sha(bytes));assert.equal(result.original.sidecarSha256,sha(new TextEncoder().encode(source)));
  assert.equal(result.recording.context.origin,'external-file');assert.equal(result.verification.acquisitionVerified,false);
  assert.deepEqual(await manifest(dir),before);
  // Confirm the harness actually denies a write, not merely that no file appeared.
  const probe=spawnSync(process.execPath,['--permission',`--allow-fs-read=${cwd}`,'--input-type=module','-e',`import fs from 'node:fs'; try {fs.writeFileSync(${JSON.stringify(join(dir,'forbidden'))},'x');process.exitCode=9;} catch(e) {if(e.code!=='ERR_ACCESS_DENIED') throw e;}`],{cwd,encoding:'utf8',timeout:10000});
  assert.equal(probe.status,0,probe.stderr);assert.deepEqual(await manifest(dir),before);
}));

test('review CLI: rejects symlinks, directories and FIFOs in either selected role without hanging',async()=>fixture(async(dir,data,sidecar)=>{
  const link=join(dir,'link'),fifo=join(dir,'fifo');await fs.symlink(data,link);
  const created=spawnSync('mkfifo',[fifo],{encoding:'utf8',timeout:1000});assert.equal(created.status,0,created.stderr);
  for(const target of [link,dir,fifo]) for(const args of [[target,sidecar],[data,target]]) {
    const child=spawnSync(process.execPath,['tools/inspect-mayhem-c8.ts',...args],{cwd,encoding:'utf8',timeout:3000});
    assert.equal(child.error,undefined);assert.equal(child.status,1,child.stderr);assert.equal(child.stdout,'');assert.match(child.stderr,/bounded.*regular file/);
  }
}));

test('review CLI: same-byte inode replacement between lstat and open is detected for either input',async()=>fixture(async(dir,data,sidecar)=>{
  for(const target of [data,sidecar]){
    const saved=await fs.readFile(target);let injected=false;
    await hookOpen(async(original,path,flags,mode)=>{
      assert.equal(Number(flags)&constants.O_WRONLY,0);assert.equal(Number(flags)&constants.O_RDWR,0);
      assert.ok(Number(flags)&constants.O_NOFOLLOW);assert.ok(Number(flags)&constants.O_NONBLOCK);
      if(path===target&&!injected){injected=true;await fs.rename(target,join(dir,'old'));await fs.writeFile(target,saved);}
      return original(path,flags,mode);
    },async()=>assert.rejects(inspectMayhemC8Cli([data,sidecar]),/changed before open/));
    assert.equal(injected,true);await fs.rm(join(dir,'old'));
  }
}));

test('review CLI: regular-to-FIFO path swap between lstat and open rejects with nonblocking open',async()=>fixture(async(dir,data,sidecar)=>{
  const fifo=join(dir,'prepared-fifo');assert.equal(spawnSync('mkfifo',[fifo]).status,0);let injected=false;
  await hookOpen(async(original,path,flags,mode)=>{
    if(path===data&&!injected){injected=true;await fs.rename(data,join(dir,'old'));await fs.rename(fifo,data);}
    return original(path,flags,mode);
  },async()=>assert.rejects(inspectMayhemC8Cli([data,sidecar]),/changed before open/));
  assert.equal(injected,true);
}));

test('review CLI: growth, truncation, same-size mutation and pathname replacement during read reject',async()=>fixture(async(dir,data,sidecar)=>{
  for(const target of [data,sidecar]) for(const mode of ['grow','shrink','replace-content','replace-path']){
    await fs.writeFile(data,bytes);await fs.writeFile(sidecar,source);let injected=false,closed=false;
    await hookOpen(async(original,path,flags,fileMode)=>{
      const handle=await original(path,flags,fileMode);
      if(path===target){
        const read=handle.read.bind(handle),close=handle.close.bind(handle);
        handle.close=async()=>{closed=true;return close();};
        handle.read=(async(...args:unknown[])=>{
          if(!injected){
            injected=true;
            if(mode==='grow')await fs.appendFile(target,new Uint8Array([0,0]));
            else if(mode==='shrink')await fs.truncate(target,1);
            else if(mode==='replace-content'){const changed=await fs.readFile(target);changed[0]=changed[0]!^1;await fs.writeFile(target,changed);}
            else {const saved=await fs.readFile(target);await fs.rename(target,join(dir,'old'));await fs.writeFile(target,saved);}
          }
          return Reflect.apply(read,handle,args);
        }) as typeof handle.read;
      }
      return handle;
    },async()=>assert.rejects(inspectMayhemC8Cli([data,sidecar]),/changed during read|byte limit/));
    assert.equal(injected,true);assert.equal(closed,true);await fs.rm(join(dir,'old'),{force:true});
  }
}));

test('review CLI: data and sidecar are individually stable, not claimed to be an atomic capture pair',async()=>fixture(async(_dir,data,sidecar)=>{
  let injected=false;
  const result=JSON.parse(await hookOpen(async(original,path,flags,mode)=>{
    if(path===sidecar&&!injected){injected=true;await fs.writeFile(data,new Uint8Array([0,0,0,0]));}
    return original(path,flags,mode);
  },()=>inspectMayhemC8Cli([data,sidecar])));
  assert.equal(injected,true);assert.equal(result.original.dataSha256,sha(bytes));
  assert.notEqual(result.original.dataSha256,sha(await fs.readFile(data)));
  assert.equal(result.verification.authenticityVerified,false);assert.equal(result.verification.acquisitionVerified,false);
}));

test('review CLI: literal explicit paths can be extensionless and terminal-like characters stay JSON escaped',async()=>fixture(async(dir,data,sidecar)=>{
  const untrusted=join(dir,'literal\n--output=file'),second=join(dir,'no-extension');
  await fs.rename(data,untrusted);await fs.rename(sidecar,second);
  const before=await manifest(dir),r=JSON.parse(await inspectMayhemC8Cli([resolve(untrusted),resolve(second)]));
  assert.equal(r.original.dataSha256,sha(bytes));assert.deepEqual(await manifest(dir),before);
  for(const args of [[untrusted,second,'--output',join(dir,'output')],['--scan',second],[untrusted,'--help']])await assert.rejects(inspectMayhemC8Cli(args),/Usage/);
  assert.deepEqual(await manifest(dir),before);
}));
