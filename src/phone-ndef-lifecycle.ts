import type { PhoneNdefCapture } from '../packages/core/phone-ndef-capture.ts';

/** Inactive can be a transient native permission sheet. It disallows a new
 * Start, but does not cancel an existing read. Only background cancels here;
 * returning active never starts or resumes a read automatically. */
export function updatePhoneNdefLifecycle(state: string, capture: Pick<PhoneNdefCapture, 'cancel'>): boolean {
  if (state === 'background') void capture.cancel('App backgrounded; read cancelled.');
  return state === 'active';
}
