import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for(const mode of ['native-reject','foreign-reject','throwing-then','thenable','resolved'])test(`independent malformed proof ${mode} stays unknown without async side effects`,()=>{
const child=spawnSync(process.execPath,['--input-type=module','-e',`
import assert from 'node:assert/strict';import vm from 'node:vm';import {BleTransport} from './packages/core/ble-transport.ts';
let accessed=0,queries=0;const mode=${JSON.stringify(mode)};const original=Object.freeze({reason:'original'});
const proof=mode==='native-reject'?Promise.reject(Error('bad proof')):mode==='foreign-reject'?vm.runInNewContext('Promise.reject(new Error("foreign bad proof"))'):mode==='resolved'?Promise.resolve(true):mode==='throwing-then'?Object.defineProperty({},'then',{get(){accessed++;throw Error('getter')}}):{then(){accessed++}};
const t=new BleTransport({async connect(){throw original},consumeUnissuedConnection(){queries++;return proof}},'A');
await assert.rejects(t.connect(),e=>e===original);await assert.rejects(t.disconnect(),/unknown/);await assert.rejects(t.disconnect(),/unknown/);await new Promise(r=>setImmediate(r));assert.equal(accessed,0);assert.equal(queries,1);console.log('pass');
`],{encoding:'utf8',timeout:10000});assert.equal(child.status,0,child.stdout+child.stderr);assert.match(child.stdout,/pass/);
});
