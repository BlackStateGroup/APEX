import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceSession } from '../packages/core/session.ts';
import { createRadioReceiveClient } from '../packages/core/radio-receive-client.ts';
import { buildRadioReceiveHost, RadioReceiveHostTransport } from './helpers/radio-receive-host.ts';
let host:ReturnType<typeof buildRadioReceiveHost>;
before(()=>{host=buildRadioReceiveHost();});after(()=>host?.dispose());

test('coordinator→DeviceSession→actual C++ service completes a bounded capture with exact synthetic packets',{timeout:5000},async()=>{
 const transport=new RadioReceiveHostTransport(host.binary),session=new DeviceSession(transport,{allowRadioReceive:true});
 try{
  await session.open();const client=createRadioReceiveClient(session);assert.equal(transport.writes.length,2);
  await client.start(1000,5);
  for(let i=0;i<8&&(client.state.status!.state===1||client.state.status!.queued);i++)await client.poll();
  assert.equal(client.state.status!.state,4);assert.equal(client.state.status!.observed,5);assert.equal(client.state.status!.rejected,2);
  assert.deepEqual(client.state.packets.map(p=>p.payload),[[0,255,128,0],[0,255,128,2],[0,255,128,4]]);
  assert.deepEqual(client.state.packets.map(p=>p.rssiTenthsDbm),[-735,-737,-739]);assert.equal(client.state.unreturnedAccepted,0);
  await client.start(1000,5);assert.equal(client.state.status!.captureId,2);await client.stop();assert.equal(client.state.status!.state,2);
  // Stop preserves queued records; the caller must explicitly drain before reuse.
  while(client.state.status!.queued)await client.poll();assert.equal(client.state.uncertain,false);
 }finally{await session.close();}
});
test('coordinator honors real cold expiry and subsequent warm lease without retrying automatically',{timeout:5000},async()=>{
 const transport=new RadioReceiveHostTransport(host.binary,'quiet'),session=new DeviceSession(transport,{allowRadioReceive:true});
 try{
  await session.open();const client=createRadioReceiveClient(session);await client.start(50,4);
  assert.equal(client.state.status!.state,3);assert.equal(client.state.status!.elapsedMs,150);assert.equal(transport.writes.length,3);
  await client.start(50,4);assert.equal(client.state.status!.captureId,2);
  for(let i=0;i<5;i++)await client.poll();assert.equal(client.state.status!.state,3);assert.equal(client.state.packets.length,0);
 }finally{await session.close();}
 assert.equal(JSON.parse(transport.diagnostics).initializes,1);
});
for(const mode of ['initialize-failure','stop-failure'] as const)test(`coordinator respects actual ${mode} without restarting`,{timeout:5000},async()=>{
 const transport=new RadioReceiveHostTransport(host.binary,mode),session=new DeviceSession(transport,{allowRadioReceive:true});
 try{
  await session.open();const client=createRadioReceiveClient(session);await client.start(1000,4);if(mode==='stop-failure')await client.stop();
  assert.equal(client.state.status!.state,5);const before=transport.writes.length;await assert.rejects(client.start(1000,4));assert.equal(transport.writes.length,before);
 }finally{await session.close();}
});
