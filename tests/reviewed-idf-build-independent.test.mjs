import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReviewed, runCommand, IDF, NIMBLE } from '../tools/build-reviewed-idf.mjs';

// Independent executable fixtures: the real orchestration and process runner run.
// These are explicitly authored local Node scripts, never an SDK or compiler.
async function fixture(behavior = '') {
  const base = await mkdtemp(join(tmpdir(), 'apex-independent-NO-SDK-'));
  const root = join(base, 'repo'), sdk = join(base, 'sdk'), bin = join(base, 'bin');
  const project = 'firmware/esp32s3-reviewed';
  const nimble = join(sdk, 'components/bt/host/nimble/nimble');
  for (const dir of [join(root, project), join(sdk, 'tools'), nimble, bin]) await mkdir(dir, {recursive:true});
  for (const file of ['CMakeLists.txt', 'sdkconfig.defaults']) await writeFile(join(root, project, file), '# SYNTHETIC ONLY\n');
  await writeFile(join(sdk, 'tools/idf.py'), '# Never executed: synthetic argument sentinel only\n');
  const script = `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
const root=${JSON.stringify(root)},sdk=${JSON.stringify(sdk)},nimble=${JSON.stringify(nimble)},base=${JSON.stringify(base)},behavior=${JSON.stringify(behavior)};
const args=process.argv.slice(2),exe=path.basename(process.argv[1]);
if(process.env.APEX_REVIEW_SECRET || process.env.SDKCONFIG || process.env.GIT_DIR || process.env.CMAKE_PROJECT_INCLUDE) process.exit(94);
if(process.env.IDF_PATH!==sdk || process.env.IDF_TARGET!=='esp32s3' || process.env.IDF_COMPONENT_MANAGER!=='0') process.exit(95);
fs.appendFileSync(path.join(base,'calls.jsonl'),JSON.stringify({exe,args})+'\\n');
if(exe==='git') {
 const p=args[1],cmd=args.slice(2);
 if(cmd[0]==='rev-parse' && cmd.includes('HEAD')) console.log(p===root?'a'.repeat(40):p===sdk?(behavior==='wrong-sdk'?'b'.repeat(40):'${IDF}'):'${NIMBLE}');
 else if(cmd[0]==='rev-parse' && cmd.includes('--show-toplevel')) console.log(behavior==='ancestor-root'?base:p);
 else if(cmd[0]==='status') {}
 else if(cmd[0]==='ls-tree') console.log('160000 commit ${NIMBLE}\\tcomponents/bt/host/nimble/nimble');
 else if(cmd[0]==='submodule' && cmd[1]==='status') console.log(' ${NIMBLE} components/bt/host/nimble/nimble');
 else if(cmd[0]==='ls-files') process.stdout.write('${project}/CMakeLists.txt\\0${project}/sdkconfig.defaults\\0');
 else { console.error('Unknown synthetic git command '+JSON.stringify(cmd));process.exit(91); }
} else if(exe==='python3') {
 if(args[0]!==path.join(sdk,'tools/idf.py') || !['reconfigure','build'].includes(args.at(-1))) process.exit(92);
 const config=args.find(x=>x.startsWith('SDKCONFIG=')).slice(10),defaults=args.find(x=>x.startsWith('SDKCONFIG_DEFAULTS=')).slice(19),build=args[args.indexOf('-B')+1];
 const on=fs.readFileSync(defaults,'utf8').includes('CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=y');
 const lines=[on?'CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=y':'# CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN is not set','CONFIG_IDF_TARGET="esp32s3"','CONFIG_BT_ENABLED=y','CONFIG_BT_NIMBLE_ENABLED=y','CONFIG_BT_NIMBLE_USE_ESP_TIMER=y'];
 if(args.at(-1)==='reconfigure') {
   if(behavior==='wrong-config') lines[0]=on?'# CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN is not set':'CONFIG_APEX_REVIEWED_BLE_BENCH_OPT_IN=y';
   if(behavior==='duplicate-config') lines.push(lines[0]);
   fs.writeFileSync(config,lines.join('\\n')+'\\n');
 } else {
   fs.mkdirSync(path.join(build,'config'),{recursive:true});
   for(const n of ['apex_accessory_reviewed.elf','apex_accessory_reviewed.bin','apex_accessory_reviewed.map']) if(!(behavior==='missing' && n.endsWith('.bin'))) fs.writeFileSync(path.join(build,n),behavior==='empty'?'':'SYNTHETIC, NOT FIRMWARE');
   fs.writeFileSync(path.join(build,'config/sdkconfig.h'), lines.filter(x=>!x.startsWith('#')).map(x=>{const [k,v]=x.split('='); return '#define '+k+' '+(v==='y'?'1':v);}).join('\\n')+'\\n');
   if(behavior==='partial') process.exit(7);
   if(behavior==='symlink-artifact'){fs.unlinkSync(path.join(build,'apex_accessory_reviewed.bin'));fs.symlinkSync(config,path.join(build,'apex_accessory_reviewed.bin'));}
   if(behavior==='snapshot-changed') fs.appendFileSync(args[args.indexOf('-C')+1]+'/CMakeLists.txt','changed');
   if(behavior==='mutate-config') fs.appendFileSync(config,'CONFIG_IDF_TARGET="esp32"\\n');
 }
} else process.exit(93);
`;
  for (const exe of ['git', 'python3']) {await writeFile(join(bin,exe), script);await chmod(join(bin,exe),0o700);}
  return {root,sdk,bin,base,output:join(base,'evidence')};
}
async function run(f, mode='default-off') {
 const old=process.env.PATH; process.env.PATH=f.bin;
 try{return await buildReviewed({...f,mode});}finally{process.env.PATH=old;}
}
test('real process orchestration: independent off/on executable fixtures', async()=>{
 for(const mode of ['default-off','explicit-on']){const f=await fixture();const r=await run(f,mode);assert.equal(r.status,'succeeded',JSON.stringify(r));assert.equal(r.imageBindingVerified,false);assert.equal(r.sourceReview,'open; separate gate');}
});
test('real orchestration rejects effective mismatch, missing artifact, partial build and changed final config', async()=>{
 for(const behavior of ['wrong-sdk','ancestor-root','wrong-config','duplicate-config','missing','empty','partial','mutate-config','symlink-artifact','snapshot-changed']){const f=await fixture(behavior);const r=await run(f);assert.equal(r.status,'failed',behavior);assert.equal(JSON.parse(await readFile(join(f.output,'result.json'))).status,'failed');}
});
test('previous outputs and SDK symlink cannot be overwritten', async()=>{
 const f=await fixture();await mkdir(f.output);await writeFile(join(f.output,'keep'),'KEEP');await assert.rejects(run(f));assert.equal(await readFile(join(f.output,'keep'),'utf8'),'KEEP');
 const alias=join(f.base,'sdk-alias');await symlink(f.sdk,alias);await assert.rejects(run({...f,sdk:alias,output:join(f.base,'new')}));
});
test('runner timeout, output overflow and signal cancellation retain failed status', async()=>{
 for(const script of ['setInterval(()=>{},100)', 'process.stdout.write("x".repeat(9*1024*1024));setInterval(()=>{},100)']) {
  const r=await runCommand(process.execPath,['-e',script],{timeoutMs:200});assert.equal(r.status,'failed');assert.equal(r.cleanup,'succeeded');assert.ok(r.stdout.length<=8*1024*1024);
 }
 const pending=runCommand(process.execPath,['-e','setInterval(()=>{},100)'],{timeoutMs:5000});
 setTimeout(()=>process.emit('SIGTERM'),100); const r=await pending;assert.equal(r.status,'failed');assert.equal(r.cleanup,'succeeded');assert.match(r.error,/Interrupt/);
});

test('ambient config/provenance overrides and arbitrary secrets are not inherited or recorded', async()=>{
 const f=await fixture();
 const keys=['APEX_REVIEW_SECRET','SDKCONFIG','GIT_DIR','CMAKE_PROJECT_INCLUDE'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)process.env[k]='SYNTHETIC_SECRET_MARKER_NOT_REAL';
 try{const r=await run(f);assert.equal(r.status,'succeeded',r.error);assert.ok(!JSON.stringify(r).includes('SYNTHETIC_SECRET_MARKER_NOT_REAL'));
 const spawned=r.artifacts.filter(x=>x.path.endsWith('.spawned.json'));assert.ok(spawned.length>0);
 for(const a of spawned){const owner=JSON.parse(await readFile(join(f.output,a.path)));assert.ok(owner.pid>0);assert.equal(owner.pid,owner.processGroup);}
 }finally{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});

test('independent raw-byte limit rejects multibyte output on each stream', async()=>{
 const cap=8*1024*1024;
 for(const stream of ['stdout','stderr']) {
  const r=await runCommand(process.execPath,['-e',`process.${stream}.write('€'.repeat(3*1024*1024))`],{timeoutMs:5000});
  assert.equal(r.status,'failed',`${stream}: retained ${Buffer.byteLength(r[stream])} encoded bytes`);
  assert.match(r.error,/Output limit/);
  assert.ok(Buffer.byteLength(r[stream])<=cap,`${stream} text serialization exceeds byte cap`);
  const capture=r.output[stream]; assert.equal(capture.retainedBytes,cap);assert.ok(capture.observedBytes>cap);assert.equal(capture.truncated,true);
  const raw=Buffer.from(capture.rawBase64,'base64');assert.equal(raw.length,cap);assert.deepEqual(raw,Buffer.from('€'.repeat(3*1024*1024)).subarray(0,cap));
 }
});
test('independent split UTF-8 characters survive subprocess chunk boundaries', async()=>{
 const script=`const b=Buffer.from('A€𐍈Z');let i=0;const t=setInterval(()=>{process.stdout.write(b.subarray(i,i+1));process.stderr.write(b.subarray(i,i+1));if(++i===b.length)clearInterval(t);},50);`;
 const r=await runCommand(process.execPath,['-e',script],{timeoutMs:5000});
 assert.equal(r.status,'succeeded');assert.equal(r.stdout,'A€𐍈Z');assert.equal(r.stderr,'A€𐍈Z');
});
test('independent malformed UTF-8 retains canonical bounded bytes and marks diagnostic truncation', async()=>{
 const cap=8*1024*1024;
 const r=await runCommand(process.execPath,['-e',`process.stdout.write(Buffer.alloc(${cap},255))`],{timeoutMs:5000});
 assert.equal(r.status,'succeeded');assert.equal(r.output.stdout.retainedBytes,cap);assert.equal(r.output.stdout.truncated,false);
 assert.equal(r.output.stdout.textTruncated,true);assert.ok(Buffer.byteLength(r.stdout)<=cap);
 const raw=Buffer.from(r.output.stdout.rawBase64,'base64');assert.equal(raw.length,cap);assert.ok(raw.every(byte=>byte===255));
});
