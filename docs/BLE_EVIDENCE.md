# Offline BLE evidence journal

Current validation is recorded in [APEX_CONTINUATION.md](../APEX_CONTINUATION.md).
The original integration notes below retain the earlier dependency blocker; it
was later resolved with an authorized locked installation. Full semantic
TypeScript and three JavaScript exports now pass at the recorded checkpoint.
Browser execution and native/device acceptance remain separate unfinished gates.
See [stored envelope validation](EVIDENCE_ENVELOPE.md) for duplicate-key refusal
and the exact canonical digest boundary.

The local continuation adds the `analysis.ble` kind to the existing evidence
journal. This includes a local Analysis workbench and Evidence reopen flow, not a new
native scanner. Browser/mobile execution of the new UI is still unverified. Existing NFC, NEC, CAN and firmware
records keep their database schema, canonicalization and digest semantics.

`prepareBleEvidenceInput(document)` validates the existing BLE offline envelope
and derives `offline-fixture` or `offline-import` from its declared provenance.
It does not write, export, access radios or contact a model. Pass its result to
the existing `EvidenceStore.save` when the user chooses to save a document.

The payload retains the exact input string, including whitespace, under a
versioned `BLE-offline-document` format. `readBleEvidencePayload` interprets that
document using the current decoder. A stored, caller-supplied decoded result is
never trusted; extra payload fields are rejected. Both save and read check that
the record's source agrees with the retained document. Native-source claims are
rejected, and interpretation always retains the existing false authentication
and physical-reception verification flags.

The journal's input limit is **4096 UTF-16 characters**, narrower than the
standalone decoder's 16384-character import cap. Larger documents are rejected
without truncation or partial save. This fits the existing bounded metadata
journal; it is not a bulk RF capture store. The document can contain device
labels, raw host-visible bytes and sensor values, so it remains local and must
not be silently sent to a model or remote service. The original storage remains
unencrypted and unsigned; the digest detects changed record content, not the
truth of a measurement, authenticity of a transmitter or confidentiality.

`EvidenceRecord.observedAt` is the journal timestamp supplied to `save` (current
time by default). A recorded-import document separately retains the
source-supplied `provenance.capturedAt`. Neither time is hardware attestation.
Synthetic fixtures cannot claim a capture timestamp.

Tests cover exact string retention over SQLite reopen; Android/iOS shape
preservation; BTHome public-example telemetry; encrypted BTHome staying opaque;
source and extra-field rejection; integrity mismatch after a valid text change;
the exact size limit; old-kind compatibility; and failed insert preservation.
No new schema migration, runtime dependency or model provider is required.

Run with Node 24:

```sh
node --test tests/ble-evidence.test.ts tests/evidence.test.ts
```

## Offline workbench integration

The Analysis tab now has an isolated Offline BLE / BTHome panel. Paste the existing
JSON envelope or load the synthetic BTHome demo, then explicitly interpret and
save locally. This is a text import, not a file picker or native capture. Findings
include exact decoded fields, opaque/invalid states, provenance and false
reception/identity verification flags. Editing removes stale findings and disables
save until interpretation succeeds again. Source is derived from the envelope,
never from clicking a demo/import button; editing a synthetic document does not
turn it into a recording. Recorded-import metadata remains an unverified claim.

Exact documents above the journal's 4096-character cap may be interpreted up to
the decoder cap but cannot be saved. No input is silently truncated. Repeated
save taps are guarded synchronously; the same unchanged document cannot be saved
again in that panel after success. Edits during a pending save do not alter its
snapshot or restore stale results on completion. Tab navigation retains the draft.
A successful insert followed by list-refresh failure stays saved, preventing an
accidental duplicate retry. Storage remains unencrypted and local.

Evidence offers **Verify and reopen BLE**. Only after the retained snapshot's
digest passes does the current decoder reinterpret it. Leaving the Evidence tab
or refreshing the record invalidates pending reopen results. This verifies stored
content integrity, not transmitter identity, sensor truth or physical reception.

`tests/ble-workbench.test.ts` exercises the dependency-free workflow and verified
reopen, including iOS normalized fields and encrypted BTHome. New scenarios in
`tests/ui.smoke.spec.mjs` cover persistence, invalid input, edits, pending actions,
repeat actions, navigation and tampered evidence. The Node tests and focused
workflow typecheck run here; TSX syntax emission passes. Playwright scenarios
were authored but **not run** because app/Playwright dependencies are absent.
Full app typechecking, web/mobile builds, native phone collection and physical
reception remain open.
