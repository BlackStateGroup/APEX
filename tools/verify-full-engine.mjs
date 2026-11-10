/** Read-only replay of retained full-engine evidence; never runs a compiler or target. */
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { parseEvidence } from './reverse-engineering/node_modules/rea-agents/dist/domain/evidence.js';
const [directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length) throw new Error('Usage: node tools/verify-full-engine.mjs EVIDENCE_DIRECTORY');
const root = resolve(directory), sha = value => createHash('sha256').update(value).digest('hex');
function read(name, maximum = 2 * 1024 * 1024) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(name) || name === '.' || name === '..') throw new Error('Invalid retained path');
  const path = join(root, name), stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) throw new Error('Invalid retained file');
  const value = readFileSync(path); if (value.length !== stat.size) throw new Error('File size changed'); return value;
}
const report = JSON.parse(read('REPORT.json', 131072));
if (report.schema !== 'apex.rea-full-engine.v1' || report.rea !== '6.8.0' || report.ghidra !== '12.1.4' || !Array.isArray(report.files) || report.files.length > 100) throw new Error('Unsupported evidence report');
const names = new Set();
for (const f of report.files) {
  if (names.has(f.file)) throw new Error('Duplicate evidence member'); names.add(f.file);
  const bytes = read(f.file);
  if (sha(bytes) !== f.sha256 || bytes.length !== f.bytes) throw new Error(`Digest/size mismatch: ${f.file}`);
}
const functions = ['apex_crc16', 'apex_encode', 'apex_stream_init', 'apex_stream_feed', 'apex_device_init', 'apex_device_feed'];
if (JSON.stringify(functions) !== JSON.stringify(report.functions)) throw new Error('Function set mismatch');
for (const name of functions) {
  const e = parseEvidence(JSON.parse(read(`${name}.stdout.txt`)));
  if (e.provider.id !== 'ghidra' || e.provider.version !== '12.1.4' || e.subject?.digest.sha256 !== sha(read('original.elf')) || e.operation !== 'procedure_pseudo_code' || e.normalized_result !== read(`${name}.c`).toString()) throw new Error('Procedure evidence binding mismatch');
}
const restart = parseEvidence(JSON.parse(read('restart-crc.stdout.txt')));
if (restart.normalized_result !== read('apex_crc16.c').toString() || restart.subject?.digest.sha256 !== sha(read('original.elf'))) throw new Error('Snapshot restart mismatch');
const failure = JSON.parse(read('tampered-snapshot.stdout.txt'));
if (failure.category !== 'integrity_mismatch') throw new Error('Snapshot rejection was not an integrity failure');
const vectors = read('crc-vectors.hex').toString().split('\n'); if (vectors.pop() !== '' || vectors.length !== 130) throw new Error('Vector count mismatch');
for (const [name, poly] of [['original', 0x1021], ['mutant', 0x8005]]) {
  const actual = read(`vectors-${name}.stdout.txt`).toString().trimEnd().split('\n');
  const expected = vectors.map(hex => {
    if (!/^(?:[0-9a-f]{2}){0,512}$/.test(hex)) throw new Error('Invalid vector');
    let crc = 0xffff; for (const byte of Buffer.from(hex, 'hex')) { crc ^= byte << 8; for (let n = 0; n < 8; n++) crc = ((crc << 1) ^ ((crc & 0x8000) ? poly : 0)) & 0xffff; }
    return crc.toString(16).padStart(4, '0');
  });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Independent bitwise vector replay disagrees');
}
if (read('apex-mutant.c').toString() !== read('apex.c').toString().replace('0x1021u', '0x8005u')) throw new Error('Controlled source mutation mismatch');
for (const name of names) if (name.endsWith('.process.json')) {
  const record = JSON.parse(read(name)); if (record.processGroupAbsent !== true || record.failure || record.reason || record.signal) throw new Error('Process cleanup incomplete');
}
console.log(JSON.stringify({ filesVerified: names.size, functionsVerified: functions.length, crc16VectorsVerified: 260, targetExecuted: false, result: 'internally-consistent-retained-evidence', authenticityEstablished: false }));
