import test from 'node:test';
import assert from 'node:assert/strict';
import { NfcReader } from '../packages/core/nfc.ts';
import { runNfcReaderAction } from '../src/nfc-reader-action.ts';
import { createNfcSessionController } from '../packages/core/nfc-session.ts';
import type { NfcSessionApi } from '../packages/core/nfc-session.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const status = async () => ({ available: true, enabled: true, platform: 'ios' as const });
const callbacks = { onTag: () => {}, onError: () => {} };

test('NFC pending status stays stopping until settlement and does not begin', async () => {
  const gate = deferred<Awaited<ReturnType<typeof status>>>(); let began = false;
  const reader = new NfcReader({ status: () => gate.promise, begin: async () => { began = true; return async () => {}; } }, callbacks);
  const opening = reader.start(); await tick();
  const stopping = reader.stop(); let settled = false; void stopping.then(() => { settled = true; });
  await tick(); assert.equal(reader.state, 'stopping'); assert.equal(settled, false);
  await assert.rejects(reader.start(), /already active/);
  gate.resolve(await status()); await Promise.all([opening, stopping]);
  assert.equal(began, false); assert.equal(reader.state, 'idle');
});

test('NFC pending begin drops tags after stop and retries a failed cleanup without idle', async () => {
  const gate = deferred<() => Promise<void>>(); let tag = (_raw: unknown) => {}; let stops = 0; let tags = 0;
  const reader = new NfcReader({ status, begin: async onTag => { tag = onTag; return gate.promise; } }, { ...callbacks, onTag: () => { tags++; } });
  const opening = reader.start(); await tick(); const stopping = reader.stop();
  const rejection = assert.rejects(stopping, /unregister failed/);
  tag({}); assert.equal(tags, 0); assert.equal(reader.state, 'stopping');
  gate.resolve(async () => { if (++stops === 1) throw new Error('unregister failed'); });
  await opening; await rejection;
  assert.equal(stops, 1); assert.equal(reader.state, 'stopping'); await assert.rejects(reader.start(), /already active/);
  await reader.stop(); assert.equal(stops, 2); assert.equal(reader.state, 'idle');
});

test('NFC synchronous SessionClosed cannot expose idle until begin has settled', async () => {
  const gate = deferred<() => Promise<void>>(); let beginnings = 0; let stopCalls = 0;
  const states: string[] = []; let replacement: Promise<void> | undefined;
  const reader = new NfcReader({ status, begin: async (_tag, closed) => {
    if (++beginnings === 1) { closed(); return gate.promise; }
    return async () => {};
  } }, { ...callbacks, onState: state => { states.push(state); if (state === 'idle' && beginnings === 1) replacement = reader.start(); } });
  const opening = reader.start(); await tick();
  assert.equal(reader.state, 'starting'); await assert.rejects(reader.start(), /already active/);
  gate.resolve(async () => { stopCalls++; }); await opening; await replacement;
  assert.equal(reader.state, 'reading'); assert.equal(stopCalls, 1);
  assert.deepEqual(states, ['starting', 'idle', 'starting', 'reading']); await reader.stop();
});

test('NFC reentrant starting callback queues stop after its own start', async () => {
  let began = false; let stopping: Promise<void> | undefined;
  const reader = new NfcReader({ status, begin: async () => { began = true; return async () => {}; } }, { ...callbacks, onState: state => { if (state === 'starting') stopping = reader.stop(); } });
  await reader.start(); await stopping; assert.equal(began, false); assert.equal(reader.state, 'idle');
});

test('NFC session closure confirms release after cleanup failure and drops stale callbacks', async () => {
  let closed = (_error?: Error) => {}; const tags: unknown[] = []; let tag = (_raw: unknown) => {};
  const reader = new NfcReader({ status, begin: async (onTag, onClosed) => { tag = onTag; closed = onClosed; return async () => { throw Error('uncertain'); }; } }, { ...callbacks, onTag: value => tags.push(value) });
  await reader.start(); const oldTag = tag; const oldClosed = closed;
  await assert.rejects(reader.stop(), /uncertain/); assert.equal(reader.state, 'stopping');
  oldClosed(); assert.equal(reader.state, 'idle'); await reader.start();
  oldTag({}); oldClosed(); assert.equal(reader.state, 'reading'); assert.equal(tags.length, 0);
  closed();
});

function sdk() {
  let tag: ((raw: unknown) => void) | null = null; let closed: ((error?: Error) => void) | null = null;
  let registers = 0; let unregisters = 0;
  const api: NfcSessionApi = {
    setTagListener: value => { tag = value; }, setClosedListener: value => { closed = value; },
    register: async () => { registers++; }, unregister: async () => { unregisters++; }, isUserCancel: () => false,
  };
  return { api, controller: createNfcSessionController(async () => api), tag: () => tag, closed: () => closed, counts: () => ({ registers, unregisters }) };
}

test('native controller rejects competing begin before replacing singleton listeners', async () => {
  const s = sdk(); let tags = 0; const stop = await s.controller.begin(() => { tags++; }, () => {});
  const listener = s.tag(); await assert.rejects(s.controller.begin(() => {}, () => {}), /already active/);
  assert.equal(s.tag(), listener); listener!({}); assert.equal(tags, 1); assert.equal(s.counts().registers, 1);
  await stop(); assert.equal(s.tag(), null); assert.equal(s.closed(), null);
});

test('native controller retains ownership across failed unregister and retries explicitly', async () => {
  const s = sdk(); let attempts = 0; let tags = 0;
  s.api.unregister = async () => { if (++attempts === 1) throw Error('uncertain'); };
  const stop = await s.controller.begin(() => { tags++; }, () => {});
  await assert.rejects(stop(), /uncertain/); assert.notEqual(s.closed(), null); s.tag()!({}); assert.equal(tags, 0);
  await assert.rejects(s.controller.begin(() => {}, () => {}), /already active/);
  await stop(); assert.equal(attempts, 2); assert.equal(s.closed(), null);
  const next = await s.controller.begin(() => {}, () => {}); await stop(); assert.notEqual(s.tag(), null); await next();
});

test('native synchronous closure reserves lease through pending registration', async () => {
  const s = sdk(); const gate = deferred<void>(); let closes = 0;
  s.api.register = async () => { s.closed()!(); await gate.promise; };
  const opening = s.controller.begin(() => {}, () => { closes++; }); await tick();
  await assert.rejects(s.controller.begin(() => {}, () => {}), /already active/);
  assert.equal(closes, 1); gate.resolve(); const stop = await opening; await stop();
  assert.equal(s.counts().unregisters, 0); assert.equal(s.tag(), null);
});

test('native late old callbacks cannot clear replacement after unregister settles', async () => {
  const s = sdk(); const gate = deferred<void>(); s.api.unregister = () => gate.promise;
  const stop = await s.controller.begin(() => {}, () => {}); const oldClosed = s.closed()!; const oldTag = s.tag()!;
  const stopping = stop(); await tick(); oldClosed();
  await assert.rejects(s.controller.begin(() => {}, () => {}), /already active/);
  assert.equal(stop(), stopping); gate.resolve(); await stopping;
  let tags = 0; let closes = 0;
  const nextStop = await s.controller.begin(() => { tags++; }, () => { closes++; });
  const currentTag = s.tag(); oldClosed(Error('stale')); oldTag({});
  assert.equal(s.tag(), currentTag); assert.equal(tags, 0); assert.equal(closes, 0);
  currentTag!({}); assert.equal(tags, 1); await nextStop();
});

test('native failed registration and SDK load release the lease for a later start', async () => {
  const s = sdk(); s.api.register = async () => { throw Error('registration failed'); };
  await assert.rejects(s.controller.begin(() => {}, () => {}), /registration failed/); assert.equal(s.tag(), null);
  s.api.register = async () => {}; const stop = await s.controller.begin(() => {}, () => {}); await stop();
  let loads = 0; const controller = createNfcSessionController(async () => { if (++loads === 1) throw Error('load failed'); return s.api; });
  await assert.rejects(controller.begin(() => {}, () => {}), /load failed/); await (await controller.begin(() => {}, () => {}))();
});

test('reader and native controller keep failed stop recoverable and confirm close before reuse', async () => {
  const s = sdk(); let attempts = 0; const errors: string[] = [];
  s.api.unregister = async () => { attempts++; throw Error('uncertain unregister'); };
  const reader = new NfcReader({ status, begin: s.controller.begin }, { ...callbacks, onError: error => errors.push(error.message) });
  await reader.start(); const oldClosed = s.closed()!;
  await assert.rejects(reader.stop(), /uncertain unregister/); assert.equal(reader.state, 'stopping');
  await assert.rejects(reader.stop(), /uncertain unregister/); assert.equal(attempts, 2); assert.equal(reader.state, 'stopping');
  oldClosed(); assert.equal(reader.state, 'idle');
  await reader.start(); oldClosed(Error('stale error')); assert.deepEqual(errors, []); assert.equal(reader.state, 'reading');
  s.closed()!(); assert.equal(reader.state, 'idle');
});

test('native user cancellation closes without surfacing an error', async () => {
  const s = sdk(); const cancel = Error('user cancel'); s.api.isUserCancel = error => error === cancel;
  let reported: Error | undefined = Error('not closed');
  const stop = await s.controller.begin(() => {}, error => { reported = error; });
  s.closed()!(cancel); assert.equal(reported, undefined); await stop(); assert.equal(s.counts().unregisters, 0);
});

test('native concurrent cleanup shares one unregister attempt', async () => {
  const s = sdk(); const gate = deferred<void>(); let attempts = 0;
  s.api.unregister = async () => { attempts++; await gate.promise; };
  const stop = await s.controller.begin(() => {}, () => {});
  const first = stop(); assert.equal(stop(), first); await tick(); assert.equal(attempts, 1);
  gate.resolve(); await first; await stop(); assert.equal(attempts, 1);
});

test('cancelled rejected status cannot strand the reader or overwrite a reentrant next start', async () => {
  const gate = deferred<Awaited<ReturnType<typeof status>>>(); let statuses = 0; let replacement: Promise<void> | undefined;
  const reader = new NfcReader({ status: () => ++statuses === 1 ? gate.promise : status(), begin: async () => async () => {} }, { ...callbacks, onState: state => { if (state === 'idle' && statuses === 1) replacement = reader.start(); } });
  const opening = reader.start(); const rejection = assert.rejects(opening, /status failed/); await tick();
  const stopping = reader.stop(); gate.reject(Error('status failed')); await rejection; await stopping; await replacement;
  assert.equal(reader.state, 'reading'); await reader.stop();
});

test('iOS unregister completion alone cannot release listeners before its final global close event', async () => {
  const s = sdk(); s.api.requiresClosedEvent = true;
  const reader = new NfcReader({ status, begin: s.controller.begin }, callbacks);
  await reader.start(); let settled = false; const stopping = reader.stop(); void stopping.then(() => { settled = true; });
  await tick(); assert.equal(settled, false); assert.equal(reader.state, 'stopping');
  await assert.rejects(s.controller.begin(() => {}, () => {}), /already active/);
  s.closed()!(); await stopping; assert.equal(reader.state, 'idle'); assert.equal(settled, true);
  await reader.start(); assert.equal(reader.state, 'reading'); s.closed()!();
});

test('iOS close event waits for pending unregister, then consumes its late rejection', async () => {
  const s = sdk(); s.api.requiresClosedEvent = true; const gate = deferred<void>(); s.api.unregister = () => gate.promise;
  const stop = await s.controller.begin(() => {}, () => {}); const stopping = stop(); await tick();
  s.closed()!(); await assert.rejects(s.controller.begin(() => {}, () => {}), /already active/);
  assert.equal(stop(), stopping); gate.reject(Error('late unregister rejection')); await stopping;
  const nextStop = await s.controller.begin(() => {}, () => {}); s.closed()!(); await nextStop();
});

for (const requiresClosedEvent of [true, false]) test(`reader remains stopping after closure while unregister never settles (iOS event requirement: ${requiresClosedEvent})`, async () => {
  const s = sdk(); s.api.requiresClosedEvent = requiresClosedEvent;
  const never = new Promise<void>(() => {}); s.api.unregister = () => never;
  const reader = new NfcReader({ status, begin: s.controller.begin }, callbacks);
  await reader.start(); const stopping = reader.stop(); let settled = false; void stopping.then(() => { settled = true; });
  await tick(); s.closed()!(); await tick();
  assert.equal(reader.state, 'stopping'); assert.equal(settled, false); assert.equal(reader.stop(), stopping);
  await assert.rejects(reader.start(), /already active/);
  await assert.rejects(s.controller.begin(() => {}, () => {}), /already active/);
  // Deliberately do not settle unregister: closure cannot make this queue reusable.
});

test('reader can restart after close and pending unregister both settle', async () => {
  const s = sdk(); s.api.requiresClosedEvent = true; const gate = deferred<void>(); s.api.unregister = () => gate.promise;
  const reader = new NfcReader({ status, begin: s.controller.begin }, callbacks);
  await reader.start(); const stopping = reader.stop(); await tick(); s.closed()!();
  assert.equal(reader.state, 'stopping'); await assert.rejects(reader.start(), /already active/);
  gate.resolve(); await stopping; assert.equal(reader.state, 'idle');
  await reader.start(); assert.equal(reader.state, 'reading'); s.closed()!();
});

test('App NFC action stops pending startup outside run without releasing its busy lock', async () => {
  const gate = deferred<() => Promise<void>>(); let cleanupCalls = 0; let lock = false; let busy = false;
  let notice: string | null = null; let unrelatedActions = 0;
  const run = async (action: () => Promise<void>) => {
    if (lock) return;
    lock = true; busy = true; notice = null;
    try { await action(); }
    catch (error) { notice = String(error); }
    finally { lock = false; busy = false; }
  };
  const reader = new NfcReader({ status, begin: () => gate.promise }, callbacks);
  const onStopError = (error: unknown) => { notice = String(error); };
  const starting = runNfcReaderAction(reader, run, onStopError); await tick();
  assert.equal(lock, true); assert.equal(busy, true);
  // This is the same action dispatcher used by App's Stop button.
  const stopping = runNfcReaderAction(reader, run, onStopError);
  assert.equal(reader.state, 'stopping'); assert.equal(lock, true); assert.equal(busy, true);
  await run(async () => { unrelatedActions++; }); assert.equal(unrelatedActions, 0);
  gate.resolve(async () => { cleanupCalls++; throw Error('stop uncertain'); });
  await Promise.all([starting, stopping]);
  assert.equal(cleanupCalls, 1); assert.equal(lock, false); assert.equal(busy, false);
  assert.match(notice!, /stop uncertain/); assert.equal(reader.state, 'stopping');
  const nextGate = deferred<void>(); const next = run(() => nextGate.promise);
  await runNfcReaderAction(reader, run, onStopError);
  assert.equal(lock, true); assert.equal(busy, true); assert.match(notice!, /stop uncertain/);
  nextGate.resolve(); await next;
});
