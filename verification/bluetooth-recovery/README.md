# Explicit Bluetooth recovery

Five pure coordinator tests and 28 existing native-wrapper/scan tests passed
(33 total), followed by full semantic TypeScript, using direct local binaries
and CI/Expo/npm offline, telemetry and notifier safeguards. See focused.log and
typecheck.log. No browser/native/device execution occurred.

An independent review of the ownership commits passed 28 focused tests and
TypeScript. The recovery integration was then independently reviewed and its
initial 32-test suite passed. Review found no release/guard blocker, but identified
expected old-handle cleanup after destruction and overly broad wording about UI
preservation. Both were clarified. A fifth test now exercises the actual
DeviceSession/BleTransport local stack after simulated manager invalidation.

Destruction success gates clearing the BLE session and candidate list; ordinary
scan completion can update its own UI before destruction settles. USB/host/
simulator sessions are preserved. No automatic restart, OS setting change,
evidence deletion or physical teardown proof is claimed. The native wrapper
still refuses shutdown while connection setup/cancellation is pending.

Further source review found that PLX 3.5.1 iOS destroyClient is a void bridge
method, not a native completion acknowledgement. The recovery UI is disabled on
iOS. The native quarantine correction and new Android-only exclusive backend
were subsequently integrated in f1b0ba0/d4c7dca and independently reviewed.
The mock manager promise must not be mistaken for evidence the real iOS bridge
provides that acknowledgement.
