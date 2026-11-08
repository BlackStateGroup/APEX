import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as old from '../../packages/core/.hci-independent-baseline.ts';
import * as now from '../../packages/core/hci-offline.ts';
const context={provenance:'synthetic-fixture',label:'baseline parity'};
const hash=async b=>createHash('sha256').update(b).digest('hex');
const payloads=[[4,62,12,2,1,0,0,1,2,3,4,5,6,0,127],[4,62,26,13,1,...Array(24).fill(0)],[1,0xab],[2,0xab],[4,0xff,0]];
let checked=0;
for(const payload of payloads){const b=Buffer.alloc(40+payload.length);b.write('btsnoop\0');b.writeUInt32BE(1,8);b.writeUInt32BE(1002,12);b.writeUInt32BE(payload.length,16);b.writeUInt32BE(payload.length,20);b.writeUInt32BE(3,24);b.set(payload,40);
 const a=await old.prepareHci(b,context,hash),c=await now.prepareHci(b,context,hash);
 assert.equal(old.serializeHciReport(old.listHciRecords(a)),now.serializeHciReport(now.listHciRecords(c)));checked++;
 if(payload[3]===2){assert.equal(old.serializeHciReport(old.selectHciLegacyEvent(a,0)),now.serializeHciReport(now.selectHciLegacyEvent(c,0)));checked++;}}
console.log(`${checked} byte-for-byte serialized baseline comparisons passed against 2c11de2; synthetic inputs only.`);
