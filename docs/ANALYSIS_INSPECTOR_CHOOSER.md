# Memory-only Analysis inspector chooser

Analysis opens at Recording and offers fourteen inspectors in one single-column chooser.
The current selection survives tab changes, but reload resets it. Opening/closing
the chooser does not deactivate the current inspector. Selection closes the
chooser and requests shared scroll-to-top without loading, declaring, analysing,
building or saving anything. All controllers remain in stable App positions;
Recording's one shared NEC/CAN/REA controller remains in App. The trial builder's
hidden wrapper keeps authoring forms mounted.

Both Devices BLE inspection routes preserve exact source text and select BLE /
BTHome. Phone capture preserves text and expected platform and selects Phone NDEF
fields, never serialized NDEF or Static NFC data area. Serialized NDEF and the
explicit-mode static byte inspector remain separate choices. Handoff IDs increase across navigation. A per-mount
source gate consumes each monotonic ID once, including while hidden, so a same-ID
object reconstruction cannot replace later edits. A newly staged BLE source
selects trials only after stage succeeds, without creating or adding a trial.
Explicitly opening a prepared HCI event document delivers its exact JSON once to
the separate HCI document inspector without automatically verifying it.
Explicitly staging a verified HCI report routes exact document/index to the named
comparison slot once. The destination still requires explicit verification and
comparison; the other slot and pending local save remain unchanged.
Verified evidence reopens inline in Evidence, not in an Analysis inspector.

Leaving IR/HCI/HCI-document/static NFC clears results and fences pending hash publication while retaining
draft, declaration and rejected-edit fences (and explicit static NFC mode). Other inspectors preserve existing
state and pending-save semantics. A hidden pending write still completes against
its original snapshot. Navigation does not cancel writes or clear bookkeeping.

I/Q has a separate memory-only inspector. Web file selection only stages bounded
handles; explicit Inspect reads and hashes the pair. Native arbitrary-file import
is unavailable. Exit/background releases the selection and report; an outstanding
read/hash job keeps its slot until settlement. Navigation fences publication, not
cancellation or erasure. No journal or acquisition path is added.

The Wi-Fi security report opens a memory-only summary inspector. Its separate
mobile status card reads the explicitly selected APEX HTTPS companion on demand.
See [setup and scope](WIFI_STATUS_PEER.md).

## Verification scope

Host tests cover IDs, routes, source wiring, stage-only behavior, new handoffs
while saves are pending, and existing deferred-save/hash/rejected-edit coverage.
These are not proof of mounted React scheduling or phone presentation. Typecheck
and Playwright discovery are separate checks. Browser execution was not run;
actual phone layout, keyboard, scroll position and accessibility acceptance remain
unrun. No native/device action or remote publication was performed.

Raw logs are under `review-evidence/analysis-inspector/`. Initial typecheck failed
because React Native's ScrollView is a function component; the final ref uses a
narrow ComponentRef pick and callback. An initial new source assertion misstated
the existing hidden-wrapper syntax. Three old source assertions expected all
Analysis workbenches active; they now assert their explicit inspector conditions.
