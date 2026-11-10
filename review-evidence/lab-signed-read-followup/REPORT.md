# Signed-read laboratory follow-up

Date: 10 November 2026 (UTC). Parent: `3b12d5c5934d7d607b67dba0adba9f3adab074ec`.
Branch: `feat/lab-signed-read-peer`, draft [PR #22](https://github.com/BlackStateGroup/APEX/pull/22).
This closes software gaps identified by the initial report. It is not approval
for merge, phone installation, key provisioning, accessory flashing or operation.
No independent review or physical validation is claimed.

## Completed software and remaining boundaries

| Initial gap | Completed in this follow-up | Remaining acceptance |
| --- | --- | --- |
| Missing native crypto adapters | Local Expo module: Android API 33+ Ed25519/SecureRandom/monotonic clock; Apple CryptoKit/Security/uptime; strict byte bounds and unsupported-platform refusal | Native app compilation in CI; actual Android/iPhone execution remains untested |
| Missing human pairing UI | Explicit build-time lab entry, complete independent key comparison, ownership acknowledgement, individual unchecked read grants, revocation and background reset | Human usability and physical key comparison |
| Missing signed-read connection adapter | USB-only adapter over existing Android native transport; no legacy handshake/fallback; strict matching frames, write acknowledgement, deadlines, cancellation and ownership fences | Actual USB/cable/permission/disconnect behaviour; iPhone USB transport unavailable |
| Partial request retained on disconnect | Firmware clears partial frames after 500 ms idle and closes/wipes after detected SOF bus loss; no auto-reconnect | SOF timing and port-close behaviour on hardware; port close without bus loss is not detected |
| Untested target I/O failure branches | Actual `main.c` executed with controlled SDK calls for 10 startup/partial-write/timeout/bus-loss/read-failure scenarios, plus disabled-source no-SDK linkage | Real driver/partition timing, signing latency, 16 KiB stack headroom |
| Stale status documentation | Current client/firmware/trust docs updated; initial report preserved as historical evidence | Independent implementation/protocol/key-custody review |

The unchanged host authority and portable AXP core still define the transcript.
The compiled C firmware signer supplies responses to host/Java/Apple tests. All
cryptographic fixtures use freshly generated temporary identities. There is no
production or public-vector trusted device key. Root npm dependency manifests and
historical firmware targets remain unchanged.

The opt-in lab client only requests the three reads. It neither exposes ordinary
accessory commands nor uses BLE/Wi-Fi as an iPhone workaround. Backgrounding
revokes the in-memory pairing and fences late results. Cleanup failure retains
USB ownership; a pending native cleanup can stay pending and is not falsely
reported as a timed successful release. Enabling the screen requires
`EXPO_PUBLIC_APEX_SIGNED_LAB=1`; default application behaviour remains unchanged.

## Local software verification

| Check | Observed result |
| --- | --- |
| Full host suite, `GOMAXPROCS=4 npm test` | **2,561/2,561 passed**, zero failures/skips |
| Changed C interop/connection/controller tests plus actual screen harness | **22/22 passed**; existing 18 authority tests also pass in full suite |
| ASan/UBSan C units, actual target source harness and C interoperability | Passed; **21/21** interop/connection/controller tests; leak detection disabled locally |
| Actual Java verifier source with C-generated signatures | **32/32 passed**: valid, tampered transcript/signature, wrong/short key, short signature and transcript bounds |
| TypeScript and locked dependency inventory | Passed; 542 locked entries |
| Genuine ESP-IDF v6.1 opt-in off/on compilation | Both passed; images **134,672 / 163,120 bytes** |
| Config, ELF and flash-list inspection | Radios off; signer/USB installation absent when off; no key image in either flash list |
| Opt-in web export | Passed |
| Local browser render | Blocked before page load: Chromium process-singleton Unix socket refused by managed runtime; no screenshot or browser success claimed |
| Apple CryptoKit source and Android/iOS app compilation for this follow-up | Delegated to PR CI; consult the exact-head workflow results linked from PR #22 |

The screen harness executes the compiled TSX with controlled React hooks and
native component/USB stubs, using the actual controller. It checks consent and
lifecycle behaviour; it is not a rendered UI or phone test. The dedicated CI
browser job exports and renders the real lab screen at 390×844, verifying that
missing native providers disable pairing and reads. It cannot prove mobile USB.

New connection tests use a pipe transport around the real C peer. They exercise
fragmentation, invalid CRC, trailing/duplicate/substituted frames, native write
failure after a valid response, cancellation during acquisition, failed cleanup,
lease expiry, unsolicited disconnect, revocation during real verification, exact
native adapter bytes, explicit pairing/device selection, and late inventory/results
after backgrounding. The original firmware replay/tamper/malformed/opcode coverage
is retained.

## Evidence and reproducibility

Text logs alongside this report record the results above. `build-summary.json`
records binary/config hashes and inspection outcomes; `source-sha256.json` records
changed implementation/test/workflow/documentation files. Binaries, downloaded
SDK/JDK files, private keys and native build output are excluded from Git.

Node 24.22.1, Python 3.12.14, GCC 14.2.0, OpenJDK 21.0.13+9, ESP-IDF v6.1
`fff9895c82d744c7237be8847347bdd1b07c6643`, Xtensa GCC 15.2.0 and unchanged pinned
Monocypher 4.0.2 were used locally. ESP compilation used the genuine SDK APIs;
the controlled SDK harness is a separate host check. Local ASan/UBSan used
`ASAN_OPTIONS=detect_leaks=0` because LeakSanitizer cannot run under environment
tracing. No local leak-detection success is claimed.

The initial PR head's foundation CI retry passed all four jobs after its first
Android attempt hit a Google Maven download timeout. That result belongs to the
parent head, not the new native/client code. Updated PR CI must be assessed on
the new head. The lab workflow includes normal/sanitized interop, actual Java and
Apple verifiers, rendered unavailable-state UI and both ESP configurations;
foundation CI compiles Android and an unsigned iPhone Simulator app.

## Not performed and protocol non-goals

No accessory or phone was connected, paired, installed, provisioned or flashed.
No iPhone/Android device test, USB transmission to hardware or RF operation took
place. The branch remains unmerged.

Independent review and explicitly approved physical acceptance are still needed.
iPhone USB transport is a separate integration gap, not a claim solved by native
verification. Lab private keys remain plaintext disposable identities; production
custody is absent. Host authentication, encryption, attestation and anti-relay are
protocol non-goals, not capabilities silently added to finish a checklist. Do not
add access-control, write, unlock or arbitrary-command functionality to this peer.

See [client usage and lifecycle](../../docs/SIGNED_READ_LAB_CLIENT.md) and
[firmware/key provisioning](../../firmware/esp32s3-signed-lab/README.md).
