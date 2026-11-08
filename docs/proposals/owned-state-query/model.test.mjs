// Original executable design model. Not the adapter or a native-release proof.
import test from 'node:test';
import assert from 'node:assert/strict';
class Model {
  pending = false; reserved = false; unknown = false; lost = false;
  result = null; decision = null; eventSeen = false; cancelled = false;
  destroyed = false; acquisitions = 0; cleanupCalls = 0; ownedCancels = 0;
  begin() { if (this.reserved || this.pending || this.unknown || this.lost || this.destroyed) throw Error('busy'); this.reserved = true; }
  dispatch() { if (this.result || this.cancelled || this.decision) return; this.pending = true; }
  event(s) { this.eventSeen = true; this.select(s); }
  select(s) {
    if (this.result || this.decision) return;
    if (s === 'PoweredOn') this.decision = { ok: true };
    else if (['PoweredOff', 'Unauthorized', 'Unsupported'].includes(s)) this.decision = { ok: false, value: s };
    this.drain();
  }
  query(ok, value) {
    assert.equal(this.pending, true); this.pending = false;
    if (!this.result && !this.decision) {
      if (!ok) this.decision = { ok: false, value };
      else if (!this.eventSeen) this.select(value);
    }
    this.drain();
  }
  syncThrow(value) { this.pending = false; this.unknown = true; this.complete(false, value); }
  abort() { this.cancelled = true; this.complete(false, 'cancelled'); }
  timeout() { this.complete(false, 'timeout'); }
  drain() { if (this.decision && (!this.decision.ok || !this.pending)) this.complete(this.decision.ok, this.decision.value); }
  complete(ok, value) { if (this.result) return; ++this.cleanupCalls; this.result = { ok: ok && !this.lost && !this.unknown, value }; this.reserved = false; }
  acquire() { if (!this.result?.ok || this.cancelled || this.pending || this.unknown || this.lost || this.destroyed) throw Error('fenced'); ++this.acquisitions; }
  destroy() { if (this.pending || this.reserved || this.unknown || this.lost) throw Error('fenced'); this.destroyed = true; }
  cancelOwned() { ++this.ownedCancels; }
}
function pending() { const m = new Model(); m.begin(); m.dispatch(); return m; }
for (const terminal of ['abort', 'timeout']) for (const ok of [true, false]) test(`${terminal} remains responsive and late ${ok ? 'success' : 'error'} only drains`, () => {
  const m = pending(); m[terminal](); const result = m.result;
  assert.equal(m.pending, true); assert.throws(() => m.begin()); assert.throws(() => m.destroy());
  m.cancelOwned(); m.query(ok, ok ? 'PoweredOn' : Error('late'));
  assert.equal(m.result, result); assert.equal(m.cleanupCalls, 1); assert.equal(m.ownedCancels, 1);
  assert.throws(() => m.acquire()); m.destroy();
});
for (const ok of [true, false]) test(`PoweredOff wins late query ${ok}`, () => {
  const m = pending(); m.event('PoweredOff'); const result = m.result;
  assert.equal(result.ok, false); m.query(ok, ok ? 'PoweredOn' : Error('late'));
  assert.equal(m.result, result); assert.equal(m.cleanupCalls, 1);
});
for (const ok of [true, false]) test(`PoweredOn freezes readiness but waits for query ${ok}`, () => {
  const m = pending(); m.event('PoweredOn'); assert.equal(m.result, null);
  assert.throws(() => m.acquire()); assert.throws(() => m.destroy());
  m.query(ok, ok ? 'PoweredOff' : Error('late')); assert.equal(m.result.ok, true); m.acquire();
});
for (const action of ['abort', 'timeout']) test(`ready plus ${action} vetoes preparation while query pending`, () => {
  const m = pending(); m.event('PoweredOn'); m[action]();
  assert.equal(m.decision.ok, true); assert.equal(m.result.ok, false);
  m.query(true, 'PoweredOn'); assert.throws(() => m.acquire());
});
test('newer nonterminal event suppresses stale snapshot', () => {
  const m = pending(); m.event('Resetting'); m.query(true, 'PoweredOn');
  assert.equal(m.result, null); m.event('PoweredOn'); assert.equal(m.result.ok, true);
});
test('query failure without terminal event keeps exact falsy identity', () => {
  for (const error of [undefined, null, false, 0, '']) {
    const m = pending(); m.event('Unknown'); m.query(false, error);
    assert.equal(m.result.ok, false); assert.equal(m.result.value, error);
  }
});
test('query first wins later event', () => {
  const m = pending(); m.query(true, 'PoweredOff'); const result = m.result;
  m.event('PoweredOn'); assert.equal(m.result, result);
});
test('synchronous ready registration avoids dispatch', () => {
  const m = new Model(); m.begin(); m.event('PoweredOn'); m.dispatch();
  assert.equal(m.pending, false); assert.equal(m.result.ok, true);
});
test('synchronous dispatch throw cannot imply native release', () => {
  const m = pending(); m.syncThrow(undefined); assert.equal(m.result.value, undefined);
  assert.equal(m.unknown, true); assert.throws(() => m.destroy()); assert.throws(() => m.begin()); m.cancelOwned();
});
test('lost cleanup latch survives query drainage', () => {
  const m = pending(); m.lost = true; m.abort(); m.query(true, 'PoweredOn');
  assert.equal(m.lost, true); assert.throws(() => m.destroy()); assert.throws(() => m.begin());
});
test('reservation blocks competing preparation and shutdown before dispatch', () => {
  const m = new Model(); m.begin(); assert.throws(() => m.begin()); assert.throws(() => m.destroy());
  m.abort(); m.dispatch(); assert.equal(m.pending, false);
});
test('cancellation after eligible success still blocks acquisition', () => {
  const m = pending(); m.query(true, 'PoweredOn'); const result = m.result;
  m.abort(); assert.equal(m.result, result); assert.throws(() => m.acquire());
});
