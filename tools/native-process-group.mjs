import { setTimeout } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

// Existence includes zombies. False negatives are unsafe, so only ESRCH proves
// absence. This cannot detect descendants that deliberately escape the group.
/**
 * @param {number} group
 * @param {{probe?: (pid: number, signal: number) => unknown, wait?: (ms: number) => Promise<void>, now?: () => number, timeoutMs?: number, deadlineExtension?: () => number | undefined}} [options]
 */
export async function waitForProcessGroup(group, {
  probe = process.kill,
  wait = ms => setTimeout(ms),
  now = () => performance.now(),
  timeoutMs = 6000,
  deadlineExtension = () => undefined,
} = {}) {
  const started = now();
  const initialDeadline = started + timeoutMs;
  while (true) {
    try { probe(-group, 0); }
    catch (error) {
      if (error.code === 'ESRCH') return;
      throw new Error(`Cannot verify process group ${group} is gone (${error.code ?? error.message}); retain sources and lock`, { cause: error });
    }
    // The caller may supply one fixed first-interrupt deadline, never a rolling one.
    const deadline = Math.max(initialDeadline, deadlineExtension() ?? initialDeadline);
    if (now() >= deadline) throw new Error(`Process group ${group} still exists after ${now() - started}ms; retain sources and lock`);
    await wait(Math.min(50, deadline - now()));
  }
}
