import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './reverse-engineering/elf-control-flow.mjs';
import { inspectControlFlow } from './inspect-control-flow.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [selected, ...extra] = process.argv.slice(2);
if (!selected || extra.length) throw new Error('Usage: node tools/research-control-flow.mjs NEW_OUTPUT_DIRECTORY');
const output = resolve(selected);
mkdirSync(output, { mode: 0o700 });
const inputs = join(output, 'inputs'); mkdirSync(inputs);
const sources = ['firmware/core/apex.c', 'firmware/core/apex.h', 'firmware/host/main.c'];
const recordedSources = sources.map(file => {
  const bytes = readFileSync(join(root, file)), name = file.split('/').at(-1);
  writeFileSync(join(inputs, name), bytes, { flag: 'wx', mode: 0o400 });
  return { file, retainedFile: `inputs/${name}`, sha256: digest(bytes) };
});
const original = readFileSync(join(inputs, 'apex.c'), 'utf8');
if (original.split('0x1021u').length !== 2) throw new Error('Expected exactly one source CRC polynomial for controlled mutation');
const mutant = original.replace('0x1021u', '0x8005u');
writeFileSync(join(inputs, 'apex-poly8005.c'), mutant, { flag: 'wx', mode: 0o400 });
const compiler = spawnSync('gcc', ['--version'], { encoding: 'utf8', timeout: 10000 });
if (compiler.status !== 0 || compiler.error) throw new Error('GNU C compiler unavailable');
const variants = [];
for (const [id, optimization, source] of [['O0', '-O0', 'apex.c'], ['O2', '-O2', 'apex.c'], ['Os', '-Os', 'apex.c'], ['O2-poly8005', '-O2', 'apex-poly8005.c']]) {
  const target = join(output, `${id}.elf`), args = ['-std=c11', optimization, '-Wall', '-Wextra', '-Werror', '-pedantic', '-I', inputs, join(inputs, source), join(inputs, 'main.c'), '-o', target];
  const result = spawnSync('gcc', args, { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024, shell: false });
  writeFileSync(join(output, `${id}.compile.json`), JSON.stringify({ executable: 'gcc', args, status: result.status, signal: result.signal, error: result.error?.message ?? null, stdout: result.stdout, stderr: result.stderr }, null, 2) + '\n', { flag: 'wx' });
  if (result.error || result.status !== 0 || result.signal || result.stderr) throw new Error(`Compile failed or uncertain for ${id}; partial evidence retained`);
  chmodSync(target, 0o400); // These inspection inputs are not invoked by the experiment.
  const resultSummary = inspectControlFlow(target, join(output, id));
  const report = JSON.parse(readFileSync(join(output, id, 'control-flow.json'), 'utf8'));
  const crcAddress = report.functions.find(f => f.name === 'apex_crc16').address;
  variants.push({ id, optimization, mutation: id === 'O2-poly8005' ? 'One local source-copy substitution: polynomial 0x1021u → 0x8005u. Not a production firmware change.' : null,
    sourceSha256: digest(readFileSync(join(inputs, source))), artifactFile: `${id}.elf`, artifactSha256: resultSummary.artifactSha256,
    reportFile: `${id}/control-flow.json`, reportSha256: digest(readFileSync(join(output, id, 'control-flow.json'))),
    functions: report.functions.map(f => ({ name: f.name, byteLength: f.byteLength, instructions: f.instructionCount, blocks: f.blockCount,
      directCallsToCrc: f.calls.filter(c => c.target === crcAddress).length, unresolvedTransfers: f.unresolved.length,
      immediate1021: f.observedImmediates.some(c => c.immediate === '0x1021'), immediate8005: f.observedImmediates.some(c => c.immediate === '0x8005') })) });
}
for (const source of recordedSources) if (digest(readFileSync(join(output, source.retainedFile))) !== source.sha256) throw new Error('Retained source changed during experiment');
const summary = { schemaVersion: 1, investigation: 'RES-01A', question: 'How does optimization alter the location of the known AXP CRC implementation, and can byte-bound structural evidence distinguish a controlled polynomial mutation?',
  targetScope: 'Only own portable APEX host firmware; no external targets or hardware.',
  compiler: compiler.stdout.split('\n')[0], sourceFiles: recordedSources,
  controlledMutation: { retainedFile: 'inputs/apex-poly8005.c', sha256: digest(mutant) },
  variants, targetExecuted: false, decompilationPerformed: false, semanticEquivalenceProved: false,
  interpretationLimits: ['Observed constants and call edges locate candidates, not recovered algorithms. The expected source behavior is known, so this is a controlled validation experiment, not blind discovery.', 'Optimization-specific inlining must be interpreted from evidence and source, not assumed solely from missing calls. Indirect callbacks remain unresolved.', 'The changed polynomial is a negative control, not a vulnerability or a cryptographic break. No functional output or physical behavior was measured.'],
};
writeFileSync(join(output, 'experiment.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output, variants: variants.map(v => ({ id: v.id, sha256: v.artifactSha256, functionsWith1021: v.functions.filter(f => f.immediate1021).map(f => f.name) })), targetExecuted: false }));
