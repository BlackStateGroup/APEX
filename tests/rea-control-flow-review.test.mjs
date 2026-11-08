import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, readElfFunctions, parseFunctionDisassembly, summarizeControlFlow } from '../tools/reverse-engineering/elf-control-flow.mjs';

const fixture = hex => {
  const bytes = Buffer.from(hex, 'hex');
  return { name: 'fixture', address: 0x1000, size: bytes.length, offset: 0, bytes, sha256: digest(bytes) };
};
// These spellings were independently checked against GNU objdump's x86-64 decoder.
for (const [hex, assembly] of [
  ['66c3', 'retw'], ['66cf', 'iretw'], ['66cb', 'lretw'],
  ['48c3', 'rex.W ret'], ['40c3', 'rex ret'], ['41c3', 'rex.B ret'],
]) test(`review: ${assembly} terminates its structural block without false fallthrough`, () => {
  const fn = fixture(hex + '90');
  const byteText = hex.match(/../g).join(' ');
  const listing = `0000000000001000 <fixture>:\n 1000:\t${byteText}\t${assembly}\n 1002:\t90\tnop\n`;
  const report = summarizeControlFlow(fn, parseFunctionDisassembly(listing, fn));
  assert.equal(report.blockCount, 2);
  assert.equal(report.blocks[0].successors.length, 1);
  assert.equal(report.blocks[0].successors[0].kind, 'return');
  assert.equal(report.blocks[0].successors[0].target, null);
});

test('review: complete bytes under wrong function heading are rejected', () => {
  assert.throws(() => parseFunctionDisassembly('0000000000001000 <other>:\n 1000:\tc3\tret\n', fixture('c3')));
});
test('review: returning to selected bytes after another function heading does not bridge coverage', () => {
  const listing = '0000000000001000 <fixture>:\n 1000:\t90\tnop\n0000000000001001 <other>:\n 1001:\tc3\tret\n';
  assert.throws(() => parseFunctionDisassembly(listing, fixture('90c3')));
});
test('review: overlong wrapped x86 instruction is rejected', () => {
  const fn = fixture('66'.repeat(15) + '90');
  const listing = `0000000000001000 <fixture>:\n 1000:\t${'66 '.repeat(7)}\tdata16 nop\n 1007:\t${'66 '.repeat(8)}90\n`;
  assert.throws(() => parseFunctionDisassembly(listing, fn), /15 bytes/);
});
test('review: conditional exit at symbol boundary is explicit outside-function edge', () => {
  const fn = fixture('7500');
  const report = summarizeControlFlow(fn, parseFunctionDisassembly('0000000000001000 <fixture>:\n 1000:\t75 00\tjne 1002 <outside>\n', fn));
  assert.deepEqual(report.blocks[0].successors.map(e => [e.kind, e.scope, e.target]), [
    ['conditional-taken', 'outside-function', '0x1002'],
    ['conditional-not-taken', 'outside-function', '0x1002'],
  ]);
});


test('review: aliasing symbol tables cannot multiply the aggregate parsing budget', () => {
  const symbolCount = 50001, symbolsOffset = 344;
  const bytes = Buffer.alloc(symbolsOffset + symbolCount * 24);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]).copy(bytes);
  bytes.writeUInt16LE(2, 16); bytes.writeUInt16LE(62, 18); bytes.writeUInt32LE(1, 20);
  bytes.writeBigUInt64LE(64n, 40); bytes.writeUInt16LE(64, 52);
  bytes.writeUInt16LE(64, 58); bytes.writeUInt16LE(4, 60);
  // Two symtabs alias one small backing range; each is below the individual limit.
  const strings = 64 + 64;
  bytes.writeUInt32LE(3, strings + 4);
  bytes.writeBigUInt64LE(320n, strings + 24); bytes.writeBigUInt64LE(1n, strings + 32);
  for (const index of [2, 3]) {
    const section = 64 + index * 64;
    bytes.writeUInt32LE(2, section + 4);
    bytes.writeBigUInt64LE(BigInt(symbolsOffset), section + 24);
    bytes.writeBigUInt64LE(BigInt(symbolCount * 24), section + 32);
    bytes.writeUInt32LE(1, section + 40); bytes.writeBigUInt64LE(24n, section + 56);
  }
  assert.throws(() => readElfFunctions(bytes, ['fixture']), /Aggregate.*budget/i);
});
