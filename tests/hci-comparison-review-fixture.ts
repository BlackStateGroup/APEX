import {createHash} from 'node:crypto';
export const hash=async(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const header=Buffer.from('6274736e6f6f700000000001000003ea','hex');
export function report(data:number[],type=0,address=1){return [type,0,address,2,3,4,5,6,data.length,...data,0xc0];}
export async function doc(reports:number[][],label='independent oracle'){
 const event=Buffer.from([4,62,2+reports.flat().length,2,reports.length,...reports.flat()]);
 const r=Buffer.alloc(24);r.writeUInt32BE(event.length);r.writeUInt32BE(event.length,4);r.writeUInt32BE(3,8);
 const rec=Buffer.concat([r,event]),binary=Buffer.concat([header,rec]);
 return JSON.stringify({schemaVersion:1,format:'APEX-HCI-selected-legacy-event',sourceKind:'offline-hci-legacy-advertising-event',representation:'btsnoop-v1-h4-single-record-derivative',context:{provenance:'synthetic-fixture',label},sourceReference:{sha256:'a'.repeat(64),byteCount:binary.length,recordIndex:0,recordOffset:16},derivative:{fileHeaderHex:header.toString('hex'),recordHex:rec.toString('hex'),byteCount:binary.length,sha256:await hash(binary)}});
}
