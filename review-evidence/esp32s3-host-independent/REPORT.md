# Independent review: restored ESP32-S3 host harness

Verdict: suitable bounded host characterization of the restored transport, not
production acceptance or proof of an SDK ownership/timer contract. No blocking
harness defect found. The deliberately red assertions are transparently labeled
known production failures; their enclosing green test means those defects remain
reproducible, not fixed. Keep this historical test separate from revised-target
acceptance tests.

Reviewed baseline commit: 0309d107a6270e097699ce8ac1799c55ac88bf1d.
Historical source pin: e51750ec0b34b280399877d67e1036058874c373.
Transport SHA-256: 359d5b601357fff0c10d270608c04f9a6c39db90c3be28672e3e4ac7b0f59876.
Transport Git blob: 1e6b7a24c81b1989caee17254a6d77c5ff1818f1.
All six recovery bytes match their manifest and the parent's main checkout at
review time. Core hashes and GCC dependency output are retained alongside this
report. Manifest verification is a repository consistency check, not independent
remote authentication, and does not freeze the portable core (which is separately
pinned by this checkout and recorded hash).

## Independent execution

- Node 24.22.1, GCC 14.2.0; baseline Node wrapper: 1/1 passes.
- Standalone baseline: 17/17 scenario groups, including 10,000 deterministic
  sequential callback/fault steps.
- Both desired-safety modes exit 1 at their expected failed checks.
- Five additional independent probe cases pass normally and under ASan/UBSan
  with detect_leaks=0. No sanitizer diagnostics. Leak acceptance is not claimed.
- No full project suite, dependency installation, native/SDK target build,
  startup, hardware/device/radio use, network, remote change or settings access.

Independent probes reconfirm: one 240-byte ATT write reports success for 20 ping
requests but drops 16 responses; ten notification errors and failed termination
leave an idle timer and live queue, and another write grows the stranded queue;
repeated enabled subscription discards response tail and partial parser input;
pending READY consumes one queue slot; successful terminate request alone does
not clean state until a later injected disconnect.

## Source and fake review

harness.c includes the original ble_accessory.c directly. GCC dependency output
confirms that file, all fake headers and real apex.h, while the compile invocation
links real firmware/core/apex.c. ESP_PLATFORM selects its target identity branch.
Production originals and core were not edited. app_main is not compiled by this
harness. apex_ble_start is compiled but never called; startup functions abort.
Advertising stubs only update counters. No SDK/device libraries are linked.

The malloc/free fake consumes outgoing mbufs on both successful and failed
notify calls, as claimed in the original source comment. Balance assertions are
valid only for that chosen fake contract, not evidence of a selected NimBLE SDK's
contract. Input mbufs are stack-backed flat arrays; chained buffers, real pool
ownership, failure statuses and delivery to a remote peer are not simulated.
No copied queue or parser implementation replaces production logic.

The callout is a boolean, cleared before synchronous callback invocation.
Scheduling always succeeds; timing conversions are identity; terminate never
creates a disconnect automatically. These match the explicit modeling limits,
but exclude scheduler failure, stale events, concurrency/reentrancy and controller
behavior. The deterministic run explores ordered callbacks, not 10,000 independent
sessions or exhaustive interleavings. Captured notify bytes mean fake submission
success, not real peer reception.

The Node wrapper uses a unique mkdtemp directory, direct argument arrays without
a shell, bounded child execution, and finally cleanup. Each scenario-mode run is
a separate executable process with fresh globals; scenarios additionally reset
state. Bounds on fake capture arrays and drain steps prevent accidental runaway.
Compiler lookup uses trusted local PATH and inherited environment; this is process
isolation, not a hardened sandbox against hostile compiler/environment inputs.

## Remaining gates

Validate real SDK headers/API/ABI, mbuf ownership, event serialization, timer
failure behavior and actual board/radio behavior separately when authorized.
The new developed target must not overwrite the six recovery originals. Do not
interpret this review or green historical characterization as fixing the four
transport behaviors above.

Reproduce probes from repository root using installed tools only:

    D=$(mktemp -d)
    gcc -std=c11 -Wall -Wextra -Werror -Wno-misleading-indentation -DESP_PLATFORM -Itests/esp32-host/fakes -Ifirmware/core review-evidence/esp32s3-host-independent/probe.c firmware/core/apex.c -o "$D/probe"
    timeout 10 "$D/probe"
    rm -rf "$D"
