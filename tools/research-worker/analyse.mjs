/** Fixed REA operations. The Python supervisor owns deadlines and the whole process group. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseReaElfEvidence } from '../../packages/core/rea-inspection.ts';
import { RESEARCH_FUNCTIONS } from '../../packages/core/research-jobs.ts';
const [operation, input, expectedHash, symbol, ...extra] = process.argv.slice(2);
if (extra.length || !/^[a-f0-9]{64}$/.test(expectedHash ?? '') || !['elf-notes', 'ghidra-function'].includes(operation) || (operation === 'elf-notes' ? symbol !== '-' : !RESEARCH_FUNCTIONS.includes(symbol))) throw new Error('Invalid fixed analysis request');
const rea = fileURLToPath(new URL('../reverse-engineering/node_modules/rea-agents/scripts/rea.mjs', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const original = readFileSync(input);
if (original.length < 16 || original.length > 4_194_304 || digest(original) !== expectedHash) throw new Error('Input identity mismatch');
function run(args) {
  const r = spawnSync(process.execPath, [rea, ...args], { encoding: 'utf8', shell: false, timeout: 150000, maxBuffer: 131072, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error || r.status !== 0 || r.signal) throw new Error(`REA operation failed: ${[r.error?.message, r.stderr, r.stdout].filter(Boolean).join('\n').slice(0, 4096)}`);
  return r.stdout.trim();
}
if (run(['--version']) !== '6.8.0') throw new Error('REA version mismatch');
const output = run(operation === 'elf-notes' ? ['inspect-elf-notes', input, '--json'] : ['decompile', input, symbol, '--provider', 'ghidra', '--json']);
let result;
if (operation === 'elf-notes') {
  const r = parseReaElfEvidence(output);
  if (r.artifact.sha256 !== expectedHash || r.artifact.bytes !== original.length) throw new Error('Evidence identity mismatch');
  result = { provider: 'rea-elf-notes/1', kind: 'elf-notes', output };
} else {
  const { parseEvidence } = await import('../reverse-engineering/node_modules/rea-agents/dist/domain/evidence.js');
  const r = parseEvidence(JSON.parse(output));
  if (r.provider.id !== 'ghidra' || r.provider.version !== '12.1.4' || r.operation !== 'procedure_pseudo_code' || r.subject?.digest.sha256 !== expectedHash || typeof r.normalized_result !== 'string' || !r.normalized_result.trim()) throw new Error('Decompilation evidence mismatch');
  result = { provider: 'ghidra/12.1.4', kind: 'pseudocode', output: r.normalized_result };
}
if (Buffer.byteLength(result.output) > 32768 || digest(readFileSync(input)) !== expectedHash) throw new Error('Output limit or input changed');
console.log(JSON.stringify({ ...result, reaVersion: '6.8.0', outputSha256: digest(result.output), targetExecuted: false }));
