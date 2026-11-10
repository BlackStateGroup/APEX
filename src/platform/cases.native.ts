import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { CaseStore } from '../../packages/core/case-store.ts';
import type { CaseBackend } from '../../packages/core/case-store.ts';

let opening: Promise<SQLite.SQLiteDatabase> | null = null;
function database() {
  opening ??= Promise.resolve().then(async () => {
    let db: SQLite.SQLiteDatabase;
    try { db = await SQLite.openDatabaseAsync('apex-cases-v1.db'); }
    catch (error) { opening = null; throw error; }
    try {
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL);');
    } catch (error) {
      try { await db.closeAsync(); } catch (close) { throw new AggregateError([error, close], 'Case database cleanup unknown. Restart the app.'); }
      opening = null; throw error;
    }
    return db;
  });
  return opening;
}
export const caseBackend: CaseBackend = {
  async read(id) { return (await (await database()).getFirstAsync<{ document: string }>('SELECT document FROM cases WHERE id = ?', id))?.document ?? null; },
  async list() { return (await (await database()).getAllAsync<{ document: string }>('SELECT document FROM cases ORDER BY rowid DESC LIMIT 100')).map(row => row.document); },
  async put(id, expected, revision, document) {
    const db = await database();
    const result = expected === null
      ? await db.runAsync('INSERT OR IGNORE INTO cases(id, revision, document) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM cases) < 100', id, revision, document)
      : await db.runAsync('UPDATE cases SET revision = ?, document = ? WHERE id = ? AND revision = ?', revision, document, id, expected);
    return result.changes === 1;
  },
  async remove(id, expected) { return (await (await database()).runAsync('DELETE FROM cases WHERE id = ? AND revision = ?', id, expected)).changes === 1; },
};
export const caseStore = new CaseStore(caseBackend, {
  randomId: () => Crypto.randomUUID(),
  sha256: text => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
});
