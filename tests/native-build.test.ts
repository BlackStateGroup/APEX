import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, lstat, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const wrapper = new URL('../tools/native-build.mjs', import.meta.url);
async function exists(path: string) { try { await lstat(path); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } }
async function fixture(t: TestContext, script = '') {
  const base = await mkdtemp(join(tmpdir(), 'apex-native-test-'));
  const root = join(base, 'app'), source = join(root, 'research/upstream-sources'), lock = join(base, '.app-native-build.lock');
  await mkdir(join(root, 'tools'), { recursive: true });
  await mkdir(join(root, 'node_modules/expo/bin'), { recursive: true });
  await mkdir(source, { recursive: true });
  await writeFile(join(source, 'sentinel'), 'original\0bytes');
  await copyFile(wrapper, join(root, 'tools/native-build.mjs'));
  await copyFile(new URL('../tools/native-process-group.mjs', import.meta.url), join(root, 'tools/native-process-group.mjs'));
  await writeFile(join(root, 'node_modules/expo/bin/cli'), script);
  // All cleanup is confined to test-owned synthetic data, never a real corpus.
  t.after(() => rm(base, { recursive: true, force: true }));
  function run(args = ['ios', '--prebuild-only']) {
    const p = spawn(process.execPath, [join(root, 'tools/native-build.mjs'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; p.stdout.on('data', d => output += d); p.stderr.on('data', d => output += d);
    const done = new Promise<{code: number | null; signal: string | null; output: string}>(resolve => p.on('close', (code, signal) => resolve({ code, signal, output })));
    t.after(() => { if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL'); });
    return { p, done };
  }
  return { root, source, lock, run };
}
async function waitFor(path: string) { for (let i = 0; i < 200; i++) { if (await exists(path)) return; await new Promise(r => setTimeout(r, 20)); } throw new Error(`Timed out: ${path}`); }
async function original(f: { source: string }) { assert.equal(await readFile(join(f.source, 'sentinel'), 'utf8'), 'original\0bytes'); }
test('prebuild hides corpus, restores exact bytes, and prebuild-only skips run', async t => {
  const f = await fixture(t, `const fs=require('fs'); if(fs.existsSync('research/upstream-sources'))process.exit(42);fs.appendFileSync('calls',process.argv.slice(2).join(' ')+'\\n');`);
  assert.equal((await f.run().done).code, 0); await original(f);
  assert.equal(await readFile(join(f.root, 'calls'), 'utf8'), 'prebuild --platform ios --no-install\n'); assert.equal(await exists(f.lock), false);
});
test('normal native run sees restored corpus', async t => {
  const f = await fixture(t, `const fs=require('fs');if(process.argv[2]==='run:android'&&!fs.existsSync('research/upstream-sources/sentinel'))process.exit(42);fs.appendFileSync('calls',process.argv[2]+'\\n');`);
  assert.equal((await f.run(['android']).done).code, 0); await original(f); assert.equal(await readFile(join(f.root, 'calls'), 'utf8'), 'prebuild\nrun:android\n');
});
test('prebuild failure restores corpus and skips run', async t => { const f = await fixture(t, 'process.exit(23)');const r=await f.run(['ios']).done;assert.equal(r.code,1);assert.match(r.output,/Expo exited 23/);await original(f);assert.equal(await exists(f.lock),false); });
test('missing CLI failure restores corpus', async t => { const f=await fixture(t);await rm(join(f.root,'node_modules/expo/bin/cli'));assert.equal((await f.run().done).code,1);await original(f); });
test('missing optional corpus still builds', async t => {const f=await fixture(t);await rm(f.source,{recursive:true});assert.equal((await f.run().done).code,0);assert.equal(await exists(f.lock),false);});
test('existing restore destination and original failure both survive', async t => {
  const f=await fixture(t, `require('fs').mkdirSync('research/upstream-sources');process.exit(23)`);const r=await f.run().done;
  assert.equal(r.code,1);assert.match(r.output,/Expo exited 23/);assert.match(r.output,/Restore destination already exists/);assert.match(r.output,/Sources preserved at/);
  assert.deepEqual(await readdir(f.source),[]);assert.equal(await readFile(join(f.lock,'upstream-sources/sentinel'),'utf8'),'original\0bytes');
  assert.equal((await f.run().done).code,1);
});
test('concurrent wrapper refuses before invoking CLI', async t => {
  const f=await fixture(t, `require('fs').appendFileSync('calls','call\\n');require('fs').writeFileSync('ready','');setTimeout(()=>{},1000)`);
  const first=f.run();await waitFor(join(f.root,'ready'));const second=await f.run().done;assert.equal(second.code,1);assert.match(second.output,/Cannot acquire native-build lock/);
  assert.equal((await first.done).code,0);await original(f);assert.equal(await readFile(join(f.root,'calls'),'utf8'),'call\n');
});
for(const signal of ['SIGTERM','SIGINT','SIGHUP'] as const) test(`${signal} restores before exit`, {skip:process.platform==='win32'}, async t => {
  const f=await fixture(t, `require('fs').writeFileSync('ready','');setTimeout(()=>{},10000)`);const child=f.run();await waitFor(join(f.root,'ready'));child.p.kill(signal);const r=await child.done;assert.equal(r.code,{SIGTERM:143,SIGINT:130,SIGHUP:129}[signal]);await original(f);assert.equal(await exists(f.lock),false);
});
test('invalid platform cannot move sources', async t=> {const f=await fixture(t);assert.equal((await f.run(['linux']).done).code,1);await original(f);assert.equal(await exists(f.lock),false);});
test('stale lock is never automatically removed', async t=>{const f=await fixture(t);await mkdir(f.lock);await writeFile(join(f.lock,'unknown'),'keep');assert.equal((await f.run().done).code,1);await original(f);assert.equal(await readFile(join(f.lock,'unknown'),'utf8'),'keep');});
test('signal-ignoring child is killed after bounded grace period', {skip:process.platform==='win32', timeout:10000}, async t => {
  const f=await fixture(t, `process.on('SIGTERM',()=>{});require('fs').writeFileSync('ready','');setTimeout(()=>{},20000)`);const child=f.run();await waitFor(join(f.root,'ready'));child.p.kill('SIGTERM');assert.equal((await child.done).code,143);await original(f);assert.equal(await exists(f.lock),false);
});
test('SIGKILL leaves a recoverable corpus and blocks another build', {skip:process.platform==='win32'}, async t => {
  const f=await fixture(t, `require('fs').writeFileSync('ready','');setTimeout(()=>{},300)`);const child=f.run();await waitFor(join(f.root,'ready'));child.p.kill('SIGKILL');await child.done;
  assert.equal(await readFile(join(f.lock,'upstream-sources/sentinel'),'utf8'),'original\0bytes');assert.equal(await exists(join(f.lock,'owner.json')),true);const retry=await f.run().done;assert.equal(retry.code,1);assert.match(retry.output,/interrupted build/);
});
for (const exitCode of [0, 23]) test(`leader exit ${exitCode} cannot restore ahead of a live descendant`, {skip:process.platform==='win32',timeout:12000}, async t => {
  const writer = `const fs=require('fs');fs.writeFileSync('descendant-ready','');setTimeout(()=>{try{fs.writeFileSync('research/upstream-sources/sentinel','CORRUPTED');fs.writeFileSync('writer-result','wrote')}catch(e){fs.writeFileSync('writer-result',e.code)}},500);setTimeout(()=>{},10000);`;
  const f=await fixture(t, `const fs=require('fs');const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(writer)}],{stdio:'ignore'});c.unref();const timer=setInterval(()=>{if(fs.existsSync('descendant-ready'))process.exit(${exitCode})},5);`);
  const child=f.run();await waitFor(join(f.root,'descendant-ready'));
  const owner=JSON.parse(await readFile(join(f.lock,'owner.json'),'utf8'));
  t.after(()=>{try{process.kill(-owner.processGroup,'SIGKILL');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}});
  assert.equal((await lstat(f.lock)).mode & 0o777,0o700);
  const r=await child.done;assert.equal(r.code,1);assert.match(r.output,/still exists/);
  if(exitCode)assert.match(r.output,/Expo exited 23/);
  assert.equal(await exists(f.source),false);assert.equal(await readFile(join(f.lock,'upstream-sources/sentinel'),'utf8'),'original\0bytes');
  assert.equal(await readFile(join(f.root,'writer-result'),'utf8'),'ENOENT');assert.equal(await exists(join(f.lock,'owner.json')),true);
});
test('interruption after leader exit retains protection until its descendant is gone', {skip:process.platform==='win32',timeout:12000}, async t => {
  const writer=`process.on('SIGTERM',()=>{});require('fs').writeFileSync('descendant-ready','');setTimeout(()=>{},15000);`;
  const f=await fixture(t, `const fs=require('fs');const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(writer)}],{stdio:'ignore'});c.unref();setInterval(()=>{if(fs.existsSync('descendant-ready')){fs.writeFileSync('leader-exiting','');process.exit(0)}},5);`);
  const child=f.run();await waitFor(join(f.root,'leader-exiting'));await new Promise(r=>setTimeout(r,100));
  const owner=JSON.parse(await readFile(join(f.lock,'owner.json'),'utf8'));
  t.after(()=>{try{process.kill(-owner.processGroup,'SIGKILL');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}});
  child.p.kill('SIGTERM');await new Promise(r=>setTimeout(r,100));assert.equal(await exists(f.source),false);
  const r=await child.done;assert.equal(r.code,143);
  if(await exists(f.lock)){assert.match(r.output,/still exists/);assert.equal(await readFile(join(f.lock,'upstream-sources/sentinel'),'utf8'),'original\0bytes');}
  else {await original(f);assert.throws(()=>process.kill(-owner.processGroup,0),{code:'ESRCH'});}
});
test('unexpected lock contents preserve ownership and are never deleted',async t=>{
  const f=await fixture(t, `require('fs').writeFileSync('../.app-native-build.lock/unexpected','keep')`);
  const r=await f.run().done;assert.equal(r.code,1);assert.match(r.output,/Unexpected lock contents/);await original(f);
  assert.equal(await readFile(join(f.lock,'unexpected'),'utf8'),'keep');assert.equal(await exists(join(f.lock,'owner.json')),true);
});
test('late interrupt permits escalation before ending group observation', {skip:process.platform==='win32',timeout:15000}, async t => {
  const writer=`process.on('SIGTERM',()=>{});const fs=require('fs');fs.writeFileSync('descendant-ready','');setInterval(()=>fs.writeFileSync('heartbeat',String(Date.now())),50);`;
  const f=await fixture(t, `const fs=require('fs');const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(writer)}],{stdio:'ignore'});c.unref();setInterval(()=>{if(fs.existsSync('descendant-ready')){fs.writeFileSync('leader-exiting','');process.exit(0)}},5);`);
  const child=f.run();await waitFor(join(f.root,'leader-exiting'));await new Promise(r=>setTimeout(r,3000));
  const owner=JSON.parse(await readFile(join(f.lock,'owner.json'),'utf8'));
  t.after(()=>{try{process.kill(-owner.processGroup,'SIGKILL');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}});
  const interruptedAt=Date.now();child.p.kill('SIGTERM');
  // Repeated signals must not keep moving the bounded first-interrupt deadline.
  await new Promise(r=>setTimeout(r,1000));child.p.kill('SIGTERM');
  const r=await child.done;assert.equal(r.code,143);assert.ok(Date.now()-interruptedAt>=4900,'must allow the five-second escalation');assert.ok(Date.now()-interruptedAt<7000,'must remain bounded from the first interrupt');
  const heartbeat=await readFile(join(f.root,'heartbeat'),'utf8');await new Promise(r=>setTimeout(r,200));assert.equal(await readFile(join(f.root,'heartbeat'),'utf8'),heartbeat,'descendant must have stopped writing before wrapper returns');
  if(await exists(f.lock))assert.equal(await readFile(join(f.lock,'upstream-sources/sentinel'),'utf8'),'original\0bytes');else await original(f);
});
