import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAN_FIXTURE, decodeNec, necFixture, parseCanLog } from '../packages/core/analysis.ts';

test('standard NEC fixture yields expected address and command', () => assert.deepEqual(decodeNec(necFixture()), { protocol: 'NEC', address: 0x10, command: 0x34, evidence: 'offline' }));
test('NEC tolerates bounded timing variation', () => assert.equal(decodeNec(necFixture().map((x, i) => x * (i % 2 ? 1.2 : 0.8))).command, 0x34));
test('NEC rejects incomplete, non-finite, malformed and extended frames', () => {
  for (const value of [necFixture().slice(1), [...necFixture(), 562], necFixture().map((x, i) => i === 0 ? NaN : x), necFixture().map((x, i) => i === 2 ? 10000 : x), necFixture().map((x, i) => i === 3 ? 1687.5 : x)]) assert.throws(() => decodeNec(value));
});
test('classic CAN import preserves timestamps, extended IDs and bytes', () => {
  const frames = parseCanLog(CAN_FIXTURE); assert.equal(frames.length, 2);
  assert.deepEqual(frames[0], { timestamp: '1.000000', channel: 'vcan0', id: 0x123, extended: false, data: [1, 2, 3, 4] });
  assert.equal(frames[1]!.extended, true); assert.equal(frames[1]!.id, 0x1abcdeff);
  assert.deepEqual(parseCanLog('(0.1) can0 001#')[0]!.data, []);
});
test('CAN rejects odd payloads, FD, RTR, error IDs and out-of-range classic IDs', () => {
  for (const line of ['(1.0) can0 123#1', '(1.0) can0 123##10102', '(1.0) can0 123#R', '(1.0) can0 800#00', '(1.0) can0 20000000#00', '(1.0) can0 123#001122334455667788', 'unrecognised']) assert.throws(() => parseCanLog(line));
});
test('CAN import enforces count and size limits', () => {
  assert.throws(() => parseCanLog('x'.repeat(262145)), /limit/);
  assert.throws(() => parseCanLog(Array(2001).fill('(1.0) can0 123#').join('\n')), /2000/);
});
