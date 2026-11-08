// Hypothetical synchronous specification model ONLY, not production or native code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

class Model {
  owner = null; receipts = new Map(); next = 1; sealed = false;
  reserve() {
    if (this.sealed || this.owner || this.next > 0x7fffffff) throw Error('fenced');
    const token = this.next++;
    this.owner = { token, handle: {}, state: 'pending', acquisition: true,
      writer: true, reader: true, closing: false, steps: ['unstarted','unstarted','unstarted'] };
    return token;
  }
  query(token) { return this.owner?.token === token ? this.owner.state : this.receipts.get(token) ?? 'unknown'; }
  request(token) { if (this.owner?.token === token) this.owner.closing = true; return this.query(token); }
  settle() { Object.assign(this.owner, {acquisition:false, writer:false, reader:false}); }
  step(index, outcome) {
    const o = this.owner;
    assert(o?.closing && !o.acquisition && !o.writer && !o.reader, 'quiescence required');
    assert.equal(o.steps[index], 'unstarted', 'never repeat a started OS step');
    assert(o.steps[2] !== 'succeeded', 'never release after close');
    o.steps[index] = outcome;
    if (outcome === 'ambiguous') o.state = 'failed';
  }
  finish() {
    const o = this.owner;
    if (!o || !o.closing || o.acquisition || o.writer || o.reader || !o.steps.every(s=>s==='succeeded')) return;
    this.receipts.set(o.token,'closed'); this.owner = null;
    if (this.receipts.size > 64) this.receipts.delete(this.receipts.keys().next().value);
  }
  retry(token) {
    // Unknown or historical identities may read their own receipt, never finish another owner.
    if (this.owner?.token !== token) return this.query(token);
    this.finish();
    return this.query(token);
  } // no OS operation repeats
  destroyModule() { this.sealed = true; if (this.owner) this.owner.closing = true; }
  recreateModule() { this.sealed = false; } // same retained process coordinator
}
function clean(m,t) { m.request(t); m.settle(); for(let i=0;i<3;i++)m.step(i,'succeeded');m.finish(); }

test('analysis bound to exact inspected Kotlin bytes, not native validation',()=>{
  const bytes=readFileSync(new URL('../../../modules/apex-device/android/src/main/java/expo/modules/apexdevice/ApexDeviceModule.kt',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'53887adec7cac4bf3be4e06c76aaddab20005546f4d569e2583995223eef7d30');
});
test('unknown token is never acknowledgement and cannot target owner',()=>{
  const m=new Model(),t=m.reserve(); assert.equal(m.request(t+1),'unknown');assert.equal(m.owner.closing,false);assert.throws(()=>m.reserve());
});
test('null active link is not modeled as released ownership',()=>{
  const m=new Model(),t=m.reserve();m.request(t);m.settle();m.step(0,'ambiguous');
  const handle=m.owner.handle;assert.equal(m.retry(t),'failed');assert.equal(m.owner.handle,handle);assert.throws(()=>m.reserve());
});
test('failed open retains reserved identity and handle',()=>{
  const m=new Model(),t=m.reserve();m.owner.state='failed';m.request(t);m.finish();
  assert.equal(m.query(t),'failed');assert(m.owner.handle);assert.throws(()=>m.reserve());
});
for(const field of ['acquisition','writer','reader'])test(`${field} settlement required before cleanup`,()=>{
  const m=new Model(),t=m.reserve();m.request(t);m.settle();m.owner[field]=true;
  assert.throws(()=>m.step(0,'succeeded'));m.finish();assert.equal(m.query(t),'pending');
});
test('ambiguous release remains failed even after other steps succeed',()=>{
  const m=new Model(),t=m.reserve();m.request(t);m.settle();m.step(0,'ambiguous');m.step(1,'succeeded');m.step(2,'succeeded');
  assert.equal(m.retry(t),'failed');assert.throws(()=>m.step(0,'succeeded'));assert.throws(()=>m.reserve());
});
test('ambiguous close is not repeated',()=>{
  const m=new Model(),t=m.reserve();m.request(t);m.settle();m.step(0,'succeeded');m.step(1,'succeeded');m.step(2,'ambiguous');
  assert.equal(m.retry(t),'failed');assert.throws(()=>m.step(2,'succeeded'));
});
test('closed receipt survives a lost result or thrown event',()=>{
  const m=new Model(),t=m.reserve();clean(m,t);try { throw Error('dispatch failed'); } catch {}
  assert.equal(m.query(t),'closed');assert.equal(m.retry(t),'closed');assert.notEqual(m.reserve(),t);
});
test('destroy/recreate preserves unresolved fence and exact handle',()=>{
  const m=new Model(),t=m.reserve(),handle=m.owner.handle;m.destroyModule();m.recreateModule();
  assert.equal(m.owner.handle,handle);assert.equal(m.query(t),'pending');assert.throws(()=>m.reserve());
});
test('closed receipts bounded; eviction is unknown, not success',()=>{
  const m=new Model();for(let i=0;i<65;i++){const t=m.reserve();clean(m,t);}
  assert.equal(m.receipts.size,64);assert.equal(m.query(1),'unknown');assert.equal(m.query(65),'closed');
});
test('token exhaustion refuses acquisition rather than wraps',()=>{
  const m=new Model();m.next=0x7fffffff;const t=m.reserve();clean(m,t);assert.throws(()=>m.reserve());
});

test('wrong-token retry cannot finish a different owner after cleanup steps succeed',()=>{
  const m=new Model(),t=m.reserve();m.request(t);m.settle();
  for(let i=0;i<3;i++)m.step(i,'succeeded');
  const owner=m.owner,handle=owner.handle;
  assert.equal(m.retry(t+1),'unknown');
  assert.equal(m.owner,owner);assert.equal(m.owner.handle,handle);
  assert.equal(m.query(t),'pending');assert.equal(m.receipts.has(t),false);
  assert.throws(()=>m.reserve());
  assert.equal(m.retry(t),'closed');assert.equal(m.owner,null);
});
test('historical closed-token retry cannot finish a newer owner',()=>{
  const m=new Model(),old=m.reserve();clean(m,old);
  const current=m.reserve();m.request(current);m.settle();
  for(let i=0;i<3;i++)m.step(i,'succeeded');
  const owner=m.owner;
  assert.equal(m.retry(old),'closed');assert.equal(m.owner,owner);
  assert.equal(m.query(current),'pending');assert.throws(()=>m.reserve());
  assert.equal(m.retry(current),'closed');
});
