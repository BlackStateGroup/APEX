import {createHash} from 'node:crypto';
export const context={provenance:'synthetic-fixture' as const,label:'independent selected review'};
export const hash=async(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const header=Buffer.from('6274736e6f6f700000000001000003ea','hex');
export function record(payload:Uint8Array,flags=3){const h=Buffer.alloc(24);h.writeUInt32BE(payload.length);h.writeUInt32BE(payload.length,4);h.writeUInt32BE(flags,8);h.writeUInt32BE(0x12345678,12);h.writeBigInt64BE(-123456789n,16);return Buffer.concat([h,payload]);}
export function report(hex='',type=0,addressType=0){const d=Buffer.from(hex,'hex');return Buffer.from([type,addressType,1,2,3,4,5,6,d.length,...d,0xc4]);}
export function event(reports:Uint8Array[]){const b=Buffer.concat(reports);return Buffer.from([4,62,2+b.length,2,reports.length,...b]);}
export const minimum=Buffer.from('043e0c0201000001020304050600c4','hex');
export const chosen=event([report('020106'),report('0416ffff00',4),report('0516d2fc41ff',0,3)]);
export const extended=Buffer.from([4,62,26,13,1,0,0,255,1,2,3,4,5,6,1,0,255,127,127,0,0,255,1,2,3,4,5,6,0]);
export const prefix=[record(Buffer.from([1,...Buffer.from('COMMAND_SENTINEL')])),record(Buffer.from([2,...Buffer.from('ACL_SENTINEL')]))];
export const suffix=[record(Buffer.from([4,0x18,...Buffer.from('KEY_EVENT_SENTINEL')])),record(extended)];
export const capture=Buffer.concat([header,...prefix,record(chosen),...suffix]);
export const chosenOffset=16+prefix.reduce((n,b)=>n+b.length,0);
