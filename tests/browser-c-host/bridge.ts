// Fully fake host/GATT transport. Only N records contain actual C output bytes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebAxpManager } from '../../src/experimental/web-axp.ts';
import type { WebAxpCharacteristic, WebAxpHost, WebAxpServer } from '../../src/experimental/web-axp.ts';
import { AXP_SERVICE, AXP_WRITE, AXP_NOTIFY } from '../../packages/core/ble-transport.ts';

export function bridge(binary: string, mtu: 23 | 517, onCNotification?: (bytes: Uint8Array) => void) {
  const child = spawn(binary, [String(mtu)], { stdio: ['pipe', 'pipe', 'pipe'] });
  const trace: { origin: string; value: string }[] = [];
  let buffer = '', stderr = '', total = 0, commands = 0, failure: Error | undefined;
  let pending: { sequence: number; resolve: (v: number[]) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  let notify = (_bytes: Uint8Array) => {};
  let exited = false;
  const exit = new Promise<{ code: number | null; signal: string | null }>(resolve => {
    child.once('close', (code, signal) => { trace.push({ origin: 'fixture-process-exit', value: JSON.stringify({ code, signal, stderr }) }); exited = true; if (pending) fail(new Error(`bridge exited: ${code}/${signal}: ${stderr}`)); resolve({ code, signal }); });
  });
  function fail(error: Error) {
    failure ??= error;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = undefined; }
    if (!exited) child.kill('SIGKILL'); // Only the owned, non-forking host fixture.
  }
  child.on('error', fail); child.stdin.on('error', fail);
  child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString(); if (stderr.length > 8192) fail(new Error('stderr bound')); });
  child.stdout.on('data', (bytes: Buffer) => {
    try {
      total += bytes.length; assert.ok(total <= 262144, 'output bound');
      assert.ok(bytes.every(byte => byte < 128), 'non-ASCII output');
      buffer += bytes.toString('ascii'); assert.ok(buffer.length <= 8192, 'buffer bound');
      while (buffer.includes('\n')) {
        const i = buffer.indexOf('\n'), line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
        assert.ok(pending, 'unsolicited record');
        if (/^N (?:[0-9a-f]{2}){1,244}$/.test(line)) {
          trace.push({ origin: 'C-notification', value: line.slice(2) });
          const notification = Uint8Array.from(Buffer.from(line.slice(2), 'hex'));
          onCNotification?.(notification.slice());
          notify(notification);
        } else {
          assert.match(line, /^R \d{1,3} \d{1,2} \d \d{1,3} \d{1,5} \d{1,5} \d{1,5}$/);
          trace.push({ origin: 'fixture-result', value: line });
          const [sequence, ...result] = line.slice(2).split(' ').map(Number);
          assert.equal(sequence, pending!.sequence, 'command correlation');
          assert.ok(result.every(Number.isSafeInteger));
          assert.ok([0, 3, 13, 14, 17].includes(result[0]!));
          assert.ok(result[1]! <= 4 && result[2]! <= 524);
          assert.ok(result[3]! <= 32768 && result[4]! <= 32768);
          assert.equal(result[3], result[4], 'fake mbuf balance');
          assert.ok(result[5] === 7 || result[5] === 65535);
          const current = pending!; pending = undefined; clearTimeout(current.timer); current.resolve(result);
        }
      }
    } catch (e) { fail(e as Error); }
  });
  let tail = Promise.resolve();
  function command(line: string, origin = 'fixture-command') {
    const result = tail.then(() => new Promise<number[]>((resolve, reject) => {
      if (failure || exited) { reject(failure ?? new Error('bridge closed')); return; }
      if (++commands > 512 || line.length > 490 || line.includes('\n')) { reject(new Error('input bound')); return; }
      trace.push({ origin, value: line });
      pending = { sequence: commands, resolve, reject, timer: setTimeout(() => fail(new Error('bridge command timeout')), 2000) };
      child.stdin.write(commands + ' ' + line + '\n');
    }));
    tail = result.then(() => {}, () => {}); return result;
  }
  const watchdog = setTimeout(() => fail(new Error('bridge lifetime timeout')), 15000);
  const values = new Set<() => void>(), disconnects = new Set<() => void>();
  let value: DataView | null = null, connected = false, closing: Promise<number[]> | undefined;
  const emit = (bytes: Uint8Array) => {
    const backing = new Uint8Array(bytes.length + 7); backing.set(bytes, 3);
    value = new DataView(backing.buffer, 3, bytes.length);
    for (const callback of [...values]) callback();
  };
  notify = emit;
  const characteristic: WebAxpCharacteristic = {
    properties: { notify: true }, get value() { return value; },
    addEventListener(_type, callback) { values.add(callback); },
    removeEventListener(_type, callback) { values.delete(callback); },
    async startNotifications() { assert.equal((await command('SUBSCRIBE'))[0], 0); return characteristic; },
    async stopNotifications() { return characteristic; },
  };
  const write: WebAxpCharacteristic = {
    ...characteristic, properties: { write: true },
    async writeValueWithResponse(bytes) {
      assert.ok(bytes.length > 0 && bytes.length <= 20, 'real browser conservative cap');
      const result = await command('W ' + Buffer.from(bytes).toString('hex'), 'client-write');
      if (result[0] !== 0) throw new Error(`C ATT rejection ${result[0]}`);
    },
    addEventListener() {}, removeEventListener() {},
  };
  const server: WebAxpServer = {
    get connected() { return connected; }, async connect() { connected = true; return server; },
    disconnect() { connected = false; closing ??= command('CLOSE'); void closing.catch(() => {}); },
    async getPrimaryService(uuid) {
      assert.equal(uuid, AXP_SERVICE);
      return { async getCharacteristic(id: string) { assert.ok(id === AXP_WRITE || id === AXP_NOTIFY); return id === AXP_WRITE ? write : characteristic; } };
    },
  };
  const host: WebAxpHost = { secureContext: true, bluetooth: { async requestDevice(options) {
    assert.deepEqual(options, { filters: [{ services: [AXP_SERVICE] }] });
    return { name: 'host-only C bridge', gatt: server,
      addEventListener(_type, callback) { disconnects.add(callback); },
      removeEventListener(_type, callback) { disconnects.delete(callback); } };
  } } };
  const manager = new WebAxpManager(host, { effectTimeoutMs: 2500, setupTimeoutMs: 5000, cleanupTimeoutMs: 2500 });
  return { manager, trace, values, disconnects, command, emit,
    async retired() { assert.ok(closing, 'client requested disconnect'); return await closing; },
    async dispose() {
      try {
        await tail;
        child.stdin.end();
        const result = await exit;
        assert.equal(result.signal, null, failure?.message ?? 'unexpected signal'); assert.equal(result.code, 0, stderr || failure?.message || 'nonzero fixture exit');
        assert.equal(buffer, ''); if (failure) throw failure;
      } finally { clearTimeout(watchdog); if (pending) clearTimeout(pending.timer); if (!exited) child.kill('SIGKILL'); }
    },
  };
}
