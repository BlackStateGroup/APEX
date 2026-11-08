# Android service-data workbench

The Devices tab now offers a separate experimental Android-only card. Existing
advertised-UUID collection is not broadened. Users must explicitly opt in for each
session to transient SDK reception of all nearby advertisements, with JavaScript
selection of FCD2 or FEAA service data. Selected sources can contain unrelated
fields. Use only with controlled owned or explicitly authorized hardware.

The coordinator consumes consent on Start and clears it on selection, tab leave,
background, clearing and completion. Start rechecks foreground and synchronous
App busy refs. Stop is available during preparation. Task settlement releases the
UI busy lock, but uncertain results separately fence device work and inspection.
Android Reset remains available after settlement and only confirmed success clears
that fence. Reset does not restart scanning or recover the rejected result.

Completion reason and all eight controller metrics are presented separately.
Sources appear only after a reusable result, four per page; inspection copies the
exact selected-source document into existing Analysis. No automatic persistence or
provider submission is added. Limits remain cooperative JS acceptance/retention
limits, not native queue/cache bounds or RF-passivity/OS-erasure guarantees.

## Validation scope

Pure coordinator and native mock regression tests plus TypeScript/offline web
export are development checks only. No phone scan, permissions, native build,
physical validation or browser scenario execution was performed for this change.
iOS is disabled because the pinned bridge lacks native destruction acknowledgement.

## Authored native acceptance scenarios (not executed)

- On controlled Android hardware, verify Start stays disabled until one-session
  opt-in. Change service and confirm consent clears. Never enable this mode on
  uncontrolled nearby devices merely to test the UI.
- Stop while the permission/readiness operation is pending. Confirm no new device
  task can start until cleanup settles; background and Devices-tab leave must
  cancel without a restart on return.
- Inject hung/rejected acquisition, start, stop and destruction in the native mock
  harness. After uncertain completion, inspection and both observation modes, NFC
  and accessory work remain fenced; explicit Android Reset remains reachable.
- Confirm reset refusal while native effects remain pending, confirmed recovery
  only after teardown, and fresh opt-in after recovery. Old uncertain sources
  must never become inspectable following late teardown or Reset.
- For a reusable mock result of nine rows, check pages contain 4/4/1 sources and
  boundaries clamp. Inspection must transfer the exact selected source into
  Analysis without saving, parsing automatically, or submitting to a provider.
