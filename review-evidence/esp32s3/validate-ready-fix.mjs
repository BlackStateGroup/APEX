// Independent host-only review. Usage: node validate-ready-fix.mjs /absolute/checkout
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.');
const moduleAt = name => import(pathToFileURL(path.join(root, name)).href);
const { BleTransport, AXP_READY } = await moduleAt('packages/core/ble-transport.ts');
const { DeviceSession } = await moduleAt('packages/core/session.ts');
const { FrameDecoder, encode, Kind, Opcode, utf8 } = await moduleAt('packages/protocol/index.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(pending = false) {
  let notify, closed, release;
  let disconnects = 0, removals = 0;
  const gate = pending ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const connection = { mtu: 23, async subscribe(onData, onClosed) {
    notify = onData; closed = onClosed; await gate; return () => removals++;
  }, async writeWithResponse() {}, async disconnect() { disconnects++; } };
  const transport = new BleTransport({async connect() { return connection; }}, 'review-fixture', {timeoutMs: 250});
  return {transport, connection, notify: bytes => notify(bytes), close: () => closed(new Error('closed')), release: () => release?.(), stats: () => ({disconnects,removals})};
}
const payload = Uint8Array.from(Buffer.from('80a700000000000000004158505f524541', 'hex'));
const response = encode({kind: Kind.Response, opcode: Opcode.Ping, id: 3, payload});
assert.deepEqual(response.slice(20), AXP_READY);
let checks = 0;
// First marker consumed; tail preserved even before subscribe promise resolves.
{
  const f = fixture(true); const seen = []; const decoded = [];
  const decoder = new FrameDecoder(frame => decoded.push(frame));
  f.transport.onData(bytes => { seen.push(...bytes); decoder.push(bytes); });
  const opening = f.transport.connect(); await tick(); f.notify(AXP_READY);
  assert.equal(seen.length, 0);
  f.notify(response.slice(0, 20)); f.notify(response.slice(20));
  assert.deepEqual(Uint8Array.from(seen), response);
  assert.equal(decoded.length, 1); assert.deepEqual(decoded[0].payload, payload);
  f.release(); await opening;
  f.notify(AXP_READY); assert.deepEqual(Uint8Array.from(seen.slice(29)), AXP_READY);
  await f.transport.disconnect(); const length = seen.length;
  f.notify(AXP_READY); f.notify(response); f.close();
  assert.equal(seen.length, length); assert.deepEqual(f.stats(), {disconnects:1,removals:1}); checks++;
}
// Invalid pre-ready notification remains fatal even if marker arrives immediately after.
{
  const f = fixture(); const seen = []; f.transport.onData(bytes => seen.push(bytes));
  const opening = f.transport.connect(); const rejected = assert.rejects(opening, /READY marker/);
  await tick(); f.notify(Uint8Array.of(1)); f.notify(AXP_READY); await rejected;
  assert.equal(seen.length, 0); assert.equal(f.stats().disconnects, 1); checks++;
}
// Full session negotiation and CRC-validated ping through the real decoder.
{
  const f = fixture();
  const decoder = new FrameDecoder(request => {
    const body = request.opcode === Opcode.Info ? utf8(JSON.stringify({id:'review-s3',board:'esp32s3',firmware:'0.1.0',protocol:1,source:'accessory'})) : request.opcode === Opcode.Capabilities ? utf8(JSON.stringify({operations:['system.info','system.capabilities','system.ping']})) : request.payload;
    const wire = encode({kind:Kind.Response,opcode:request.opcode,id:request.id,payload:body});
    for (let i=0;i<wire.length;i+=20) f.notify(wire.slice(i,i+20));
  });
  f.connection.writeWithResponse = async bytes => decoder.push(bytes);
  const session = new DeviceSession(f.transport, {timeoutMs:250});
  const opening = session.open(); await tick(); f.notify(AXP_READY); await opening;
  assert.deepEqual(await session.request('system.ping',payload),payload);
  assert.equal(session.pendingCount,0); assert.equal(session.state,'open');
  await session.close(); assert.equal(session.transportReleasePending,false); checks++;
}
// Notification bounds remain enforced after initial marker, including pending subscribe.
{
  const f = fixture(true); let failures = 0; f.transport.onDisconnect(() => failures++);
  const opening = f.transport.connect(); const rejected = assert.rejects(opening, /Invalid BLE notification bounds|closed/);
  await tick(); f.notify(AXP_READY); f.notify(new Uint8Array(513)); f.release(); await rejected;
  assert.equal(failures,1); assert.equal(f.stats().disconnects,1); checks++;
}
console.log(`PASS: ${checks} independent host-only READY fix review scenarios against ${root}`);
