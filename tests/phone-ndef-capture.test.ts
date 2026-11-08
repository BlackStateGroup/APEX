import test from 'node:test';
import { updatePhoneNdefLifecycle } from '../src/phone-ndef-lifecycle.ts';
import assert from 'node:assert/strict';
import { PhoneNdefCapture } from '../packages/core/phone-ndef-capture.ts';
import { createNfcSessionController } from '../packages/core/nfc-session.ts';
import type { NfcBackend } from '../packages/core/nfc.ts';
import { initialPhoneNdefWorkbench, phoneNdefWorkbenchReducer as reduce } from '../src/phone-ndef-workbench.ts';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve!: () => void, reject!: (e: Error) => void; const promise = new Promise<void>((r,j) => { resolve=r; reject=j; }); return { promise, resolve, reject }; }
const raw = () => ({ id: 'TAG-NOT-RETAINED', tech: 'NFC', ndefMessage: [{ tnf: 2, type: [120], id: 'Aa', payload: [1,2,3] }] });
function harness(options: { status?: Promise<void>; begin?: Promise<void>; stop?: () => Promise<void>; clock?: () => number; receiptClock?: () => number } = {}) {
  const callbacks: ((r: unknown) => void)[] = []; let stops = 0; let now = 0; let timer: (() => void) | null = null;
  const backend: NfcBackend = { status: async () => { await options.status; return { available: true, enabled: true, platform: 'android' }; }, begin: async cb => { callbacks.push(cb); await options.begin; return async () => { stops++; await options.stop?.(); }; } };
  const reader = new PhoneNdefCapture(backend, () => {}, options.clock ?? (() => now), ((fn: () => void) => { timer=fn; return 1; }) as unknown as typeof setTimeout, (() => { timer=null; }) as typeof clearTimeout, options.receiptClock ?? (() => 0));
  return { reader, callbacks, stops: () => stops, advanceWithoutDispatch: () => { now=30000; }, expire: () => { now=30000; timer?.(); } };
}
test('one callback snapshots exact selected fields synchronously, waits for cleanup, never retains tag identity', async () => {
  const stop = deferred(), h = harness({ stop: () => stop.promise }); await h.reader.start(); const tag=raw(); h.callbacks[0]!(tag); tag.ndefMessage[0]!.payload[0]=99; h.callbacks[0]!(raw());
  assert.equal(h.reader.inspect(), null); assert.equal(h.reader.state.phase, 'stopping'); await tick(); assert.equal(h.stops(), 1);
  stop.resolve(); await tick(); const result=h.reader.inspect()!; assert.equal(result.receivedAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(JSON.parse(result.document).snapshot, { ndefMessage: raw().ndefMessage }); assert.ok(!result.document.includes('TAG-NOT')); assert.equal(result.expectedPlatform, 'android');
});
for (const [name, value] of [['missing', {}], ['empty-array', { ndefMessage: [] }], ['null', { ndefMessage: null }]] as const) test(`honest unavailable ${name}`, async () => { const h=harness(); await h.reader.start(); h.callbacks[0]!(value); await tick(); assert.equal(h.reader.inspect(), null); assert.match(h.reader.state.message, new RegExp(name)); assert.equal(h.stops(), 1); });
for (const value of [{ ndefMessage: [{ tnf: 6 }] }, { ndefMessage: [{ tnf: 2, type: [120], payload: Array(8193).fill(1) }] }]) test('invalid/oversize rejected whole and closed', async () => { const h=harness(); await h.reader.start(); h.callbacks[0]!(value); await tick(); assert.match(h.reader.state.message, /rejected without truncation/); assert.equal(h.reader.inspect(), null); assert.equal(h.stops(), 1); });
test('deadline includes status preparation and cannot falsely release pending startup', async () => { const status=deferred(), h=harness({ status: status.promise }); const start=h.reader.start(); h.expire(); assert.equal(h.reader.state.phase,'stopping'); await assert.rejects(h.reader.start()); assert.equal(h.callbacks.length,0); status.resolve(); await start; await tick(); assert.equal(h.reader.state.phase,'idle'); });
test('cancel pending begin suppresses callbacks, duplicate stop shares cleanup and late start failure releases honestly', async () => { const begin=deferred(), h=harness({ begin: begin.promise }); const start=h.reader.start(); await tick(); const a=h.reader.cancel(), b=h.reader.stopOrCancel(); h.callbacks[0]!(raw()); assert.equal(h.reader.inspect(),null); begin.reject(new Error('late registration failure')); await Promise.all([start,a,b]); assert.equal(h.reader.state.phase,'idle'); assert.equal(h.reader.inspect(),null); });
for (const reason of ['Foreground left', 'Devices tab left', 'unmount']) test(`${reason} suppresses old callbacks across restart`, async () => { const h=harness(); await h.reader.start(); await h.reader.cancel(reason); await h.reader.start(); h.callbacks[0]!(raw()); assert.equal(h.reader.state.phase,'reading'); h.callbacks[1]!(raw()); await tick(); assert.ok(h.reader.inspect()); });
test('failed cleanup retains ownership and capture; explicit Stop retries without restarting', async () => { let fail=true; const h=harness({ stop: async () => { if(fail) throw new Error('unregister'); } }); await h.reader.start(); await assert.rejects(h.reader.start()); h.callbacks[0]!(raw()); await tick(); assert.equal(h.reader.state.phase,'stopping'); assert.equal(h.reader.inspect(),null); await assert.rejects(h.reader.start()); fail=false; await h.reader.stopOrCancel(); assert.ok(h.reader.inspect()); assert.equal(h.stops(),2); });
test('deadline callback boundary rejects after window even before timer dispatch', async () => { const h=harness(); await h.reader.start(); h.advanceWithoutDispatch(); assert.equal(h.reader.state.phase,'reading'); h.callbacks[0]!(raw()); await tick(); assert.equal(h.reader.inspect(),null); assert.match(h.reader.state.message,/deadline/); assert.equal(h.stops(),1); });
test('handoff exact document/platform replaces draft but never interprets; stale save cannot restore findings', async () => { const h=harness(); await h.reader.start(); h.callbacks[0]!(raw()); await tick(); const result=h.reader.inspect()!;
 let state=reduce(initialPhoneNdefWorkbench,{ type:'edit', document:result.document, expectedPlatform:result.expectedPlatform }); assert.equal(state.observation,null); assert.equal(state.saveInput,null); assert.equal(state.document,result.document);
 state=reduce(state,{type:'interpret'}); state=reduce(state,{type:'save-start'}); const rev=state.revision; state=reduce(state,{type:'edit',document:'new draft'}); state=reduce(state,{type:'save-finish',revision:rev,document:result.document}); assert.equal(state.document,'new draft'); assert.equal(state.observation,null); assert.equal(state.pending,null);
});
test('mock native singleton remains owned through iOS close and pending unregister', async () => { let tag: ((r: unknown)=>void)|null=null, closed: (()=>void)|null=null; const stop=deferred(); const sessions=createNfcSessionController(async()=>({setTagListener: cb=>{tag=cb;},setClosedListener: cb=>{closed=cb;},register:async()=>{},unregister:()=>stop.promise,isUserCancel:()=>false,requiresClosedEvent:true})); const reader=new PhoneNdefCapture({status:async()=>({available:true,enabled:true,platform:'ios'}),begin:sessions.begin},()=>{}); await reader.start(); (tag! as (r:unknown)=>void)({ndefMessage:[{tnf:2,type:[120],id:[],payload:[1]}]}); await tick(); (closed! as ()=>void)(); assert.equal(reader.state.phase,'stopping'); assert.equal(reader.inspect(),null); await assert.rejects(sessions.begin(()=>{},()=>{})); stop.resolve(); await tick(); assert.ok(reader.inspect()); });
test('successful late startup after cancel must clean up before release', async () => { const begin=deferred(), stop=deferred(), h=harness({begin:begin.promise,stop:()=>stop.promise}); const start=h.reader.start(); await tick(); const cancel=h.reader.cancel(); begin.resolve(); await start; await tick(); assert.equal(h.reader.state.phase,'stopping'); assert.equal(h.stops(),1); h.callbacks[0]!(raw()); assert.equal(h.reader.inspect(),null); stop.resolve(); await cancel; assert.equal(h.reader.state.phase,'idle'); });
test('late status failure after deadline never enables inspect', async () => { const status=deferred(), h=harness({status:status.promise}); const start=h.reader.start(); h.expire(); status.reject(new Error('status failed')); await start; await tick(); assert.equal(h.reader.state.phase,'idle'); assert.equal(h.reader.inspect(),null); });
test('web refuses before native begin', async () => { let began=false; const h=new PhoneNdefCapture({status:async()=>({available:true,enabled:true,platform:'web'}),begin:async()=>{began=true;return async()=>{};}},()=>{}); await h.start(); assert.equal(began,false); assert.equal(h.state.phase,'idle'); assert.match(h.state.message,/unavailable on web/); });

test('inactive to active during pending preparation preserves read; background cancels with no automatic restart', async () => {
  const status=deferred(), h=harness({status:status.promise}); const start=h.reader.start();
  assert.equal(updatePhoneNdefLifecycle('inactive',h.reader),false);
  assert.equal(h.reader.state.phase,'starting');
  assert.equal(updatePhoneNdefLifecycle('active',h.reader),true);
  assert.equal(h.reader.state.phase,'starting');
  assert.equal(h.stops(),0);
  assert.equal(updatePhoneNdefLifecycle('background',h.reader),false);
  assert.equal(h.reader.state.phase,'stopping');
  assert.equal(updatePhoneNdefLifecycle('active',h.reader),true);
  assert.equal(h.reader.state.phase,'stopping');
  status.resolve(); await start; await tick();
  assert.equal(h.reader.state.phase,'idle'); assert.equal(h.callbacks.length,0);
  updatePhoneNdefLifecycle('active',h.reader); await tick();
  assert.equal(h.reader.state.phase,'idle'); assert.equal(h.callbacks.length,0);
});
test('inactive to active allows already-pending preparation to complete normally', async () => {
  const status=deferred(), h=harness({status:status.promise}); const start=h.reader.start();
  updatePhoneNdefLifecycle('inactive',h.reader); updatePhoneNdefLifecycle('active',h.reader);
  status.resolve(); await start; assert.equal(h.reader.state.phase,'reading');
  h.callbacks[0]!(raw()); await tick(); assert.ok(h.reader.inspect());
});

for (const wall of [-1000000000000, 1000000000000]) test(`wall clock change to ${wall} does not extend the monotonic acceptance window`, async () => {
  let receipt = 0; const h=harness({receiptClock:()=>receipt}); await h.reader.start();
  receipt=wall; h.advanceWithoutDispatch(); h.callbacks[0]!(raw()); await tick();
  assert.equal(h.reader.inspect(),null); assert.match(h.reader.state.message,/deadline/); assert.equal(h.stops(),1);
});
test('valid wall time is retained separately from monotonic elapsed time', async () => {
  const receipt=Date.parse('2026-11-08T12:34:56.789Z'); const h=harness({clock:()=>1234,receiptClock:()=>receipt});
  await h.reader.start(); h.callbacks[0]!(raw()); await tick(); assert.equal(h.reader.inspect()!.receivedAt,'2026-11-08T12:34:56.789Z');
});
for (const receipt of [NaN, Infinity, 8640000000000001]) test(`invalid receipt ${receipt} rejects and releases ownership safely`, async () => {
  const stop=deferred(), h=harness({receiptClock:()=>receipt,stop:()=>stop.promise}); await h.reader.start();
  assert.doesNotThrow(()=>h.callbacks[0]!(raw())); await tick(); assert.equal(h.reader.state.phase,'stopping');
  assert.equal(h.reader.inspect(),null); await assert.rejects(h.reader.start());
  stop.resolve(); await tick(); assert.equal(h.reader.state.phase,'idle'); assert.equal(h.stops(),1); assert.match(h.reader.state.message,/Invalid app receipt/);
});
test('throwing receipt clock also cleans up', async () => {
  const h=harness({receiptClock:()=>{throw new Error('clock unavailable');}}); await h.reader.start();
  assert.doesNotThrow(()=>h.callbacks[0]!(raw())); await tick(); assert.equal(h.reader.state.phase,'idle'); assert.equal(h.stops(),1); assert.equal(h.reader.inspect(),null);
});
for (const bad of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER]) test(`invalid monotonic start ${bad} acquires no lease`, async () => {
  const h=harness({clock:()=>bad}); await h.reader.start(); assert.equal(h.reader.state.phase,'idle'); assert.equal(h.callbacks.length,0); assert.match(h.reader.state.message,/start refused/);
});
for (const bad of [NaN, Infinity, 99]) test(`invalid or backwards callback clock ${bad} refuses and releases`, async () => {
  let clock=100; const h=harness({clock:()=>clock}); await h.reader.start(); clock=bad; h.callbacks[0]!(raw()); await tick();
  assert.equal(h.reader.state.phase,'idle'); assert.equal(h.stops(),1); assert.equal(h.reader.inspect(),null); assert.match(h.reader.state.message,/monotonic observation clock/);
});
