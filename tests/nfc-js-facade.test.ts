/** Host-only actual SDK JavaScript execution. All native callbacks/events are fake. */
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { PhoneNdefCapture } from '../packages/core/phone-ndef-capture.ts';
import { nfcFacadeFixture } from './helpers/nfc-js-facade.ts';
const tick = () => new Promise<void>(r => setImmediate(r));
const raw = (platform: 'ios' | 'android' = 'ios') => ({ id: 'SYNTHETIC-NOT-RETAINED', techTypes: ['Ndef'], type: 'NDEF', ndefMessage: [{ tnf: 2, type: [120], id: platform === 'android' ? '' : [], payload: [1, 2, 3] }] });
type Fixture = Awaited<ReturnType<typeof nfcFacadeFixture>>;
function capture(h: Fixture) { return new PhoneNdefCapture(h.backend, () => {}, () => 100, setTimeout, clearTimeout, () => 0); }
async function ready(h: Fixture, p: PhoneNdefCapture) {
  const start = p.start(); await tick(); h.reply('isSupported', null, true);
  await tick(); h.reply('start'); await tick();
  if (h.calls.some(c => c.name === 'isEnabled')) { h.reply('isEnabled', null, true); await tick(); }
  h.reply('registerTagEvent'); await start;
}
for (const platform of ['ios','android'] as const) for (const turbo of [true,false]) {
  test(`${platform} ${turbo?'codegen':'legacy'}: exact facade one-tag snapshot waits for callback and platform closure`, async t => {
    const h = await nfcFacadeFixture(platform,turbo); t.after(h.dispose); const p=capture(h); t.after(async()=>{ const stop=p.cancel(); await tick(); if(h.calls.some(c=>c.name==='unregisterTagEvent')) h.reply('unregisterTagEvent'); h.emit('SessionClosed',{error:'NFCError:200,synthetic cleanup'}); await stop; });
    await ready(h,p); assert.equal(p.state.phase,'reading');
    assert.equal(h.sdk.default.constructor.name,platform==='ios'?'NfcManagerIOS':'NfcManagerAndroid');
    assert.ok(h.routes.some(r=>r.startsWith(turbo?'codegen:':'legacy:')));
    assert.deepEqual(h.calls.map(c=>c.name),platform==='ios'?['isSupported','start','registerTagEvent']:['isSupported','start','isEnabled','registerTagEvent']);
    assert.deepEqual(structuredClone(h.calls.at(-1)!.args),[{alertMessage:'Hold your iPhone near an NFC tag to perform your selected foreground inspection.',invalidateAfterFirstRead:false,isReaderModeEnabled:false,readerModeFlags:0,readerModeDelay:250}]);
    const tag=raw(platform); h.emit('DiscoverTag',tag); tag.ndefMessage[0]!.payload[0]=99; h.emit('DiscoverTag',raw(platform)); await tick();
    assert.equal(p.state.phase,'stopping'); assert.equal(p.inspect(),null);
    await assert.rejects(h.backend.begin(()=>{},()=>{}),/already active/);
    h.reply('unregisterTagEvent'); await tick();
    if(platform==='ios') { assert.equal(p.inspect(),null); assert.equal(p.state.phase,'stopping'); h.emit('SessionClosed',{error:'NFCError:200,synthetic cancellation'}); }
    await tick(); assert.equal(p.state.phase,'idle');
    const document=p.inspect()!.document; assert.ok(document.includes('1,2,3')); assert.ok(!document.includes('99')); assert.ok(!document.includes('SYNTHETIC-NOT-RETAINED'));
    assert.equal(h.calls.filter(c=>c.name==='unregisterTagEvent').length,1);
    h.emit('DiscoverTag',raw(platform)); assert.equal(p.inspect()!.document,document);
  });
}

for (const platform of ['ios','android'] as const) {
  test(`${platform}: cancellation while native start callback is pending prevents registration`, async t => {
    const h=await nfcFacadeFixture(platform); t.after(h.dispose); const p=capture(h);
    const start=p.start(); await tick(); h.reply('isSupported',null,true); await tick();
    const stop=p.cancel(); await tick(); assert.equal(p.state.phase,'stopping');
    h.reply('start'); await tick();
    // Android status still finishes its isEnabled query, but no session is acquired.
    if(platform==='android') h.reply('isEnabled',null,true);
    await Promise.all([start,stop]); assert.equal(p.state.phase,'idle'); assert.equal(p.inspect(),null);
    assert.ok(!h.calls.some(c=>c.name==='registerTagEvent'||c.name==='unregisterTagEvent'));
  });
  test(`${platform}: actual native error conversion, failed start retries, successful start is cached`, async t => {
    const h=await nfcFacadeFixture(platform); t.after(h.dispose);
    const status=h.backend.status(); await tick(); h.reply('isSupported',null,true); await tick();
    const rejected=assert.rejects(status,(error: any)=>error instanceof h.sdk.NfcError.UserCancel);
    h.reply('start',platform==='ios'?'NFCError:200,synthetic cancel':'cancelled'); await rejected;
    const retry=h.backend.status(); await tick(); h.reply('isSupported',null,true); await tick(); h.reply('start'); await tick();
    if(platform==='android') h.reply('isEnabled',null,true); await retry;
    const again=h.backend.status(); await tick(); h.reply('isSupported',null,true); await tick();
    if(platform==='android') h.reply('isEnabled',null,true); await again;
    assert.equal(h.calls.filter(c=>c.name==='start').length,2);
  });
  test(`${platform}: rejected unregister retains capture and singleton until explicit retry`, async t => {
    const h=await nfcFacadeFixture(platform); t.after(h.dispose); const p=capture(h); await ready(h,p);
    h.emit('DiscoverTag',raw(platform)); await tick(); h.reply('unregisterTagEvent','synthetic cleanup failure'); await tick();
    assert.equal(p.state.phase,'stopping'); assert.equal(p.inspect(),null); assert.match(p.state.message,/cleanup failed/);
    await assert.rejects(h.backend.begin(()=>{},()=>{}),/already active/);
    const stop=p.stopOrCancel(); await tick(); h.reply('unregisterTagEvent');
    if(platform==='ios') h.emit('SessionClosed',{error:'NFCError:200,synthetic cleanup'});
    await stop; assert.equal(p.state.phase,'idle'); assert.ok(p.inspect());
    assert.equal(h.calls.filter(c=>c.name==='unregisterTagEvent').length,2);
  });
  test(`${platform}: register rejection releases singleton and exposes converted failure`, async t => {
    const h=await nfcFacadeFixture(platform); t.after(h.dispose);
    const begin=h.backend.begin(()=>{},()=>{}); await tick();
    const rejection=assert.rejects(begin,(e: any)=>e instanceof h.sdk.NfcError.UserCancel);
    h.reply('registerTagEvent',platform==='ios'?'NFCError:200,synthetic cancel':'cancelled'); await rejection;
    const next=h.backend.begin(()=>{},()=>{}); await tick(); h.reply('registerTagEvent'); const stop=await next;
    const closing=stop(); await tick(); h.reply('unregisterTagEvent');
    if(platform==='ios') h.emit('SessionClosed',{error:'NFCError:200,synthetic cleanup'});
    await closing;
  });
}
for (const error of ['NFCError:200,synthetic cancel','NFCError:201,synthetic timeout','synthetic unknown failure']) {
  test(`ios: real SessionClosed conversion of ${error}`,async t=>{
    const h=await nfcFacadeFixture('ios'); t.after(h.dispose); const closed: (Error|undefined)[]=[];
    const begin=h.backend.begin(()=>{},e=>closed.push(e)); await tick(); h.reply('registerTagEvent'); const stop=await begin;
    h.emit('SessionClosed',{error}); assert.equal(closed.length,1);
    if(error.startsWith('NFCError:200')) assert.equal(closed[0],undefined);
    else assert.ok(closed[0] instanceof (error.startsWith('NFCError:201')?h.sdk.NfcError.Timeout:h.sdk.NfcError.NfcErrorBase));
    await stop(); assert.equal(h.calls.filter(c=>c.name==='unregisterTagEvent').length,0);
  });
}
test('ios: early SessionClosed cannot bypass pending register or pending unregister callback',async t=>{
  const h=await nfcFacadeFixture('ios'); t.after(h.dispose); const p=capture(h);
  const start=p.start(); await tick();h.reply('isSupported',null,true);await tick();h.reply('start');await tick();
  h.emit('SessionClosed',{error:'NFCError:200,synthetic cancel'}); await tick();
  assert.equal(p.state.phase,'starting'); await assert.rejects(h.backend.begin(()=>{},()=>{}),/already active/);
  h.reply('registerTagEvent'); await start;assert.equal(p.state.phase,'idle');assert.equal(p.inspect(),null);
  // Reuse the actual singleton without starting it a second time.
  const next=p.start(); await tick();h.reply('isSupported',null,true);await tick();h.reply('registerTagEvent');await next;
  h.emit('DiscoverTag',raw());await tick();h.emit('SessionClosed',{error:'NFCError:200,synthetic cancel'});await tick();
  assert.equal(p.state.phase,'stopping');assert.equal(p.inspect(),null);await assert.rejects(h.backend.begin(()=>{},()=>{}),/already active/);
  h.reply('unregisterTagEvent','synthetic late rejection after confirmed closure');await tick();
  assert.equal(p.state.phase,'idle');assert.ok(p.inspect());
});
test('android: StateChanged is not SessionClosed and cannot certify unregister completion',async t=>{
  const h=await nfcFacadeFixture('android');t.after(h.dispose);const p=capture(h);await ready(h,p);
  h.emit('DiscoverTag',raw('android'));await tick();h.emit('StateChanged',{state:'off'});h.emit('SessionClosed',{error:'cancelled'});await tick();
  assert.equal(p.state.phase,'stopping');assert.equal(p.inspect(),null);
  h.reply('unregisterTagEvent');await tick();assert.equal(p.state.phase,'idle');assert.ok(p.inspect());
});


test('recorded exact APEX inputs and installed SDK package metadata match',async t=>{
  const manifest=JSON.parse(readFileSync(new URL('../verification/nfc-js-facade/inputs.json',import.meta.url),'utf8'));
  for(const [path, hash] of Object.entries(manifest.sources)) assert.equal(createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex'),hash,path);
  const h=await nfcFacadeFixture('ios');t.after(h.dispose);
  const packagePath=new URL('../../package.json', pathToFileURL(h.entry));
  const bytes=readFileSync(packagePath);assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sdk.files['package.json']);
  assert.equal(JSON.parse(bytes.toString()).version,'4.2.0');
  assert.equal(h.loadedFiles.length,Object.keys(manifest.sdk.files).length-1);
});
for(const platform of ['ios','android'] as const) test(`${platform}: opposite-platform synthetic record ID is not silently coerced`,async t=>{
  const h=await nfcFacadeFixture(platform);t.after(h.dispose);const p=capture(h);await ready(h,p);
  h.emit('DiscoverTag',raw(platform==='ios'?'android':'ios'));await tick();
  assert.equal(p.inspect(),null);assert.match(p.state.message,/rejected/);
  h.reply('unregisterTagEvent');if(platform==='ios')h.emit('SessionClosed',{error:'NFCError:200,synthetic cleanup'});
  await tick();assert.equal(p.state.phase,'idle');assert.equal(p.inspect(),null);
});
