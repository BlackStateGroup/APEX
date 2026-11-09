import assert from 'node:assert/strict';
import test from 'node:test';
import { openFramedHost } from './jni-host-client.mjs';
const hello="process.stdout.write(Buffer.from([0,0,0,1]));";
const respond="let data=Buffer.alloc(0);process.stdin.on('data',chunk=>{data=Buffer.concat([data,chunk]);if(data.length>=4&&data.length>=4+data.readUInt32BE(0)){const bytes=Buffer.alloc(36);bytes.writeUInt32BE(32);process.stdout.write(bytes);data=Buffer.alloc(0);}});";
const launch=(source,options)=>openFramedHost(process.execPath,['-e',source],{timeoutMs:10000,killAfterMs:100,...options});

test('framed test helper consumes clean output to EOF',async()=>{
  const host=await launch(hello+respond);try{assert.equal(host.session,1);assert.equal((await host.execute(new Uint8Array(48))).length,32);await host.finish();}finally{await host.abort();}
});
test('later-chunk trailing stdout is rejected, not silently discarded',async()=>{
  const host=await launch(hello+respond+"process.stdin.on('end',()=>setTimeout(()=>process.stdout.write(Buffer.from([99])),10));");
  try{await host.execute(new Uint8Array(48));await assert.rejects(host.finish(),/Unexpected trailing JNI bytes/);}finally{await host.abort();}
});
test('oversized diagnostics fail with bounded retained output',async()=>{
  const host=await launch(hello+respond+"process.stdin.on('end',()=>{process.stderr.write(Buffer.alloc(200000,65));setInterval(()=>{},1000);});");
  try{await host.execute(new Uint8Array(48));await assert.rejects(host.finish(),/Excessive JNI diagnostics/);}finally{await host.abort();}
});
test('timeout kills a TERM-ignoring child and rejects rather than hanging',async()=>{
  const host=await launch("process.on('SIGTERM',()=>{});"+hello+"process.stdin.resume();setInterval(()=>{},1000);",{timeoutMs:1000});
  const start=performance.now();try{await assert.rejects(host.execute(new Uint8Array(48)),/Host JNI corpus timeout/);}finally{await host.abort();}
  assert.ok(performance.now()-start<5000,'Bounded TERM to KILL cleanup');
});
test('abort also kills TERM-ignoring child independently of test deadline',async()=>{
  const host=await launch("process.on('SIGTERM',()=>{});"+hello+"process.stdin.resume();setInterval(()=>{},1000);",{timeoutMs:10000});
  const start=performance.now();await host.abort();assert.ok(performance.now()-start<5000);
});
test('truncated, oversized and nonzero-exit responses cannot pass',async()=>{
  for(const source of [
    hello+"process.stdin.once('data',()=>{process.stdout.write(Buffer.from([0,0]));process.exit(0);});",
    hello+"process.stdin.once('data',()=>{const b=Buffer.alloc(4);b.writeUInt32BE(262177);process.stdout.write(b);process.exit(0);});",
  ]){const host=await launch(source);try{await assert.rejects(host.execute(new Uint8Array(48)));}finally{await host.abort();}}
  const host=await launch(hello+respond+"process.stdin.on('end',()=>process.exit(4));");
  try{await host.execute(new Uint8Array(48));await assert.rejects(host.finish());}finally{await host.abort();}
});
test('failed process start cannot leak or wait for the corpus timeout',async()=>{
  await assert.rejects(openFramedHost('/no/such/apex-test-host',[],{timeoutMs:10000,killAfterMs:50}),/ENOENT/);
});


test('invalid input bounds reject before dispatch without corrupting admission',async()=>{
  const host=await launch(hello+respond);try{
    for(const input of [new Uint8Array(47),new Uint8Array(360481),{}])await assert.rejects(host.execute(input),/Bounded host request/);
    assert.equal((await host.execute(new Uint8Array(48))).length,32);await host.finish();
  }finally{await host.abort();}
});
