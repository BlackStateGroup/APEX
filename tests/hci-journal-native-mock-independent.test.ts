/** Host-only native adapter module mocks. No native runtime, SQLite database or device execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { prepareHci, createHciLegacyEventDocument } from '../packages/core/hci-offline.ts';
import { prepareHciEventEvidenceInput } from '../packages/core/hci-event-evidence.ts';
import { hash, context, header, record, minimum } from './hci-selected-review-fixture.ts';
const documents:string[]=[];let unavailable=false,byteCalls=0,textCalls=0;
(globalThis as any).__hciNativeReview={sqlite:{openDatabaseAsync:async()=>({execAsync:async()=>{},runAsync:async(_:string,_id:string,s:string)=>{documents.push(s);},getAllAsync:async()=>documents.map(document=>({document}))})},crypto:{CryptoDigestAlgorithm:{SHA256:'SHA-256'},randomUUID:()=> 'native-mock-id',digestStringAsync:async(_:string,s:string)=>{textCalls++;return createHash('sha256').update(s).digest('hex');},digest:async(_:string,b:Uint8Array)=>{byteCalls++;if(unavailable)throw Error('byte digest unavailable');return createHash('sha256').update(b).digest();}}};
const hook=registerHooks({resolve(s,c,next){if(s==='expo-crypto'||s==='expo-sqlite'){const body=s==='expo-crypto'?'export const {CryptoDigestAlgorithm,randomUUID,digestStringAsync,digest}=globalThis.__hciNativeReview.crypto;':'export const {openDatabaseAsync}=globalThis.__hciNativeReview.sqlite;';return{url:'data:text/javascript,'+encodeURIComponent(body),shortCircuit:true};}return next(s,c);}});
let store:typeof import('../src/platform/evidence.native.ts').evidenceStore;
try{store=(await import('../src/platform/evidence.native.ts')).evidenceStore;}finally{hook.deregister();}
test('independent native adapter mock uses bytes, preserves exact snapshot and fails closed without fallback',async()=>{
 try{
 const bytes=Buffer.concat([header,record(minimum)]);const document='\n'+await createHciLegacyEventDocument(await prepareHci(bytes,context,hash),0,hash)+'\t';
 const input=prepareHciEventEvidenceInput(document);const saved=await store.save(input);assert.equal((saved.payload as any).document,document);assert.equal(await store.verify(saved),true);assert.ok(byteCalls>=2);assert.ok(textCalls>=2);
 const before=documents.length;unavailable=true;await assert.rejects(store.save(input),/byte digest unavailable/);assert.equal(documents.length,before);await assert.rejects(store.verify(saved),/byte digest unavailable/);
 await assert.rejects(store.save({...input,source:'native-ios'}));assert.equal(documents.length,before);
 }finally{delete (globalThis as any).__hciNativeReview;}
});
