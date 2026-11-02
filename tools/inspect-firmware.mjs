import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReaElfEvidence } from '../packages/core/rea-inspection.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [selected, destination = join(root, 'build', 'rea-inspection')] = process.argv.slice(2);
if (!selected) throw new Error('Usage: npm run research:inspect -- PATH_TO_ELF [NEW_OUTPUT_DIRECTORY]');
const target = resolve(selected), output = resolve(destination);
const size = statSync(target);
if (!size.isFile() || size.size < 16 || size.size > 67108864) throw new Error('Select an ELF file between 16 bytes and 64 MiB');
if (existsSync(output)) throw new Error('Output already exists; choose a new directory to preserve prior evidence');
const digest = () => createHash('sha256').update(readFileSync(target)).digest('hex');
const before = digest();
const rea = join(root, 'tools/reverse-engineering/node_modules/rea-agents/scripts/rea.mjs');
function command(args) {
  const result = spawnSync(process.execPath, [rea, ...args], { encoding: 'utf8', timeout: 120000, maxBuffer: 2097152, shell: false });
  if (result.error || result.status !== 0) throw new Error(`REA failed: ${result.error?.message ?? result.stdout.slice(0,4096) ?? result.stderr.slice(0,4096)}`);
  return result.stdout.trim();
}
const version = command(['--version']);
if (version !== '6.8.0') throw new Error('Expected pinned REA 6.8.0');
const raw = command(['inspect-elf-notes', target, '--json']);
const inspection = parseReaElfEvidence(raw);
const binutils = [];
for (const [name, argument] of [['headers','--file-headers'],['sections','--section-headers'],['symbols','--syms'],['crc-disassembly','--disassemble=apex_crc16']]) {
  const result = spawnSync('objdump', [argument, '--', target], { encoding:'utf8', timeout:15000, maxBuffer:2097152, shell:false });
  binutils.push({ name, argument, text:result.stdout ?? '', stderr:result.stderr ?? '', success:!result.error && result.status === 0, exitCode:result.status, error:result.error?.message ?? null });
}
const after = digest();
if (before !== after || inspection.artifact.sha256 !== before || inspection.artifact.bytes !== size.size) throw new Error('Artifact changed or REA digest disagrees; no report accepted');
mkdirSync(output, { recursive: true });
const rawDocument = raw + '\n';
writeFileSync(join(output, 'rea-evidence.json'), rawDocument, { flag: 'wx' });
const supplements = binutils.map(item => {
  const file = `objdump-${item.name}.txt`;
  writeFileSync(join(output,file), item.text, { flag:'wx' });
  const diagnosticFile = `objdump-${item.name}.stderr.txt`;
  writeFileSync(join(output,diagnosticFile), item.stderr, { flag:'wx' });
  return { provider:'GNU objdump (direct; not REA subprocess integration)', file, argument:item.argument, success:item.success, exitCode:item.exitCode, error:item.error, sha256:createHash('sha256').update(item.text).digest('hex'), diagnosticFile, diagnosticSha256:createHash('sha256').update(item.stderr).digest('hex') };
});
const record = { schemaVersion:1, inspectedAt:new Date().toISOString(), engine:{ name:'rea-agents', version }, input:basename(target), artifactSha256:before, rawEvidenceSha256:createHash('sha256').update(rawDocument).digest('hex'), supplements, artifactObservedUnchanged:true, targetExecuted:false, inspection };
writeFileSync(join(output, 'inspection.json'), JSON.stringify(record,null,2)+'\n', { flag:'wx' });
console.log(JSON.stringify({ output, artifactSha256: before, format: inspection.artifact.format, architecture:inspection.artifact.architecture, noteObservations:inspection.examinedEntries, targetExecuted:false }));
