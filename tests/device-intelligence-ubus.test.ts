import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflinePassport } from '../packages/core/device-intelligence.ts';
import type { ScopeDeclaration } from '../packages/core/device-intelligence.ts';
import { buildOpenWrtUbusRead, parseOpenWrtUbusReadReply } from '../packages/core/openwrt-ubus.ts';

const hash='b'.repeat(64),session='f'.repeat(32);
const passport=createOfflinePassport({name:'synthetic-openwrt.bin',sha256:hash,bytes:4096,format:'unknown'},
  {sshConfigurationMarker:false,credentialConfigurationMarker:false,webManagementMarker:false});
const scope=(update:Partial<ScopeDeclaration>={}):ScopeDeclaration=>({
  fixtureId:'openwrt-test',sourceSha256:hash,authorisation:'owned-or-authorised-lab',
  approvedOperations:['system.version','system.health'],expiresAtMs:20000,operatorConfirmed:true,...update,
});
const boardResponse=(requestId=7)=>JSON.stringify({jsonrpc:'2.0',id:requestId,
  result:[0,{model:'Synthetic OpenWrt',board_name:'virtual-openwrt',kernel:'6.x',
    release:{distribution:'OpenWrt',version:'24.x',target:'x86/64'},
    password:'NEVER_ECHO_THIS_TEST_FIXTURE',privateKey:'UNTRUSTED'}]});
const infoResponse=(id=9)=>JSON.stringify({jsonrpc:'2.0',id,result:[0,{uptime:123,localtime:456,authenticated:true,
  sessions:['SENSITIVE'],memory:{total:1234}}]});

test('ubus builder permits only scoped version and health reads, without logging or sending anything',()=>{
  const request=buildOpenWrtUbusRead(passport,scope(),session,'board',7,100);
  assert.deepEqual(request,{jsonrpc:'2.0',id:7,method:'call',params:[session,'system','board',{}]});
  assert.ok(Object.isFrozen(request));
  assert.ok(Object.isFrozen(request.params));
  assert.equal(typeof request.params[3], 'object');
  assert.equal(Object.hasOwn(request,'url'),false);
  assert.equal(Object.hasOwn(request,'password'),false);
  const info=buildOpenWrtUbusRead(passport,scope(),session,'info',9,100);
  assert.deepEqual(info.params,[session,'system','info',{}]);
});
test('offline source identity, expiration, scope and unsupported methods fail before issuing any RPC',()=>{
  for(const method of ['reboot','sysupgrade','signal','watchdog','toString','__proto__','login']) {
    assert.throws(()=>buildOpenWrtUbusRead(passport,scope(),session,method as any,8,100),/state-changing/);
  }
  for(const bad of ['',session.toUpperCase(),'0'.repeat(32),'pass','a'.repeat(33)]) {
    assert.throws(()=>buildOpenWrtUbusRead(passport,scope(),bad,'board',8,100),/session/);
  }
  assert.throws(()=>buildOpenWrtUbusRead(passport,scope({sourceSha256:'a'.repeat(64)}),session,'board',7,100),/target-mismatch/);
  assert.throws(()=>buildOpenWrtUbusRead(passport,scope({approvedOperations:['system.health']}),session,'board',7,100),/operation-denied/);
  assert.throws(()=>buildOpenWrtUbusRead(passport,scope(),session,'board',7,20000),/expired/);
  assert.throws(()=>buildOpenWrtUbusRead(passport,scope(),session,'board',0,100),/request ID/);
  assert.throws(()=>buildOpenWrtUbusRead(passport,scope(),session,'board',1.2,100),/request ID/);
});
test('read-only system.board output projects only approved fields and cannot prove privilege',()=>{
  const r=parseOpenWrtUbusReadReply(boardResponse(),'board',7);
  assert.deepEqual(r.fields,{
    model:'Synthetic OpenWrt',board_name:'virtual-openwrt',kernel:'6.x',
    'release.distribution':'OpenWrt','release.version':'24.x','release.target':'x86/64',
  });
  assert.equal(r.rootAccess,'unknown');
  assert.equal(r.administrativeAccess,'unknown');
  assert.equal(r.provenance,'unverified-ubus-response');
  assert.equal(JSON.stringify(r).includes('NEVER_ECHO'),false);
  assert.ok(Object.isFrozen(r.fields));
});
test('system.info projects finite non-secret uptime and localtime metadata only',()=>{
  const r=parseOpenWrtUbusReadReply(infoResponse(),'info',9);
  assert.deepEqual(r.fields,{uptimeSeconds:123,localtimeSeconds:456});
  assert.equal(JSON.stringify(r).includes('SENSITIVE'),false);
});
test('mismatched envelope, denied access, malformed bytes and invalid types reject',()=>{
  for(const input of [
    boardResponse(8),
    JSON.stringify({jsonrpc:'2.0',id:7,result:[6]}),
    JSON.stringify({jsonrpc:'2.0',id:7,result:[0,null]}),
    JSON.stringify({jsonrpc:'2.0',id:7,result:[0,{model:'\nsecret'}]}),
    JSON.stringify({jsonrpc:'2.0',id:7,result:[0,{}]}),
    JSON.stringify({jsonrpc:'2.0',id:7,error:{code:-32600,message:'Not Allowed'}}),
    '{"jsonrpc":"2.0","id":7,"id":7,"result":[0,{}]}',
    'a'.repeat(8193),
    '{',
  ]) assert.throws(()=>parseOpenWrtUbusReadReply(input,'board',7));
  assert.throws(()=>parseOpenWrtUbusReadReply(infoResponse(),'info',7),/mismatch/);
  assert.throws(()=>parseOpenWrtUbusReadReply(JSON.stringify({jsonrpc:'2.0',id:9,result:[0,{uptime:-1}]}),'info',9),/uptime/);
  assert.throws(()=>parseOpenWrtUbusReadReply(boardResponse(),'reboot' as any,7),/unknown method/);
});
