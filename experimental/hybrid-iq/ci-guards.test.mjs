import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const shellQuote=s=>`'${s.replaceAll("'", "'\\''")}'`;
function fixture({node=true,rust=true,cargo=true,wrongNode=false,missingTool=null}={}) {
 const dir=mkdtempSync(join(tmpdir(),'apex-ci-preflight-'));
 const cache=join(dir,'tools'),home=join(dir,'home'),temp=join(dir,'temp'),path=join(dir,'path'),envFile=join(dir,'env');
 mkdirSync(temp,{recursive:true});writeFileSync(path,'');writeFileSync(envFile,'');
 function script(file,text){mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,text,{mode:0o700});}
 if(node)script(join(cache,'node/24.22.1/x64/bin/node'),wrongNode?'#!/bin/bash\nexit 23\n':`#!/bin/bash\nexec ${shellQuote(process.execPath)} "$@"\n`);
 if(rust)script(join(home,'.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin/rustc'),'#!/bin/bash\nprintf "%s\\n" "MOCK rustc version probe only"\n');
 if(cargo)script(join(home,'.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin/cargo'),'#!/bin/bash\nprintf "%s\\n" "MOCK cargo version probe only"\n');
 const env={...process.env,HOME:home,RUNNER_TOOL_CACHE:cache,RUNNER_TEMP:temp,GITHUB_PATH:path,GITHUB_ENV:envFile};
 if(missingTool){
  const bin=join(dir,'bin');mkdirSync(bin);
  for(const [name,target] of [['bash','/bin/bash'],['sort','/usr/bin/sort'],['tail','/usr/bin/tail'],['mktemp','/usr/bin/mktemp'],['g++','/usr/bin/g++'],['ar','/usr/bin/ar']])if(name!==missingTool)symlinkSync(target,join(bin,name));
  env.PATH=bin;
 }
 return {dir,env,path,envFile,temp,run:()=>spawnSync('bash',[join(root,'ci-preflight.sh')],{env,encoding:'utf8',timeout:10000})};
}
for(const [name,opts,pattern] of [['missing Node',{node:false},/Node 24 is absent/],['missing Rust',{rust:false},/Rust is absent/],['missing Cargo',{cargo:false},null],['wrong Node runtime',{wrongNode:true},null],['missing g++',{missingTool:'g++'},/Missing preinstalled g\+\+/],['missing ar',{missingTool:'ar'},/Missing preinstalled ar/]]) {
 test(`preflight rejects ${name} without writing selected paths`,()=>{
  const f=fixture(opts);try{const r=f.run();assert.notEqual(r.status,0);if(pattern)assert.match(r.stderr,pattern);assert.equal(readFileSync(f.path,'utf8'),'');assert.equal(readFileSync(f.envFile,'utf8'),'');}finally{rmSync(f.dir,{recursive:true,force:true});}
 });
}
test('preflight selects existing direct tool paths (Rust probes are mocks, not a Rust test)',()=>{
 const f=fixture();try{const r=f.run();assert.equal(r.status,0,r.stderr);const path=readFileSync(f.path,'utf8'),env=readFileSync(f.envFile,'utf8');assert.match(path,/node\/24\.22\.1\/x64\/bin/);assert.match(path,/\.rustup\/toolchains\/stable-x86_64-unknown-linux-gnu\/bin/);assert.match(env,/RUSTC=.*toolchains.*\/bin\/rustc/);assert.match(env,/CARGO_NET_OFFLINE=true/);assert.match(env,/RUSTUP_AUTO_INSTALL=0/);assert.match(r.stdout,/MOCK rustc version probe only/);}finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('preflight isolates a fresh Cargo home from preexisting configuration',()=>{
 const f=fixture();try{
  const old=join(f.temp,'apex-hybrid-cargo-home');mkdirSync(old);writeFileSync(join(old,'config.toml'),'MOCK_CONFIG_DO_NOT_USE');
  const r=f.run();assert.equal(r.status,0,r.stderr);
  const selected=readFileSync(f.envFile,'utf8').match(/^CARGO_HOME=(.+)$/m)[1];
  assert.notEqual(selected,old);assert.ok(selected.startsWith(old+'.'));
  assert.equal(readFileSync(join(old,'config.toml'),'utf8'),'MOCK_CONFIG_DO_NOT_USE');
  assert.deepEqual(readdirSync(selected),[]);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('workflow restricts code origin, permissions, trigger and toolchain installation',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/hybrid-iq.yml',import.meta.url),'utf8');
 assert.match(workflow,/pull_request:\n    paths:/);assert.doesNotMatch(workflow,/^\s*pull_request_target:/m);
 assert.match(workflow,/contents: read/);assert.match(workflow,/persist-credentials: false/);
 assert.match(workflow,/head\.repo\.full_name == github\.repository/);assert.match(workflow,/head\.ref == 'experiment\/hybrid-fft-exact-contract'/);
 assert.match(workflow,/actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/);
 assert.equal((workflow.match(/uses:/g)??[]).length,1);
 assert.doesNotMatch(workflow,/secrets\./);assert.doesNotMatch(workflow,/setup-node|setup-rust|apt-get|npm (?:ci|install)|rustup (?:toolchain|install|update)/);
 assert.match(workflow,/timeout-minutes: 20/);
});
test('proof entrypoint requires both Rust test profiles and exact Rust parity offline',()=>{
 const script=readFileSync(join(root,'ci-host-check.sh'),'utf8');
 assert.match(script,/set -euo pipefail/);assert.match(script,/export RUSTUP_AUTO_INSTALL=0 CARGO_NET_OFFLINE=true/);assert.ok(script.indexOf('export RUSTUP_AUTO_INSTALL')<script.indexOf('rustc --version'));assert.match(script,/unset CARGO_TARGET_DIR/);
 assert.match(script,/node proof\.mjs verify\n/);assert.match(script,/node proof\.mjs sanitize\n/);
 assert.match(script,/cargo test --manifest-path rust\/Cargo\.toml --locked --offline\n/);
 assert.match(script,/cargo test --manifest-path rust\/Cargo\.toml --locked --offline --release\n/);
 assert.match(script,/node proof\.mjs verify rust/);assert.doesNotMatch(script,/cargo install|rustup|curl|wget/);
});
