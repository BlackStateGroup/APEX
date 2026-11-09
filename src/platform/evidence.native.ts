import { hciDigest } from './hci-digest.native.ts';
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { EvidenceStore, EVIDENCE_SCHEMA, INSERT_EVIDENCE, SELECT_EVIDENCE } from '../../packages/core/evidence.ts';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
function db(): Promise<SQLite.SQLiteDatabase> {
  // Install the shared promise before invoking native code, including synchronous
  // failures or reentrant callers. No query may use a half-initialized connection.
  database ??= Promise.resolve().then(async () => {
    let value: SQLite.SQLiteDatabase;
    try { value = await SQLite.openDatabaseAsync('apex-evidence.db'); }
    catch (error) { database = null; throw error; }
    try { await value.execAsync(EVIDENCE_SCHEMA); }
    catch (error) {
      // An opened connection is ours even when schema setup rejects. Retain the
      // single-flight slot until its close settles, so retry cannot overlap it.
      try { await value.closeAsync(); }
      catch (closeError) {
        // Keep this rejected promise latched: release is uncertain. Reopening
        // on every Save/List could otherwise accumulate native references.
        throw new AggregateError([error, closeError], 'Evidence journal setup failed and its connection could not be released. Restart the app before retrying.');
      }
      database = null;
      throw error;
    }
    return value;
  });
  return database;
}
export const evidenceStore = new EvidenceStore({
  async insert(id, document) { await (await db()).runAsync(INSERT_EVIDENCE, id, document); },
  async list(limit) { return (await (await db()).getAllAsync<{ document: string }>(SELECT_EVIDENCE, limit)).map(row => row.document); },
}, {
  sha256Bytes: hciDigest,
  randomId: () => Crypto.randomUUID(),
  sha256: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
});
