// Host-only regression reproducer. Expected current failure is asserted explicitly.
import assert from 'node:assert/strict';
import { BleTransport, AXP_READY } from '../../packages/core/ble-transport.ts';
import { encode, Kind, Opcode } from '../../packages/protocol/index.ts';
let notify!: (bytes: Uint8Array) => void;
const transport = new BleTransport({ async connect() { return {
  mtu: 23,
  async subscribe(callback: (bytes: Uint8Array) => void) { notify = callback; callback(AXP_READY); return () => {}; },
  async writeWithResponse() {}, async disconnect() {},
}; } }, 'host-fixture');
await transport.connect();
const received: number[] = [];
transport.onData(bytes => received.push(...bytes));
const payload = new Uint8Array(17);
payload.set(new TextEncoder().encode('AXP_REA'), 10);
let response: Uint8Array | undefined;
for (let value = 0; value < 65536; value++) {
  payload[0] = value & 255; payload[1] = value >> 8;
  const candidate = encode({kind: Kind.Response, opcode: Opcode.Ping, id: 3, payload});
  if (candidate[27] === 0x44 && candidate[28] === 0x59) { response = candidate; break; }
}
assert.ok(response);
assert.deepEqual(response.slice(20), AXP_READY);
notify(response.slice(0, 20)); notify(response.slice(20));
assert.equal(received.length, 20); // 29 bytes should reach the decoder, only 20 do.
await transport.disconnect();
console.log(JSON.stringify({finding:'CONFIRMED READY collision: valid ping response tail swallowed', mtu:23, payloadHex:Buffer.from(payload).toString('hex'), responseHex:Buffer.from(response).toString('hex'), expectedBytes:29, observedBytes:received.length}));
