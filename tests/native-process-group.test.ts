import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForProcessGroup } from '../tools/native-process-group.mjs';
test('only ESRCH proves tracked group absence', async()=>{
  await waitForProcessGroup(123,{probe(){throw Object.assign(new Error('gone'),{code:'ESRCH'});}});
  for(const code of ['EPERM','EINVAL'])await assert.rejects(waitForProcessGroup(123,{probe(){throw Object.assign(new Error('uncertain'),{code});}}),/Cannot verify process group 123/);
});
test('group probe waits through present group and fails closed on timeout',async()=>{
  let time=0, calls=0;
  await assert.rejects(waitForProcessGroup(123,{probe(){calls++;},now:()=>time,wait:async(ms:number)=>{time+=ms;},timeoutMs:100}),/still exists/);
  assert.equal(time,100);assert.equal(calls,3);
});
test('group probe can verify eventual disappearance',async()=>{
  let time=0;
  await waitForProcessGroup(123,{probe(){if(time>=50)throw Object.assign(new Error('gone'),{code:'ESRCH'});},now:()=>time,wait:async(ms:number)=>{time+=ms;},timeoutMs:100});
  assert.equal(time,50);
});
test('a fixed late-interrupt deadline extends observation only once',async()=>{
  let time=0;
  await assert.rejects(waitForProcessGroup(123,{probe(){},now:()=>time,wait:async(ms:number)=>{time+=ms;},timeoutMs:100,deadlineExtension:()=>time>=50?170:undefined}),/still exists after 170ms/);
  assert.equal(time,170);
});
