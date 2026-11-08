/** Manually authored synthetic binary layout, independent of HCI production writers.
 * Header 0..15, record header 16..39, H4 event 40..44, report 0 at 45.
 * Report stride = 10 + data length; data starts nine bytes into each report.
 * No capture, radio, real address, account or device is involved. */
import { createHash } from 'node:crypto';
export const hash = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const report = (data = '020106', eventType = 0, addressType = 0, address = '010203040506', rssi = 127) =>
  Buffer.concat([Buffer.from([eventType,addressType]),Buffer.from(address,'hex'),Buffer.from([data.length / 2]),Buffer.from(data,'hex'),Buffer.from([rssi])]);
export async function document(reports = [report()]) {
  const parameters = Buffer.concat([Buffer.from([2,reports.length]),...reports]);
  const payload = Buffer.concat([Buffer.from([4,62,parameters.length]),parameters]);
  const recordHeader = Buffer.alloc(24); recordHeader.writeUInt32BE(payload.length,0); recordHeader.writeUInt32BE(payload.length,4);
  recordHeader.writeUInt32BE(3,8); recordHeader.writeBigInt64BE(-123n,16);
  const record = Buffer.concat([recordHeader,payload]);
  const header = Buffer.from('6274736e6f6f700000000001000003ea','hex');
  const binary = Buffer.concat([header,record]);
  return JSON.stringify({schemaVersion:1,format:'APEX-HCI-selected-legacy-event',sourceKind:'offline-hci-legacy-advertising-event',
    representation:'btsnoop-v1-h4-single-record-derivative', context:{provenance:'synthetic-fixture',label:'Manual comparison fixture'},
    sourceReference:{sha256:'a'.repeat(64),byteCount:binary.length,recordIndex:0,recordOffset:16},
    derivative:{fileHeaderHex:header.toString('hex'),recordHex:record.toString('hex'),byteCount:binary.length,sha256:await hash(binary)}});
}
