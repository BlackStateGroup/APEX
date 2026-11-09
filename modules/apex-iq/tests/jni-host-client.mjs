import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { MAX_REQUEST, MAX_RESPONSE } from '../../../experimental/hybrid-iq/bridge/codec.ts';

/** Test-only, length-framed process client. No sockets or production transport. */
export async function openFramedHost(command, args, {timeoutMs=180000, killAfterMs=1000}={}) {
  const child=spawn(command,args,{stdio:['pipe','pipe','pipe']});
  let diagnostics=Buffer.alloc(0), fault=null, closed=false, pending=false;
  let killTimer=null, detachTimer=null;
  const fail=error=>{fault??=error;terminate();};
  const exited=new Promise(resolveExit=>child.on('close',(code,signal)=>{
    closed=true;clearTimeout(killTimer);clearTimeout(detachTimer);resolveExit({code,signal});
  }));
  // SIGTERM is not assumed to work. After the grace period force termination;
  // after a second bounded grace period detach even an OS-uninterruptible child.
  function terminate(){
    if(closed||killTimer)return;
    child.kill('SIGTERM');
    killTimer=setTimeout(()=>{
      if(closed)return;child.kill('SIGKILL');
      detachTimer=setTimeout(()=>{
        if(closed)return;
        child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();child.unref();
      },killAfterMs);
    },killAfterMs);
  }
  child.on('error',error=>fail(error));
  child.stdin.on('error',error=>fail(error));
  child.stderr.on('data',chunk=>{
    const remaining=65536-diagnostics.length;
    if(remaining>0)diagnostics=Buffer.concat([diagnostics,chunk.subarray(0,remaining)]);
    if(chunk.length>remaining)fail(Error('Excessive JNI diagnostics; retained at most 65536 bytes'));
  });
  const deadline=setTimeout(()=>fail(Error('Host JNI corpus timeout')),timeoutMs);
  const stream=child.stdout[Symbol.asyncIterator]();let buffered=Buffer.alloc(0);
  async function take(length){
    assert.ok(length>0&&length<=MAX_RESPONSE);
    while(buffered.length<length){
      const next=await stream.next();
      if(next.done)throw fault??Error(`Truncated JNI output: ${diagnostics.toString()}`);
      buffered=Buffer.concat([buffered,next.value]);
      assert.ok(buffered.length<=MAX_RESPONSE+4,'Bounded host response buffer');
    }
    const value=buffered.subarray(0,length);buffered=buffered.subarray(length);return value;
  }
  async function abort(){
    clearTimeout(deadline);terminate();
    let guard;
    try {
      await Promise.race([exited,new Promise((_,reject)=>{guard=setTimeout(()=>reject(Error('Host process did not terminate after SIGKILL')),2*killAfterMs+100);})]);
    } finally {clearTimeout(guard);}
  }
  try {
    const session=(await take(4)).readUInt32BE(0);assert.ok(session>0);
    return {
      session,
      async execute(bytes){
        assert.equal(pending,false,'One in-flight test request');pending=true;
        try {
          assert.ok(bytes instanceof Uint8Array && bytes.length >= 48 && bytes.length <= MAX_REQUEST, 'Bounded host request');
          const header=Buffer.alloc(4);header.writeUInt32BE(bytes.length);
          await new Promise((yes,no)=>child.stdin.write(Buffer.concat([header,bytes]),error=>error?no(error):yes()));
          const length=(await take(4)).readUInt32BE(0);assert.ok(length>=32&&length<=MAX_RESPONSE);
          return new Uint8Array(await take(length));
        } finally {pending=false;}
      },
      async finish(){
        try {
          assert.equal(pending,false);child.stdin.end();
          assert.equal(buffered.length,0,'Unexpected trailing JNI bytes');
          // Read to EOF, not just the bytes already moved into our local buffer.
          // A later stream chunk is still a protocol violation, even after exit.
          while(true){const next=await stream.next();if(next.done)break;assert.equal(next.value.length,0,'Unexpected trailing JNI bytes');}
          const status=await exited;assert.equal(fault,null);assert.deepEqual(status,{code:0,signal:null},diagnostics.toString());assert.equal(diagnostics.length,0,diagnostics.toString());
        } finally {await abort();}
      },
      abort,
    };
  } catch(error){await abort();throw error;}
}
