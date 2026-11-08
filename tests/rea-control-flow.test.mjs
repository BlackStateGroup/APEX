import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CORE_SYMBOLS, digest, readElfFunctions, validateObjdumpEvidence, parseFunctionDisassembly, summarizeControlFlow } from '../tools/reverse-engineering/elf-control-flow.mjs';
import { boundedArtifact } from '../tools/inspect-control-flow.mjs';
const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'apex-flow-tests-'));
after(() => rmSync(temp, { recursive: true, force: true }));
const target = join(temp, 'own-apex'), result = spawnSync('gcc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I', join(root, 'firmware/core'), join(root, 'firmware/core/apex.c'), join(root, 'firmware/host/main.c'), '-o', target], { encoding: 'utf8', timeout: 15000 });
assert.equal(result.status, 0, result.stderr);
const bytes = readFileSync(target), functions = readElfFunctions(bytes);
function fakeEvidence(stdout = 'fixture') {
  const r = { stdout, stderr: '', exit_code: 0, signal: null, output_truncated: false, completion_status: 'complete', artifact_sha256_after: digest(bytes), artifact_changed: false };
  return { evidence_id: `ev_${'a'.repeat(64)}`, subject: { digest: { sha256: digest(bytes) }, local_path: target }, provider: { id: 'gnu.objdump' }, operation: 'inspect_with_objdump', predicate_type: 'rea.reverse-engineering.command-observation', parameters: { path: target, operation: 'disassemble', symbol: 'apex_crc16', follow_debug_links: false, provider_executable: 'objdump', command_arguments: ['--disassemble=apex_crc16', target] }, raw_result: { ...r }, normalized_result: { ...r } };
}
const expected = { artifactSha256: digest(bytes), artifactPath: target, symbol: 'apex_crc16' };
const synthetic = (hexBytes, name = 'fixture') => ({ name, address: 0x1000, size: hexBytes.length / 2, offset: 0, bytes: Buffer.from(hexBytes, 'hex'), sha256: digest(Buffer.from(hexBytes, 'hex')) });
const listing = rows => `0000000000001000 <fixture>:\n${rows}\n`;

test('reads six exact executable core symbol ranges without running target', () => {
  assert.deepEqual(functions.map(f => f.name), CORE_SYMBOLS);
  for (const f of functions) assert.deepEqual(bytes.subarray(f.offset, f.offset + f.size), f.bytes);
});
for (const name of CORE_SYMBOLS) test(`GNU selected disassembly exactly covers ${name} and partitions all bytes`, () => {
  const f = functions.find(f => f.name === name), r = spawnSync('objdump', [`--disassemble=${name}`, '--', target], { encoding: 'utf8', timeout: 15000, env: { ...process.env, LC_ALL: 'C' } });
  assert.equal(r.status, 0, r.stderr);
  const instructions = parseFunctionDisassembly(r.stdout, f), s = summarizeControlFlow(f, instructions);
  assert.equal(s.blocks.reduce((n, b) => n + b.byteLength, 0), f.size);
  assert.equal(s.blocks.reduce((n, b) => n + b.instructionCount, 0), instructions.length);
  assert.equal(s.byteCoverage, 'exact-selected-ELF-symbol');
  if (name === 'apex_stream_feed') assert(s.unresolved.some(u => u.kind === 'indirect-call'));
});
for (const [name, mutate] of [
  ['class', b => b[4] = 1], ['endianness', b => b[5] = 2], ['machine', b => b.writeUInt16LE(183, 18)], ['object type', b => b.writeUInt16LE(1, 16)],
  ['extended section table', b => b.writeUInt16LE(0, 60)], ['unsafe offset', b => b.writeBigUInt64LE(0xffffffffffffffffn, 40)], ['out-of-bounds table', b => b.writeBigUInt64LE(BigInt(b.length - 1), 40)],
]) test(`rejects unsupported or malformed ELF ${name}`, () => { const b = Buffer.from(bytes); mutate(b); assert.throws(() => readElfFunctions(b)); });
test('rejects absent, duplicate and instruction-shaped symbol selections', () => {
  for (const names of [['missing_function'], ['apex_crc16', 'apex_crc16'], ['--help'], []]) assert.throws(() => readElfFunctions(bytes, names));
});
test('rejects stripped ELF instead of claiming no code exists', () => {
  const stripped = join(temp, 'stripped'); writeFileSync(stripped, bytes);
  const r = spawnSync('strip', ['--strip-all', stripped], { encoding: 'utf8', timeout: 15000 }); assert.equal(r.status, 0);
  assert.throws(() => readElfFunctions(readFileSync(stripped)), /Stripped/);
});
test('bounded input accepts regular artifact and rejects directories and small files', () => {
  assert.equal(digest(boundedArtifact(target).bytes), digest(bytes));
  assert.throws(() => boundedArtifact(temp));
  const small = join(temp, 'small'); writeFileSync(small, 'tiny'); assert.throws(() => boundedArtifact(small));
});
test('accepts consistent complete observation', () => assert.equal(validateObjdumpEvidence(JSON.stringify(fakeEvidence()), expected).stdout, 'fixture'));
for (const [name, mutate] of [
  ['provider', e => e.provider.id = 'direct-objdump'], ['operation', e => e.operation = 'inspect_elf_notes'], ['subject digest', e => e.subject.digest.sha256 = '0'.repeat(64)],
  ['path', e => e.parameters.path = 'other'], ['symbol', e => e.parameters.symbol = 'apex_encode'], ['debug links', e => e.parameters.follow_debug_links = true],
  ['argv', e => e.parameters.command_arguments.push('-D')], ['truncation', e => e.normalized_result.output_truncated = true], ['exit', e => e.normalized_result.exit_code = 1],
  ['signal', e => e.normalized_result.signal = 'SIGKILL'], ['partial', e => e.normalized_result.completion_status = 'partial'], ['changed', e => e.normalized_result.artifact_changed = true],
  ['after digest', e => e.normalized_result.artifact_sha256_after = '0'.repeat(64)], ['stderr', e => e.normalized_result.stderr = 'warning'], ['raw mismatch', e => e.raw_result.stdout = 'other'], ['raw failure', e => e.raw_result.exit_code = 9],
]) test(`rejects REA ${name} mismatch`, () => { const e = fakeEvidence(); mutate(e); assert.throws(() => validateObjdumpEvidence(JSON.stringify(e), expected)); });
test('rejects oversized and malformed evidence', () => { assert.throws(() => validateObjdumpEvidence('x'.repeat(2 * 1024 * 1024 + 1), expected)); assert.throws(() => validateObjdumpEvidence('{}', expected)); });
test('parses wrapped byte lines as one instruction', () => {
  const f = synthetic('66662e0f1f840000000000c3'), a = parseFunctionDisassembly(listing(' 1000:\t66 66 2e 0f 1f 84 00 \tdata16 cs nopw 0x0(%rax,%rax,1)\n 1007:\t00 00 00 00\n 100b:\tc3\tret'), f);
  assert.equal(a.length, 2); assert.equal(a[0].bytes.length, 11);
});
for (const [name, rows] of [
  ['altered byte', ' 1000:\t90\tret'], ['gap', ' 1001:\tc3\tret'], ['missing bytes', ''], ['orphan continuation', ' 1000:\tc3'],
  ['invalid instruction', ' 1000:\tc3\t(bad)'], ['data directive', ' 1000:\tc3\t.byte 0xc3'], ['unparsed line', ' something unexpected'],
]) test(`rejects disassembly ${name}`, () => assert.throws(() => parseFunctionDisassembly(listing(rows), synthetic('c3'))));
test('rejects false function header, duplicate header and bytes outside the symbol', () => {
  for (const text of ['0000000000001001 <fixture>:\n 1001:\tc3\tret', listing(' 1000:\tc3\tret') + listing(' 1000:\tc3\tret'), listing(' 1000:\tc3 c3\tret')]) assert.throws(() => parseFunctionDisassembly(text, synthetic('c3')));
});
test('conditional successors and back edge stay distinct', () => {
  const f = synthetic('9075fdc3'), s = summarizeControlFlow(f, parseFunctionDisassembly(listing(' 1000:\t90\tnop\n 1001:\t75 fd\tjne 1000 <fixture>\n 1003:\tc3\tret'), f));
  assert.equal(s.blocks.length, 2); assert.deepEqual(s.blocks[0].successors.map(e => [e.kind, e.target]), [['conditional-taken', '0x1000'], ['conditional-not-taken', '0x1003']]);
});
test('rejects branch into middle of an instruction', () => {
  const f = synthetic('75ffc3'); assert.throws(() => summarizeControlFlow(f, parseFunctionDisassembly(listing(' 1000:\t75 ff\tjne 1001 <fixture+0x1>\n 1002:\tc3\tret'), f)), /inside an instruction/);
});
test('keeps indirect call unresolved, conditions return fallthrough, and does not infer callback', () => {
  const f = synthetic('ffd0c3'), s = summarizeControlFlow(f, parseFunctionDisassembly(listing(' 1000:\tff d0\tcall *%rax\n 1002:\tc3\tret'), f));
  assert.equal(s.calls[0].target, null); assert.equal(s.unresolved[0].kind, 'indirect-call'); assert.equal(s.blocks[0].successors[0].kind, 'if-call-returns');
});
test('keeps tail transfer outside selected symbol and unsupported traps explicit', () => {
  const f = synthetic('eb7f0f0b'), s = summarizeControlFlow(f, parseFunctionDisassembly(listing(' 1000:\teb 7f\tjmp 1081 <outside>\n 1002:\t0f 0b\tud2'), f));
  assert.equal(s.blocks[0].successors[0].scope, 'outside-function'); assert.equal(s.unresolved[0].kind, 'ud2');
});
test('CRC constant is labeled a candidate only', () => {
  const f = synthetic('662d2110c3'), s = summarizeControlFlow(f, parseFunctionDisassembly(listing(' 1000:\t66 2d 21 10\tsub $0x1021,%ax\n 1004:\tc3\tret'), f));
  assert.equal(s.crc1021Candidate, true); assert.match(s.candidateMeaning, /does not establish/);
});
