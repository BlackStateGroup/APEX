import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { ByteTransport } from '../../packages/core/transport.ts';

export type RadioReceiveHostMode = 'enabled' | 'quiet' | 'disabled' | 'initialize-failure' | 'stop-failure';
export function buildRadioReceiveHost() {
  const directory = mkdtempSync(join(tmpdir(), 'apex-radio-roundtrip-'));
  const binary = join(directory, 'radio-host');
  const paths = ['firmware/core/apex.c', 'firmware/core/apex.h', 'firmware/radio_rx/rx_service.cpp', 'firmware/radio_rx/rx_service.h', 'tests/radio-receive-host.cpp'];
  const hashes = Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
  const compile = (command: string, args: string[]) => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1048576 });
    if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  };
  try {
    compile('gcc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-c', 'firmware/core/apex.c', '-o', join(directory, 'apex.o')]);
    compile('g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', 'tests/radio-receive-host.cpp', 'firmware/radio_rx/rx_service.cpp', join(directory, 'apex.o'), '-o', binary]);
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
  return { binary, hashes, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}
/** Host protocol integration only. Synthetic receiver, not accessory acceptance. */
export class RadioReceiveHostTransport implements ByteTransport {
  readonly source = 'host' as const;
  readonly writes: Uint8Array[] = [];
  diagnostics = '';
  private child: ChildProcessWithoutNullStreams | undefined;
  private data = new Set<(bytes: Uint8Array) => void>();
  private closed = new Set<(error: Error) => void>();
  private closing: Promise<void> | undefined;
  private exited: Promise<void> = Promise.resolve();
  private binary: string;
  private mode: RadioReceiveHostMode;
  constructor(binary: string, mode: RadioReceiveHostMode = 'enabled') { this.binary = binary; this.mode = mode; }
  onData(listener: (bytes: Uint8Array) => void) { this.data.add(listener); return () => { this.data.delete(listener); }; }
  onDisconnect(listener: (error: Error) => void) { this.closed.add(listener); return () => { this.closed.delete(listener); }; }
  async connect() {
    if (this.child) throw new Error('Host transport cannot be reused');
    const child = this.child = spawn(resolve(this.binary), [this.mode], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.on('data', (bytes: Buffer) => { for (const listener of this.data) listener(new Uint8Array(bytes)); });
    child.stderr.on('data', (bytes: Buffer) => { this.diagnostics = (this.diagnostics + bytes.toString()).slice(-16384); });
    child.stdin.on('error', () => {});
    this.exited = new Promise<void>(resolveExit => child.once('close', (code, signal) => {
      resolveExit();
      if (!this.closing) for (const listener of this.closed) listener(new Error(`Host exited: ${code}/${signal}`));
    }));
    await new Promise<void>((resolveSpawn, reject) => { child.once('spawn', resolveSpawn); child.once('error', reject); });
  }
  async write(bytes: Uint8Array) {
    if (!this.child || this.closing || bytes.length < 1 || bytes.length > 4096) throw new Error('Invalid host write');
    this.writes.push(new Uint8Array(bytes));
    const message = Buffer.alloc(bytes.length + 2);
    message.writeUInt16LE(bytes.length); message.set(bytes, 2);
    await new Promise<void>((resolveWrite, reject) => this.child!.stdin.write(message, error => error ? reject(error) : resolveWrite()));
  }
  disconnect(): Promise<void> {
    if (this.closing) return this.closing;
    const child = this.child;
    this.closing = (async () => {
      if (!child) return;
      child.stdin.end();
      const timer = setTimeout(() => child.kill('SIGKILL'), 500);
      try { await this.exited; } finally { clearTimeout(timer); }
    })();
    return this.closing;
  }
}
