// Actual App handlers -> native TypeScript adapter -> installed PLX -> C callbacks.
// RN/native events, promises and ordering are synthetic, not phone acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './support/app-acquisition.ts';
import { fixture } from './plx-facade-host/fixture.ts';
import { BleTransport } from '../packages/core/ble-transport.ts';
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function background(h: ReturnType<typeof harness>) {
  h.env.AppState.currentState = 'background'; h.env.foreground.current = false;
  h.suspendNativeSession!();
}
function resume(h: ReturnType<typeof harness>) {
  h.env.AppState.currentState = 'active'; h.env.foreground.current = true;
}
for (const platform of ['android', 'ios'] as const) {
  for (const phase of ['connect', 'discover', 'monitor-ready', 'write']) {
    test(`native background + installed PLX ${platform}: cancel held ${phase} across fast resume`, { timeout: 10000 }, async () => {
      const x = await fixture(platform, 23), h = harness(), gate = x.hold(phase);
      let selected: typeof x.session | undefined;
      try {
        const work = h.run(() => h.connect(x.transport)); await gate.entered;
        selected = h.env.session.current!;
        const before = [...x.events]; background(h); background(h); resume(h);
        const attempt = h.env.acquisition.current; assert.equal(attempt.cancelled, true);
        gate.release(); await work; await turn();
        assert.equal(selected.state, 'closed'); assert.equal(h.env.lock.current, false);
        assert.equal(h.writes.some(values => String(values).includes('Connected:')), false);
        const effects = ['connect', 'discover', 'mtu', 'characteristics', 'monitor-ready', 'write'];
        assert.deepEqual(x.events.slice(before.length).filter(event => effects.includes(event)), []);
        assert.equal(x.f.trace.filter(event => event.origin === 'plx-client-write').length, phase === 'write' ? 1 : 0);
        const uncertain = phase === 'connect' || phase === 'discover';
        assert.equal(selected.transportReleasePending, uncertain);
        assert.equal(h.env.session.current, uncertain ? selected : null);
        const events = [...x.events]; background(h); resume(h); await turn();
        assert.deepEqual(x.events, events, 'repeated background must not retry uncertain release');
      } finally { gate.release(); await x.finish(selected, selected?.transportReleasePending ?? false); }
    });
  }
  test(`native background + installed PLX ${platform}: open-session release fences resumed actions`, { timeout: 10000 }, async () => {
    const x = await fixture(platform, 23), h = harness();
    let selected: typeof x.session | undefined;
    const close = x.hold('cancelDevice');
    try {
      await h.run(() => h.connect(x.transport)); selected = h.env.session.current!;
      background(h); await close.entered; background(h);
      assert.equal(selected.state, 'closed'); assert.ok(h.env.nativeBackground.current.pending);
      resume(h); const events = [...x.events];
      await h.run(() => h.connect(new BleTransport(x.native.bleDriver, 'AXP')));
      assert.deepEqual(x.events, events);
      close.release(); await h.env.nativeBackground.current.pending;
      assert.equal(h.env.session.current, null); assert.equal(selected.transportReleasePending, false);
      assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
      assert.equal(x.events.filter(event => event === 'cancelDevice').length, 1);
      assert.equal(x.f.trace.filter(event => event.origin === 'plx-client-write').length, 2);
    } finally { close.release(); await x.finish(selected, selected?.transportReleasePending ?? false); }
  });
  test(`native background + installed PLX ${platform}: failed release needs explicit cleanup retry`, { timeout: 10000 }, async () => {
    const x = await fixture(platform, 23), h = harness();
    let selected: typeof x.session | undefined;
    try {
      await h.run(() => h.connect(x.transport)); selected = h.env.session.current!;
      x.failCancel(true); background(h); await h.env.nativeBackground.current.pending;
      assert.equal(selected.transportReleasePending, true); assert.equal(h.env.session.current, selected);
      assert.equal(x.native.accessoryConnectionOwnership(), 'unknown');
      resume(h); background(h); resume(h); await turn();
      assert.equal(x.events.filter(event => event === 'cancelDevice').length, 1);
      x.failCancel(false); await h.run(h.disconnect);
      assert.equal(h.env.session.current, null); assert.equal(selected.transportReleasePending, false);
      assert.equal(x.events.filter(event => event === 'cancelDevice').length, 2);
    } finally { x.failCancel(false); await x.finish(selected, selected?.transportReleasePending ?? false); }
  });
  test(`native background + installed PLX ${platform}: Ping lock cannot prevent cleanup or permit a new action`, { timeout: 10000 }, async () => {
    const x = await fixture(platform, 23), h = harness();
    let selected: typeof x.session | undefined;
    let write: ReturnType<typeof x.hold> | undefined, close: ReturnType<typeof x.hold> | undefined;
    try {
      await h.run(() => h.connect(x.transport)); selected = h.env.session.current!;
      write = x.hold('write'); close = x.hold('cancelDevice');
      const ping = h.run(async () => { await selected!.request('system.ping', Uint8Array.of(1, 255)); });
      await write.entered; background(h); await ping;
      assert.equal(selected.state, 'closed'); assert.equal(h.env.lock.current, false);
      assert.ok(h.env.nativeBackground.current.pending); assert.equal(x.events.includes('cancelDevice'), false);
      resume(h); let dispatched = false;
      await h.run(async () => { dispatched = true; }); assert.equal(dispatched, false);
      write.release(); await close.entered;
      await h.run(async () => { dispatched = true; }); assert.equal(dispatched, false);
      close.release(); await h.env.nativeBackground.current.pending;
      assert.equal(h.env.session.current, null); assert.equal(x.native.accessoryConnectionOwnership(), 'idle');
      assert.equal(x.f.trace.filter(event => event.origin === 'plx-client-write').length, 3);
      assert.equal(x.events.filter(event => event === 'cancelDevice').length, 1);
    } finally { write?.release(); close?.release(); await x.finish(selected, selected?.transportReleasePending ?? false); }
  });
}
