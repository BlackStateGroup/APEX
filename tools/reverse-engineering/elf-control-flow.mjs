import { createHash } from 'node:crypto';

export const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
export const CORE_SYMBOLS = Object.freeze(['apex_crc16', 'apex_encode', 'apex_stream_init', 'apex_stream_feed', 'apex_device_init', 'apex_device_feed']);
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
const hex = n => `0x${n.toString(16)}`;
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function boundedInteger(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail('ELF integer exceeds safe address range');
  return Number(value);
}
function range(buffer, offset, size) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset > buffer.length - size) fail('ELF range exceeds artifact');
  return buffer.subarray(offset, offset + size);
}
function cstring(table, offset) {
  if (offset < 0 || offset >= table.length) fail('ELF string offset out of range');
  const relativeEnd = table.subarray(offset, Math.min(table.length, offset + 1025)).indexOf(0);
  if (relativeEnd < 0) fail('Unterminated or oversized ELF symbol name');
  return table.toString('utf8', offset, offset + relativeEnd);
}
/** Intentionally narrow: little-endian ELF64 x86-64 ET_EXEC/ET_DYN, ordinary section table. */
export function readElfFunctions(bytes, names = CORE_SYMBOLS) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.length > MAX_ARTIFACT_BYTES) fail('ELF size is outside supported bounds');
  if (!bytes.subarray(0, 7).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1])) || bytes.readUInt16LE(18) !== 62 || bytes.readUInt32LE(20) !== 1 || ![2, 3].includes(bytes.readUInt16LE(16))) fail('Only linked little-endian ELF64 x86-64 is supported');
  if (!Array.isArray(names) || !names.length || names.length > 32 || new Set(names).size !== names.length || names.some(n => typeof n !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(n))) fail('Invalid exact function selection');
  const u64 = n => boundedInteger(bytes.readBigUInt64LE(n));
  const table = u64(40), entrySize = bytes.readUInt16LE(58), count = bytes.readUInt16LE(60);
  if (bytes.readUInt16LE(52) !== 64 || entrySize !== 64 || count < 1 || count > 4096) fail('Unsupported ELF section table');
  range(bytes, table, count * entrySize);
  const sections = Array.from({ length: count }, (_, i) => {
    const p = table + i * entrySize;
    return { index: i, type: bytes.readUInt32LE(p + 4), flags: u64(p + 8), address: u64(p + 16), offset: u64(p + 24), size: u64(p + 32), link: bytes.readUInt32LE(p + 40), entrySize: u64(p + 56) };
  });
  const matches = new Map(names.map(n => [n, []]));
  let totalSymbolEntries = 0;
  for (const section of sections.filter(s => s.type === 2)) {
    if (section.entrySize !== 24 || section.size % 24 || section.size / 24 > 100000 || section.link >= count || sections[section.link].type !== 3) fail('Unsupported ELF symbol table');
    totalSymbolEntries += section.size / 24;
    if (totalSymbolEntries > 100000) fail('Aggregate ELF symbol-entry budget exceeded');
    range(bytes, section.offset, section.size);
    const strings = sections[section.link], stringTable = range(bytes, strings.offset, strings.size);
    for (let p = section.offset; p < section.offset + section.size; p += 24) {
      const name = cstring(stringTable, bytes.readUInt32LE(p));
      if (!matches.has(name)) continue;
      if (matches.get(name).length) fail(`Duplicate selected ELF function symbol: ${name}`);
      const kind = bytes[p + 4] & 15, index = bytes.readUInt16LE(p + 6), address = u64(p + 8), size = u64(p + 16), owner = sections[index];
      if (!Number.isSafeInteger(address + size) || kind !== 2 || !owner || owner.type !== 1 || !(owner.flags & 4) || !size || size > 65536 || address < owner.address || address - owner.address > owner.size - size) fail(`Selected symbol is not a bounded executable function: ${name}`);
      const offset = owner.offset + address - owner.address;
      const code = range(bytes, offset, size);
      matches.get(name).push({ name, address, size, offset, sectionIndex: index, bytes: code, sha256: digest(code) });
    }
  }
  return names.map(name => {
    const found = matches.get(name);
    if (found.length !== 1) fail(`Expected one exact ELF function symbol ${name}; found ${found.length}. Stripped/ambiguous functions are unsupported.`);
    return found[0];
  });
}

export function validateObjdumpEvidence(raw, { artifactSha256, artifactPath, symbol }) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 2 * 1024 * 1024) fail('REA evidence exceeds bound');
  const e = JSON.parse(raw), n = e?.normalized_result, r = e?.raw_result, p = e?.parameters;
  if (!sha(artifactSha256) || e?.provider?.id !== 'gnu.objdump' || e.operation !== 'inspect_with_objdump' || e.predicate_type !== 'rea.reverse-engineering.command-observation' || !/^ev_[a-f0-9]{64}$/.test(e.evidence_id ?? '') || e?.subject?.digest?.sha256 !== artifactSha256 || e?.subject?.local_path !== artifactPath) fail('REA evidence identity mismatch');
  if (p?.path !== artifactPath || p.operation !== 'disassemble' || p.symbol !== symbol || p.follow_debug_links !== false || p.provider_executable !== 'objdump' || JSON.stringify(p.command_arguments) !== JSON.stringify([`--disassemble=${symbol}`, artifactPath])) fail('REA operation parameters mismatch');
  for (const result of [n, r]) {
    if (!result || result.exit_code !== 0 || result.signal !== null || result.completion_status !== 'complete' || result.output_truncated !== false || result.artifact_changed !== false || result.artifact_sha256_after !== artifactSha256 || typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > 1024 * 1024 || result.stderr !== '') fail('Incomplete, changed, or diagnostically uncertain REA observation');
  }
  if (n.stdout !== r.stdout) fail('REA raw and normalized disassembly disagree');
  return { evidenceId: e.evidence_id, stdout: n.stdout };
}

export function parseFunctionDisassembly(text, fn) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) fail('Disassembly exceeds bound');
  const instructions = [];
  let selected = false, seen = false;
  for (const line of text.split('\n')) {
    const heading = line.match(/^([a-fA-F0-9]+) <([^>]+)>:$/);
    if (heading) {
      if (heading[2] !== fn.name) { selected = false; continue; }
      if (seen || parseInt(heading[1], 16) !== fn.address) fail('Disassembly function identity mismatch');
      selected = seen = true; continue;
    }
    if (/^Disassembly of section /.test(line)) { selected = false; continue; }
    if (!selected || !line.trim()) continue;
    const row = line.match(/^\s*([a-fA-F0-9]+):\s+((?:[a-fA-F0-9]{2}(?:\s+|$))+)(.*?)\s*$/);
    if (!row) fail('Unsupported disassembly line inside selected function');
    const address = parseInt(row[1], 16), bytes = Buffer.from(row[2].trim().split(/\s+/).map(v => parseInt(v, 16))), assembly = row[3].trim();
    const previous = instructions.at(-1), expected = previous ? previous.address + previous.bytes.length : fn.address;
    if (!Number.isSafeInteger(address) || address !== expected || !bytes.length || address + bytes.length > fn.address + fn.size) fail('Noncontiguous or out-of-symbol instruction bytes');
    if (!assembly) {
      if (!previous) fail('Orphan instruction-byte continuation');
      previous.bytes = Buffer.concat([previous.bytes, bytes]);
    } else {
      if (instructions.length >= 32768 || /\(bad\)|^\.byte/.test(assembly)) fail('Unsupported or undecoded instruction');
      instructions.push({ address, bytes, assembly });
    }
    if (instructions.at(-1).bytes.length > 15) fail('x86 instruction exceeds 15 bytes');
  }
  if (!seen || !instructions.length || !Buffer.concat(instructions.map(i => i.bytes)).equals(fn.bytes)) fail('Disassembly does not exactly cover ELF function bytes');
  return instructions;
}

const PREFIXES = new Set(['bnd', 'notrack', 'rep', 'repz', 'repnz', 'repne', 'repe', 'data16', 'addr32', 'cs', 'ds', 'es', 'fs', 'gs', 'ss', 'lock']);
function transfer(instruction) {
  const parts = instruction.assembly.split(/\s+/);
  while (PREFIXES.has(parts[0]) || /^rex(?:\.[WRXB]+)?$/.test(parts[0])) parts.shift();
  const mnemonic = parts.shift(), operand = parts.join(' ');
  let kind = 'ordinary';
  if (/^jmp[wql]?$/.test(mnemonic)) kind = 'jump';
  else if (/^j[a-z]+$/.test(mnemonic) || /^loop(?:e|ne|z|nz)?$/.test(mnemonic)) kind = 'conditional';
  else if (/^call[wql]?$/.test(mnemonic)) kind = 'call';
  else if (/^(?:ret|lret|iret)[wql]?$/.test(mnemonic)) kind = 'return';
  else if (/^(?:ud[012]|hlt|int[013]?|into|syscall|sysenter|sysexit|sysret[wql]?|xbegin|xabort|ljmp[wql]?|lcall[wql]?)$/.test(mnemonic)) kind = 'unsupported-transfer';
  const targetMatch = ['jump', 'conditional', 'call'].includes(kind) && operand.match(/^([a-fA-F0-9]+)(?: <[^>]+>)?$/);
  const target = targetMatch ? parseInt(targetMatch[1], 16) : null;
  if (target !== null && !Number.isSafeInteger(target)) fail('Unsafe branch address');
  return { kind, mnemonic, operand, target };
}

/** A direct-transfer structural graph. It is not decompilation or a reachable-code proof. */
export function summarizeControlFlow(fn, instructions) {
  const starts = new Set(instructions.map(i => i.address)), leaders = new Set([fn.address]);
  const end = fn.address + fn.size, transfers = instructions.map(transfer);
  const local = n => n !== null && n >= fn.address && n < end;
  for (let index = 0; index < instructions.length; index++) {
    const ins = instructions[index], t = transfers[index], next = ins.address + ins.bytes.length;
    if (t.kind !== 'ordinary' && next < end) leaders.add(next);
    if (local(t.target)) {
      if (!starts.has(t.target)) fail('Direct control transfer lands inside an instruction');
      leaders.add(t.target);
    }
  }
  const blocks = [], calls = [], unresolved = [];
  for (let index = 0; index < instructions.length; index++) {
    const i = instructions[index], t = transfers[index];
    if (leaders.has(i.address)) blocks.push({ start: hex(i.address), byteLength: 0, instructionCount: 0, successors: [] });
    const block = blocks.at(-1); block.byteLength += i.bytes.length; block.instructionCount++;
    const next = i.address + i.bytes.length;
    const edge = (kind, target, detail) => block.successors.push({ kind, target: target === null ? null : hex(target), scope: target === null ? 'unresolved' : local(target) ? 'function' : 'outside-function', ...(detail ? { detail } : {}) });
    if (t.kind === 'call') {
      calls.push({ address: hex(i.address), target: t.target === null ? null : hex(t.target), resolution: t.target === null ? 'indirect-unresolved' : 'direct-address-only' });
      if (t.target === null) unresolved.push({ address: hex(i.address), kind: 'indirect-call' });
      if (next < end) edge('if-call-returns', next); else edge('call-return-outside-function', next);
    } else if (t.kind === 'jump' || t.kind === 'conditional') {
      edge(t.kind === 'jump' ? 'jump' : 'conditional-taken', t.target);
      if (t.target === null) unresolved.push({ address: hex(i.address), kind: 'indirect-or-unparsed-transfer' });
      if (t.kind === 'conditional') edge('conditional-not-taken', next);
    } else if (t.kind === 'return') edge('return', null, 'Return destination is not inferred.');
    else if (t.kind === 'unsupported-transfer') {
      edge('unsupported-transfer', null); unresolved.push({ address: hex(i.address), kind: t.mnemonic });
    } else if (next === end || leaders.has(next)) edge('fallthrough', next);
  }
  const constants = instructions.flatMap(i => [...i.assembly.matchAll(/\$0x([a-fA-F0-9]+)/g)].map(m => ({ address: hex(i.address), immediate: `0x${BigInt(`0x${m[1]}`).toString(16)}` })));
  return { name: fn.name, address: hex(fn.address), fileOffset: fn.offset, byteLength: fn.size, bytesSha256: fn.sha256,
    instructionCount: instructions.length, blockCount: blocks.length, blocks, calls, unresolved,
    observedImmediates: constants,
    crc1021Candidate: constants.some(c => c.immediate === '0x1021'),
    candidateMeaning: 'An immediate 0x1021 is a search lead only; it does not establish a CRC algorithm, cryptography, or semantic equivalence.',
    byteCoverage: 'exact-selected-ELF-symbol', graphCoverage: unresolved.length ? 'partial-unresolved-transfers' : 'recognized-direct-transfers-only' };
}
