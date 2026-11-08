import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ByteTransport } from '../packages/core/transport.ts';

export class FirmwareProcessTransport implements ByteTransport {
  readonly source = 'host' as const;
  private child: ChildProcessWithoutNullStreams | null = null;
  private data = new Set<(bytes: Uint8Array) => void>();
  private closed = new Set<(error: Error) => void>();
  private executable: string;
  constructor(executable = fileURLToPath(new URL('../build/apex-firmware', import.meta.url))) { this.executable = executable; }
  async connect(): Promise<void> {
    if (this.child) throw new Error('Firmware process already started');
    const child = spawn(this.executable, [], { stdio: 'pipe' }); this.child = child;
    child.stdout.on('data', (bytes: Buffer) => { for (const listener of this.data) listener(new Uint8Array(bytes)); });
    child.stderr.resume();
    const fail = (error: Error) => { if (this.child === child) { this.child = null; for (const listener of [...this.closed]) listener(error); } };
    child.on('exit', (code, signal) => fail(new Error(`Firmware process exited: ${code ?? signal}`)));
    child.on('error', fail); child.stdin.on('error', fail);
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  }
  async write(bytes: Uint8Array): Promise<void> {
    const child = this.child;
    if (!child) throw new Error('Firmware process is closed');
    await new Promise<void>((resolve, reject) => child.stdin.write(bytes, error => error ? reject(error) : resolve()));
  }
  async disconnect(): Promise<void> {
    const child = this.child; this.child = null;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 1000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.stdin.end();
    });
  }
  onData(listener: (bytes: Uint8Array) => void): () => void { this.data.add(listener); return () => this.data.delete(listener); }
  onDisconnect(listener: (error: Error) => void): () => void { this.closed.add(listener); return () => this.closed.delete(listener); }
}
