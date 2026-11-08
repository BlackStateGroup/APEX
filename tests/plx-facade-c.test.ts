import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loaded } from './plx-facade-host/loader.ts';
import { bridge } from './browser-c-host/bridge.ts';
import { AXP_NOTIFY, AXP_READY } from '../packages/core/ble-transport.ts';
import { encode, FrameDecoder } from '../packages/protocol/index.ts';
import type { Frame } from '../packages/protocol/index.ts';
import { fixture, binary } from './plx-facade-host/fixture.ts';
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const errorJSON = (code: number, reason: string) => JSON.stringify({ errorCode: code, reason });
function frames(chunks: Uint8Array[]) { const result: Frame[] = []; const decoder = new FrameDecoder(frame => result.push(frame)); chunks.forEach(chunk => decoder.push(chunk)); assert.equal(decoder.discarded, 0); assert.equal(decoder.bufferedBytes, 0); assert.deepEqual(Buffer.concat(chunks), Buffer.concat(result.map(encode))); return result; }
for (const platform of ['android','ios'] as const) for (const mtu of [23,517] as const) {
  test(`installed PLX ${platform} MTU ${mtu}: C protocol, transaction filter and late cancellation`, { timeout: 20000 }, async () => {
    const x = await fixture(platform, mtu);
    try {
      await x.session.open(); assert.equal(x.session.info?.id, 'apex-s3-dev'); assert.deepEqual(x.session.capabilities, ['system.info','system.capabilities','system.ping']);
      const payloads = [new Uint8Array(), Uint8Array.from({ length: 512 }, (_,i) => i & 255)];
      for (const payload of payloads) assert.deepEqual(await x.session.request('system.ping',payload),payload);
      const writes = x.f.trace.filter(e => e.origin === 'plx-client-write').map(e => Buffer.from(e.value.slice(2),'hex'));
      const notices = x.f.trace.filter(e => e.origin === 'C-notification').map(e => Buffer.from(e.value,'hex'));
      assert.deepEqual(new Uint8Array(notices[0]!), AXP_READY);
      assert.deepEqual(frames(writes).map(f => [f.kind,f.opcode,f.id]), [[1,1,1],[1,2,2],[1,3,3],[1,3,4]]);
      const replies = frames(notices.slice(1)); assert.deepEqual(replies.map(f => [f.kind,f.opcode,f.id]), [[2,1,1],[2,2,2],[2,3,3],[2,3,4]]);
      assert.deepEqual(replies.slice(2).map(f => f.payload),payloads);
      assert.ok(writes.some(bytes => bytes.length === Math.min(mtu-3,244))); assert.ok(notices.every(bytes => bytes.length <= Math.min(mtu-3,244)));
      assert.equal(x.events.includes('mtu'),platform === 'android'); assert.equal(x.events.includes('permissions'),platform === 'android');
      x.emit('ReadEvent',[errorJSON(201,'wrong transaction'),null,'not-' + x.transaction()]);
      x.emit('DisconnectionEvent',[null,{id:'OTHER'}]); assert.equal(x.session.state,'open');
      const staleRead = [...x.listeners.get('ReadEvent')!][0]!, staleDisconnect = [...x.listeners.get('DisconnectionEvent')!][0]!;
      x.holdMonitorCancellation(); let delivered = 0; x.transport.onData(() => delivered++);
      await x.session.close(); assert.equal(x.native.accessoryConnectionOwnership(),'idle'); assert.equal(x.session.transportReleasePending,false);
      // Real PLX remove() cancels a transaction; its event listener survives until the native monitor Promise settles.
      assert.equal(x.listeners.get('ReadEvent')!.size,1); assert.ok(x.events.includes('cancelTransaction'));
      staleRead([null,x.characteristic(AXP_NOTIFY, Buffer.from(encode(replies[2]!)).toString('base64')),x.transaction()]); staleDisconnect([null,x.device()]); assert.equal(delivered,0);
      x.settleMonitor(); await turn(); assert.equal(x.listeners.get('ReadEvent')!.size,0);
      if(platform === 'ios') { await assert.rejects(x.native.shutdownBluetooth(), /unacknowledged/); assert.equal(x.native.accessoryConnectionOwnership(),'unknown'); await assert.rejects(x.native.bleDriver.connect('AXP'),/unknown/); }
      else { await x.native.shutdownBluetooth(); assert.equal(x.native.accessoryConnectionOwnership(),'idle'); }
      assert.ok([...loaded].some(path => path.endsWith('/BleManager.js'))); assert.ok([...loaded].some(path => path.endsWith('/Characteristic.js')));
    } finally { await x.finish(); }
  });
  test(`installed PLX ${platform} MTU ${mtu}: native write rejection through BleError`, async () => {
    const x = await fixture(platform,mtu);
    try { await x.session.open(); await x.f.command('FAIL_FLATTEN'); await assert.rejects(x.session.request('system.ping',Uint8Array.of(1)), (error: any) => error.name === 'BleError' && error.errorCode === 401 && error.reason === 'C ATT rejection 14'); await x.session.close(); assert.equal(x.session.transportReleasePending,false); } finally { await x.finish(); }
  });
}
for (const platform of ['android','ios'] as const) for (const failure of ['event','promise','disconnect'] as const) {
  test(`installed PLX ${platform}: ${failure} error closes active session`, async () => {
    const x = await fixture(platform,23);
    try {
      await x.session.open();
      if(failure === 'event') x.emit('ReadEvent',[errorJSON(201,'monitor event failed'),null,x.transaction()]);
      else if(failure === 'promise') x.failMonitor();
      else { await x.f.command('CLOSE'); x.emit('DisconnectionEvent',[errorJSON(201,'disconnected'),x.device()]); }
      await turn(); await x.session.close(); assert.equal(x.session.state,'closed'); assert.equal(x.session.transportReleasePending,false); assert.equal(x.native.accessoryConnectionOwnership(),'idle'); assert.equal(x.listeners.get('ReadEvent')!.size,0);
    } finally { await x.finish(); }
  });
}
for (const platform of ['android','ios'] as const) test(`installed PLX ${platform}: cancel rejection retains unknown ownership until explicit retry`, async () => {
  const x = await fixture(platform,23);
  try { await x.session.open(); x.failCancel(true); await assert.rejects(x.session.close()); assert.equal(x.native.accessoryConnectionOwnership(),'unknown'); assert.equal(x.session.transportReleasePending,true); await assert.rejects(x.native.bleDriver.connect('OTHER'), /unknown/); x.failCancel(false); await x.session.close(); assert.equal(x.native.accessoryConnectionOwnership(),'idle'); assert.equal(x.session.transportReleasePending,false); } finally { x.failCancel(false); await x.finish(); }
});

for (const reverse of [false,true]) test(`installed PLX simultaneous fixtures: ${reverse ? 'reverse' : 'creation'} lazy import order stays owner-scoped`, async () => {
  // Both adapters exist before either lazy SDK import occurs. Their platforms and MTUs differ.
  const android = await fixture('android',517), ios = await fixture('ios',23);
  const order = reverse ? [ios,android] : [android,ios];
  try {
    await order[0]!.session.open(); await order[1]!.session.open();
    const results = await Promise.all([android.session.request('system.ping', Uint8Array.of(1,2)), ios.session.request('system.ping',Uint8Array.of(3,4))]);
    assert.deepEqual(results,[Uint8Array.of(1,2),Uint8Array.of(3,4)]);
    assert.ok(android.events.includes('permissions')); assert.ok(android.events.includes('mtu')); assert.equal(ios.events.includes('permissions'),false); assert.equal(ios.events.includes('mtu'),false);
    await android.session.close(); await android.native.shutdownBluetooth();
    assert.equal(ios.session.state,'open'); assert.equal(ios.native.accessoryConnectionOwnership(),'owned');
    assert.deepEqual(await ios.session.request('system.ping',Uint8Array.of(9)),Uint8Array.of(9));
    await ios.session.close(); await assert.rejects(ios.native.shutdownBluetooth(),/unacknowledged/);
    assert.equal(android.native.accessoryConnectionOwnership(),'idle'); assert.equal(ios.native.accessoryConnectionOwnership(),'unknown');
  } finally { await android.finish(); await ios.finish(); }
});

// Independent review challenges: these are synthetic scheduling choices, not native ordering evidence.
for (const platform of ['android', 'ios'] as const) {
  test(`independent installed PLX ${platform}: late error and monitor rejection cannot revive a retired session`, async () => {
    const x = await fixture(platform, 23);
    try {
      await x.session.open();
      const staleRead = [...x.listeners.get('ReadEvent')!][0]!;
      x.holdMonitorCancellation();
      await x.session.close();
      assert.equal(x.listeners.get('ReadEvent')!.size, 1);
      const beforeEvents = [...x.events];
      staleRead([errorJSON(201, 'late native event error'), null, x.transaction()]);
      x.failMonitor(); // Rejection takes a different real SDK cleanup path than resolution.
      await turn();
      assert.equal(x.listeners.get('ReadEvent')!.size, 0);
      assert.equal(x.session.state, 'closed');
      assert.equal(x.session.transportReleasePending, false);
      assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
      assert.deepEqual(x.events, beforeEvents);
    } finally { await x.finish(); }
  });
  for (const value of ['a', 'A'.repeat(688)]) test(`independent installed PLX ${platform}: invalid callback value length ${value.length} fails closed`, async () => {
    const x = await fixture(platform, 23);
    try {
      await x.session.open();
      x.emit('ReadEvent', [null, x.characteristic(AXP_NOTIFY, value), x.transaction()]);
      await turn();
      assert.equal(x.session.state, 'closed'); // Must close from the bad callback, not our cleanup.
      await x.session.close();
      assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
      assert.equal(x.session.transportReleasePending, false);
      assert.equal(x.listeners.get('ReadEvent')!.size, 0);
      assert.equal(x.events.filter(event => event === 'cancelDevice').length, 1);
    } finally { await x.finish(); }
  });
}
for (const reverse of [false, true]) test(`independent installed PLX: iOS retirement first, ${reverse ? 'reverse' : 'creation'} imports`, async () => {
  const android = await fixture('android', 517), ios = await fixture('ios', 23);
  const order = reverse ? [ios, android] : [android, ios];
  try {
    await order[0]!.session.open(); await order[1]!.session.open();
    // A transaction belonging to Android, emitted on the iOS bus, must not
    // cross into Android or pass the iOS transaction filter. Android has an
    // extra MTU operation, so these generated transaction IDs differ.
    assert.notEqual(android.transaction(), ios.transaction());
    ios.emit('ReadEvent', [errorJSON(201, 'foreign transaction'), null, android.transaction()]);
    assert.equal(ios.session.state, 'open');
    assert.equal(android.session.state, 'open');
    ios.emit('ReadEvent', [errorJSON(201, 'only iOS failed'), null, ios.transaction()]);
    await turn(); await ios.session.close();
    await assert.rejects(ios.native.shutdownBluetooth(), /unacknowledged/);
    assert.equal(ios.native.accessoryConnectionOwnership(), 'unknown');
    assert.equal(android.session.state, 'open');
    assert.equal(android.native.accessoryConnectionOwnership(), 'owned');
    assert.deepEqual(await android.session.request('system.ping', Uint8Array.of(71, 19)), Uint8Array.of(71, 19));
    await android.session.close(); await android.native.shutdownBluetooth();
    assert.equal(android.native.accessoryConnectionOwnership(), 'idle');
  } finally { await android.finish(); await ios.finish(); }
});
test('independent installed PLX: every executed published module is pinned and expected', () => {
  const pins = JSON.parse(readFileSync('tests/plx-facade-host/inputs.sha256.json', 'utf8'));
  assert.deepEqual([...loaded].map(path => path.split('/lib/module/')[1]).sort(), [
    'BleError.js', 'BleManager.js', 'BleModule.js', 'Characteristic.js', 'Descriptor.js',
    'Device.js', 'Service.js', 'TypeDefinition.js', 'Utils.js', 'index.js',
  ].sort());
  for (const path of loaded) {
    const key = 'lib/module/' + path.split('/lib/module/')[1];
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), pins[key]);
  }
});
test('independent installed PLX boundary: C notification callback gets a copy', async () => {
  let callbacks = 0;
  const f = bridge(binary, 23, bytes => { callbacks++; bytes.fill(0); });
  try {
    assert.equal((await f.command('SUBSCRIBE'))[0], 0);
    assert.equal(callbacks, 1);
    assert.deepEqual(Buffer.from(f.trace.find(event => event.origin === 'C-notification')!.value, 'hex'), Buffer.from(AXP_READY));
    await f.command('CLOSE');
  } finally { await f.dispose(); }
  assert.equal(f.trace.filter(event => event.origin === 'fixture-process-exit').length, 1);
});
test('independent installed PLX boundary: malformed C command retires owned process', { timeout: 5000 }, async () => {
  const f = bridge(binary, 23);
  await assert.rejects(f.command('INVALID'), /bridge exited/);
  await assert.rejects(f.dispose(), /bridge invariant|nonzero fixture exit/);
  const exits = f.trace.filter(event => event.origin === 'fixture-process-exit');
  assert.equal(exits.length, 1);
  assert.equal(JSON.parse(exits[0]!.value).code, 2);
});
