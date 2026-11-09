import { encode, project, snapshot } from './codec.ts';
import type { Fixture, Projection } from './codec.ts';
/** A future native module owns session allocation. Never reuse a live session,
 * including across JS reloads. execute settles only when native work has drained.
 * cancel requests cooperative cancellation; it does NOT acknowledge completion. */
export interface NativeBridge {
  readonly session: number;
  execute(request: Uint8Array): Promise<Uint8Array>;
  cancel(session: number, request: number): void;
}
export class Cancelled extends Error { constructor() { super('IQ analysis cancelled'); this.name = 'AbortError'; } }
export interface Result { value: Projection; backend: 'javascript' | 'native'; fallback: 'not-configured' | 'native-rejected' | null }
/** Optional, experimental executor, not wired to the app. Default is JS only.
 * One actual operation per client, no queue. Cancellation fences publication and
 * leaves the busy gate held until work settles, even if native never settles. */
const claimedSessions = new Set<number>();
const MAX_SESSIONS_PER_JS_RUNTIME = 1024;
export class OptionalIqExecutor {
  readonly #native: NativeBridge | null;
  readonly #session: number;
  readonly #fallback: (fixture: Fixture) => Projection | Promise<Projection>;
  #next = 0; #disposed = false;
  #job: { id: number; cancelled: boolean; started: boolean } | null = null;
  constructor(fallback: (fixture: Fixture) => Projection | Promise<Projection>, native: NativeBridge | null = null) {
    this.#fallback = fallback; this.#native = native; this.#session = native?.session ?? 0;
    if (typeof fallback !== 'function') throw new Error('JS fallback required');
    if (native) {
      if (!Number.isSafeInteger(this.#session) || this.#session < 1 || this.#session > 0xffffffff) throw new Error('Invalid native session');
      if (claimedSessions.has(this.#session)) throw new Error('Native session already claimed');
      if (claimedSessions.size >= MAX_SESSIONS_PER_JS_RUNTIME) throw new Error('Native session registry exhausted');
      claimedSessions.add(this.#session);
    }
  }
  get busy() { return this.#job !== null; }
  cancel() {
    const job = this.#job; if (!job || job.cancelled) return;
    job.cancelled = true;
    if (job.started) { try { this.#native?.cancel(this.#session, job.id); } catch { /* Still fenced and busy until drain. */ } }
  }
  dispose() { this.#disposed = true; this.cancel(); }
  async run(input: Fixture): Promise<Result> {
    if (this.#disposed) throw new Error('Executor disposed');
    if (this.#job) throw new Error('Executor busy');
    if (this.#next === 0xffffffff) throw new Error('Session exhausted');
    const job = { id: ++this.#next, cancelled: false, started: false }; this.#job = job;
    try {
      const fixture = snapshot(input);
      const live = () => { if (job.cancelled || this.#disposed) throw new Cancelled(); };
      live();
      if (this.#native) {
        try {
          const encoded = encode(fixture, {session:this.#session, request:job.id});
          live(); job.started = true;
          const response = await this.#native.execute(encoded.bytes);
          live();
          const value = project(response, encoded.context); live();
          return {value, backend:'native', fallback:null};
        } catch (error) { live(); /* A rejected/malformed native result falls back, never partially publishes. */ }
      }
      live();
      const value = await this.#fallback(snapshot(fixture)); live();
      return {value, backend:'javascript', fallback:this.#native ? 'native-rejected' : 'not-configured'};
    } catch (error) {
      if (job.cancelled || this.#disposed) throw new Cancelled();
      throw error;
    } finally { this.#job = null; }
  }
}
