import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { EvidenceStore, EVIDENCE_SCHEMA, INSERT_EVIDENCE, SELECT_EVIDENCE } from '../../packages/core/evidence.ts';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
function db(): Promise<SQLite.SQLiteDatabase> {
  database ??= SQLite.openDatabaseAsync('apex-evidence.db').then(async value => { await value.execAsync(EVIDENCE_SCHEMA); return value; }).catch(error => { database = null; throw error; });
  return database;
}
export const evidenceStore = new EvidenceStore({
  async insert(id, document) { await (await db()).runAsync(INSERT_EVIDENCE, id, document); },
  async list(limit) { return (await (await db()).getAllAsync<{ document: string }>(SELECT_EVIDENCE, limit)).map(row => row.document); },
}, {
  randomId: () => Crypto.randomUUID(),
  sha256: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
});
