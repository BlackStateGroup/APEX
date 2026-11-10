# First useful iPhone workflow

Acceptance contract, 10 November 2026. Planning only; no new functionality or
physical acceptance is claimed. Preserve the full supplied research programme.

Outcome: import an authorised bounded SigMF recording on an identified iPhone,
analyse it, save original/derived provenance in a case, restart, reopen, export
and independently verify the received copy. Keep synthetic fixtures labelled.

Inspected code: `src/platform/iq-input.native.tsx` implements bounded native pair
selection/staging; `src/iq-workbench.ts` supplies analysis;
`src/platform/evidence-share.native.tsx` shares selected evidence as text, not a
file, and explicitly does not confirm delivery. These components do not establish
that I/Q results and original recordings have a complete durable save/export path.
Trace and complete that integration before claiming an end-to-end capability.

Acceptance steps:
1. Record phone/OS, app commit/build and input hashes. Obtain approved signed installation.
2. Import through Files; verify bytes and refuse incomplete/malformed/oversized pairs.
3. Compare analysis against independent expected results; record engine and parameters.
4. Save case and lineage, terminate app, reopen and compare original bytes/results.
5. Export to an explicitly selected destination; re-import in a fresh context and
   verify received bytes and lineage. Share-sheet return alone is not acceptance.
6. Test cancellation, backgrounding, interrupted save/export, full storage and
   duplicate import. Preserve prior records and reject stale completions.
7. Retain per-step pass/fail/blocked evidence. Only then mark this workflow accepted.

Accessory track: preserve the separate USB-only signed-read lab. If Flipper is
available, recover and audit the vendor RPC/BLE source before shared-manager/UI
integration. Its source location and physical firmware/device are not established
in this checkout. AXP is not a substitute for vendor RPC.

Outstanding inputs: available accessory, phone signing/distribution access and
physical test execution. The hardware question received no answer. No purchase,
installation, merge, provisioning, flashing or RF operation is authorised by this
contract or claimed to have occurred.
