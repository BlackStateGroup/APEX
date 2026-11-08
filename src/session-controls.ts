import type { DeviceSession } from '../packages/core/session.ts';

/** A closed or partially opened session still needs explicit local cleanup.
 * Capability negotiation is not evidence that the session reference was released. */
export function sessionControls(session: Pick<DeviceSession, 'state'> | null) {
  return { held: session !== null, closed: session?.state === 'closed' };
}

/** Clear only the selected object, and only after its transport confirms release. */
export function clearReleasedSession<T extends Pick<DeviceSession, 'transportReleasePending'>>(
  slot: { current: T | null }, expected: T | null,
): boolean {
  if (slot.current !== expected || expected?.transportReleasePending) return false;
  slot.current = null;
  return true;
}
