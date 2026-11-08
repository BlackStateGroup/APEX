# Nineteenth combined local checkpoint

Fixed offline runner on clean source f75a74032b71f54dbdf87c81e7f6a6e11070696f.
Started 2026-11-08 03:15:51 UTC, finished 03:16:57 UTC. All nine stages passed,
all tracked process groups settled, result.json and manifest.json identical.

723/723 Node tests, zero skipped; 22 archive and 5 REA preflight contract tests:
750 total, plus portable C. TypeScript, 541-entry inventory, three offline Expo
JavaScript exports and synthetic lab pass. Thirty browser cases were listed,
none executed. Generated export bundles remain outside the source checkpoint.

USB now leases its native object before permission/open, retains late and failed
cleanup ownership, bounds early closure tracking and active/queued writes, and
snapshots actual 1..524-byte fixed-buffer input. Failed native close is permanently
uncertain under unchanged Kotlin: a later retry may be a link-null no-op. Unknown
open without a valid token is also fenced. No guaranteed recovery is claimed.

Session state distinguishes locally closed from transport release. Failed cleanup
retains the exact app session and explicit Disconnect action; stale completion
cannot clear a new session. Late acquisition and listener-registration failures
are covered. A generic early close may fulfill while release remains pending;
the app checks the separate release fact before clearing the slot.

BLE keeps the exact GATT handle and raw acquisition/subscription/write effects
until cleanup settles. Failed automatic cleanup is shared across transport and
session catches, while explicit retry is separate. A final write chunk resolving
after cancellation cannot report success. No-handle acquisition remains uncertain.
Existing confirmed Android manager destruction is separate; the iOS gate is unchanged.

Independent review caught and fixed terminal-release escapes, registration/late
connect gaps, lost BLE cleanup handles, hidden automatic retry and final-chunk
false success. Original failures and intermediate reviewer fixture mistakes are
retained. USB final focused review passed 43 checks; session/BLE independent
original cases passed 70. Overlapping focused counts are not added together.
Seven additional full synthetic session-over-USB cases pass, including a 512-byte
ping payload in a 524-byte frame, fragmented native callbacks and cross-layer
cleanup uncertainty. Parent integrated focused subset passed 104 checks.

All activity is synthetic/local. Kotlin, native BLE manager implementation,
installed BLE dependency, lockfile and protected source registers are unchanged.
No actual native permissions, USB/GATT writes, radio, phone, browser or provider
action occurred. Native/device acceptance and real bridge ordering remain unrun.
Raw outputs are preserved unchanged; runner logs have .txt appended.
Native USB acknowledgement design and stricter response parsing are separate
ongoing work, not part of this checkpoint.
