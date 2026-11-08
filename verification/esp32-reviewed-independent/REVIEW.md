# Independent review of isolated ESP32-S3 target

Reviewed implementation commit: `32507d4c78538b162cc017276a27334339be6efc`.
Reviewed derivative BLE SHA-256: `4c4a7ac3829f87088c8c9bebbe361be752de200943401986c6cb69f20408dd7c`.
Historical BLE SHA-256: `359d5b601357fff0c10d270608c04f9a6c39db90c3be28672e3e4ac7b0f59876`.
Portable core SHA-256: `8ad23b15b4243c3cc82a63209d718f20cee476e69e38e4857d38d062541188ee`.

## Finding

No new blocking defect found within the explicitly assumed serialized, non-reentrant NimBLE callback model. This is a conditional source/host review, not ESP-IDF compatibility or device approval. The staging self-pointer repair, committed self-pointer repair, queue admission, partial frame rollback and persistent fence are necessary and exercised independently. The original six files match both content and Git blob hashes in the preserved manifest; portable core is unchanged.

## Independent evidence

Run `python3 tests/esp32-independent/run.py` in this checkout. It creates private temporary copies, compiles actual adapter C and actual portable core using GCC with deliberately fake headers, never calls startup, then removes temporary binaries. It does not reproduce adapter behavior in a model.

Eight probe groups pass in normal, UndefinedBehaviorSanitizer and AddressSanitizer configurations:

1. 100 combinations of occupied queue slots (0–4) and coalesced incoming requests (1–20). Check exact parser/queue/counter/timer rollback, successful exact-byte retry when capacity permits, and output sizes.
2. A 512-byte payload with a retained 488-byte frame prefix while output queue is full. Rejected final tail leaves the entire parser intact; exact retry emits the response once.
3. Malformed input, resynchronization counters, five valid responses and trailing partial prefix roll back together. Splitting the rejected input subsequently succeeds.
4. Four-slot ring wraps at slot three with a partially sent head; later slots and repeated subscription preserve byte-exact response FIFO.
5. Timer scheduling fails at READY, first admission, successful partial notification and failed notification. All fence despite termination failure. Foreign disconnect cannot release; matching disconnect does.
6. Ten allocation/notification failures fence regardless of termination return success/failure, including after a successful partial chunk. Ownership counters balance under the explicitly selected fake consume-on-error contract.
7. Invalid MTU fences without scheduling more work.
8. A full output queue still accepts response-kind protocol frames which produce no response.

All eight intentional actual-source mutants were detected: missing staging self-pointer, missing committed self-pointer, ignored overflow, repeated READY, missing fence latch, ignored timer failure, eleventh retry instead of tenth, and wrong ring slot. Each exact failing assertion is retained in `mutant-*.log`; mutation summary is `mutations.log`. Mutants exist only in temporary copies, not production files.

AddressSanitizer passed with leak detection disabled. Initial LeakSanitizer failure due to execution ptrace is retained in `asan-initial-lsan-runtime-failure.log`; no leak-sanitizer pass is claimed. Explicit fake mbuf allocation/free counts balance. An initial compile omitted the historical header include directory and failed with `ble_accessory.h: No such file or directory`; adding `-Ifirmware/esp32s3/main` corrected the harness command, not production code.

GCC `-fstack-usage` output is retained. Host ABI static sizes: peer 576 bytes, staging 2736, queue 2176. Host unoptimized adapter access frame is 304 bytes; core stream feed is 624 and dispatch 1104. These nested frames plus callbacks/library/SDK overhead require target stack measurement; static staging does NOT imply negligible stack usage. These are host measurements, not ESP32 ABI/RAM acceptance.

## Unverified acceptance gates and conditional risks

- No selected SDK headers, SDK build, prebuild, install, native target execution, device, radio, flash, network, remote or settings actions were performed. Fake types/functions are not authentic declarations or ABI evidence.
- All mutable state is unsynchronized. The transaction is intentionally non-reentrant. SDK event/callout serialization and absence of relevant inline reentrant disconnect/subscribe callbacks must be verified. Reentrancy during `notify_custom` could invalidate the queued slot before the post-call offset/count update; the current code does not independently protect against that unsupported schedule.
- Stale timer execution has no epoch token. Under serialized callbacks it can only service the current eligible queue and cannot resurrect a fenced queue. Whether stopped/queued callbacks can coexist, accelerate retries or duplicate scheduled work is an SDK callout contract question, not resolved by a one-pending-bit fake timer.
- Same numeric connection-handle reuse depends on ordered disconnect/connect events. Handles alone do not independently identify generations.
- No host-reset callback is installed. A host reset without matching GAP disconnect may leave stale ownership; sync does not release it and the advertising guard stays closed. This is fail-closed availability loss, not demonstrated cross-session leakage. Reviewed separately with builder; builder documented it in follow-up `67c5e25`, without adding an unverified SDK reset hook. Authorized restart and SDK reset ordering remain acceptance gates.
- `ble_gatts_notify_custom` consume-on-success-and-error is assumed by the fake. Real allocation ownership, callback timing and notification pressure must be checked against the selected NimBLE implementation.
- NVS startup aborts rather than erasing, and the BLE opt-in preprocessor path defaults off by inspection. Actual Kconfig/CMake discovery, default configuration, SDK boot and USB startup remain unbuilt. Reused historical USB app_main still initializes USB if executed.
- A write producing more than four responses cannot ever fit; clients must split or close rather than retry indefinitely. A scheduling failure after parser commit returns an ATT error and fences the session, so parser rollback is promised only for admission overflow, not every error path.
- Portable dispatch is currently side-effect-free beyond response generation. Adding side effects invalidates transactional rollback assumptions.

This review supplements, rather than replaces, the baseline known-failure evidence and the separate expanded harness worker's results. No baseline logs were modified and no production fixes were made.
