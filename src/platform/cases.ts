import { CaseStore } from '../../packages/core/case-store.ts';
import type { CaseBackend } from '../../packages/core/case-store.ts';

let opening: Promise<IDBDatabase> | null = null;
function database() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('apex-cases', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('cases', { keyPath: 'id' }); };
    request.onerror = () => reject(new Error('Case storage could not open. Existing data was retained.'));
    request.onblocked = () => reject(new Error('Close older APEX tabs before opening cases.'));
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); opening = null; };
      resolve(request.result);
    };
  }).catch(error => { opening = null; throw error; });
  return opening;
}
type Row = { id: string; revision: number; document: string };
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('cases', mode); let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(new Error('Case transaction failed; no success was recorded.'));
    try { work(tx.objectStore('cases'), result => { value = result; }); } catch (error) { tx.abort(); reject(error); }
  });
}
export const caseBackend: CaseBackend = {
  read: id => transaction('readonly', (store, done) => { const r = store.get(id); r.onsuccess = () => done((r.result as Row | undefined)?.document ?? null); }),
  list: () => transaction('readonly', (store, done) => { const r = store.getAll(undefined, 100); r.onsuccess = () => done((r.result as Row[]).map(row => row.document)); }),
  put: (id, expected, revision, document) => transaction('readwrite', (store, done) => {
    const r = store.get(id);
    r.onsuccess = () => {
      const row = r.result as Row | undefined;
      if (expected === null ? row !== undefined : !row || row.revision !== expected) { done(false); return; }
      if (expected !== null) { store.put({ id, revision, document }); done(true); return; }
      const count = store.count(); count.onsuccess = () => {
        if (count.result >= 100) { done(false); return; }
        store.add({ id, revision, document }); done(true);
      };
    };
  }),
  remove: (id, expected) => transaction('readwrite', (store, done) => {
    const r = store.get(id); r.onsuccess = () => {
      if ((r.result as Row | undefined)?.revision !== expected) { done(false); return; }
      store.delete(id); done(true);
    };
  }),
};
export const caseStore = new CaseStore(caseBackend, {
  randomId: () => crypto.randomUUID(),
  async sha256(text) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join(''); },
});
