// Independent tests of the NEW bridge adapter only. Controlled local Node
// subprocesses inject faults; they never impersonate C acceptance evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bridge } from './browser-c-host/bridge.ts';
async function fault(body: string, run: (f: ReturnType<typeof bridge>) => Promise<void>, observer?: (bytes: Uint8Array) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'apex-independent-child-'));
  const binary = join(dir, 'fault-child');
  writeFileSync(binary, `#!${process.execPath}\n${body}\n`); chmodSync(binary, 0o700);
  const f = bridge(binary, 23, observer);
  try { await run(f); }
  finally { await f.dispose().catch(() => {}); rmSync(dir, { recursive: true, force: true }); }
}
for (const [name, body, pattern] of [
  ['EOF during command', 'process.stdin.once("data",()=>process.exit(0))', /exited/],
  ['abnormal child exit', 'process.stdin.once("data",()=>process.exit(7))', /exited/],
  ['unterminated oversized stdout', 'process.stdin.once("data",()=>process.stdout.write("x".repeat(9000)))', /bound/],
  ['malformed control response', 'process.stdin.once("data",()=>process.stdout.write("R nope\\n"))', /match|regular expression/],
  ['notification width overflow', 'process.stdin.once("data",()=>process.stdout.write("N "+"ab".repeat(245)+"\\n"))', /match|regular expression/],
  ['bounded stderr', 'process.stdin.once("data",()=>process.stderr.write("x".repeat(9000)))', /stderr bound/],
] as const) test(`independent bridge fails closed: ${name}`, { timeout: 10000 }, async () => {
  await fault(body, async f => {
    await assert.rejects(f.command('TICK'), pattern);
    await assert.rejects(f.command('TICK'));
    await assert.rejects(f.dispose());
    const exits = f.trace.filter(x => x.origin === 'fixture-process-exit');
    assert.equal(exits.length, 1, 'owned child close was observed');
  });
});
test('independent bridge bounds command bytes before writing', { timeout: 10000 }, async () => {
  await fault('process.stdin.resume()', async f => {
    await assert.rejects(f.command('x'.repeat(491)), /input bound/);
    await assert.rejects(f.command('TICK\nTICK'), /input bound/);
    assert.equal(f.trace.filter(x => x.origin === 'fixture-command').length, 0);
    await f.dispose();
  });
});
test('independent bridge times out unresponsive owned child and waits for close', { timeout: 10000 }, async () => {
  await fault('process.stdin.resume()', async f => {
    await assert.rejects(f.command('TICK'), /command timeout/);
    await assert.rejects(f.dispose());
    assert.equal(f.trace.filter(x => x.origin === 'fixture-process-exit').length, 1);
  });
});
for (const [name, response] of [
  ['wrong serial', 'R 2 0 0 0 0 0 7\n'],
  ['unsafe integer', 'R 1 0 0 0 999999999999999999999999 0 7\n'],
  ['invalid connection handle', 'R 1 0 0 0 0 0 65536\n'],
  ['invalid ATT return code', 'R 1 99 0 0 0 0 7\n'],
  ['impossible stream length', 'R 1 0 0 999 0 0 7\n'],
] as const) test(`independent bridge rejects correlated-control fault: ${name}`, { timeout: 10000 }, async () => {
  await fault(`process.stdin.once('data',()=>process.stdout.write(${JSON.stringify(response)}))`, async f => {
    await assert.rejects(f.command('TICK'));
    await assert.rejects(f.dispose());
  });
});
test('independent bridge rejects high-bit bytes rather than ASCII-normalizing them', { timeout: 10000 }, async () => {
  await fault(`process.stdin.once('data',()=>{const b=Buffer.from('R 1 0 0 0 0 0 7\\n');b[0]|=128;process.stdout.write(b);})`, async f => {
    await assert.rejects(f.command('TICK'));
    await assert.rejects(f.dispose());
  });
});
test('independent bridge rejects notification bytes following completed control response', { timeout: 10000 }, async () => {
  await fault(`process.stdin.once('data',()=>process.stdout.write('R 1 0 0 0 0 0 7\\nN 4158505f5245414459\\n'))`, async f => {
    await f.command('TICK');
    await assert.rejects(f.dispose());
    assert.equal(f.trace.filter(x => x.origin === 'C-notification').length, 0);
  });
});
test('independent fake successful control ACK cannot manufacture READY or session identity', { timeout: 10000 }, async () => {
  const { BleTransport } = await import('../packages/core/ble-transport.ts');
  const { DeviceSession } = await import('../packages/core/session.ts');
  await fault(`let b='';process.stdin.on('data',d=>{b+=d;while(b.includes('\\n')){const i=b.indexOf('\\n'),line=b.slice(0,i);b=b.slice(i+1);process.stdout.write('R '+line.split(' ')[0]+' 0 0 0 0 0 7\\n');}});`, async f => {
    const candidate = await f.manager.chooseAccessory();
    const transport = new BleTransport(f.manager, candidate.id, { timeoutMs: 100 });
    const session = new DeviceSession(transport, { timeoutMs: 200 });
    try {
      await assert.rejects(session.open());
      assert.equal(session.info, null);
      assert.equal(f.trace.filter(x => x.origin === 'C-notification').length, 0);
    } finally { await session.close(); }
  });
});

test('independent shared bridge observer receives an isolated copy', async () => {
  let observed = 0;
  await fault(`process.stdin.once('data',()=>process.stdout.write('N abcd\\nR 1 0 0 0 0 0 7\\n'))`, async f => {
    await f.command('TICK');
    assert.equal(observed, 1);
    assert.deepEqual(f.trace.filter(x => x.origin === 'C-notification').map(x => x.value), ['abcd']);
    await f.dispose();
  }, bytes => { observed++; assert.deepEqual([...bytes], [171,205]); bytes.fill(0); });
});
test('independent shared bridge observer exception fails command and retires child', async () => {
  await fault(`process.stdin.once('data',()=>process.stdout.write('N abcd\\nR 1 0 0 0 0 0 7\\n'))`, async f => {
    await assert.rejects(f.command('TICK'), /observer rejected/);
    await assert.rejects(f.dispose(), /observer rejected/);
    assert.equal(f.trace.filter(x => x.origin === 'fixture-process-exit').length, 1);
  }, () => { throw new Error('observer rejected'); });
});
