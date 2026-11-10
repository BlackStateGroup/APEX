# First lab-only signed-read firmware peer

**Historical baseline:** this report records the initial implementation at
`3b12d5c5934d7d607b67dba0adba9f3adab074ec`. Its counts and limitations apply to
that version. See the [follow-up report](../lab-signed-read-followup/REPORT.md)
for completed native/client/lifecycle work and current remaining acceptance.

Date: 10 November 2026 (UTC). Base: `095cc0366aceea4d3ba7f01027fd5c0589035c39`
(merged PR #21). Branch: `feat/lab-signed-read-peer`.
Status: implementation prepared for review; **not approved for merge, provisioning,
flashing or physical operation**. No independent review is claimed.

## Result and boundary

`firmware/esp32s3-signed-lab` is a separate ESP-IDF v6.1 ESP32-S3 target.
`CONFIG_APEX_SIGNED_READ_LAB_OPT_IN` defaults off. With explicit opt-in and a
matching offline key image, its USB Serial/JTAG loop feeds the portable
`firmware/lab_signed_read` peer. That C peer accepts only experimental `0x70`
requests for signed info, capabilities and ping, using the existing exact
transcript and AXP/1 parser/encoder without modifying either host protocol or
existing firmware core.

Monocypher 4.0.2's optional pure Ed25519/SHA-512 API signs responses. The actual
C signing implementation is compiled for both host tests and the ESP32 target.
Node/OpenSSL verifies through the **unchanged** `AccessoryTrustAuthority`; it
does not simulate the firmware signer. Vendor provenance, licence and five
unmodified-file hashes are in `firmware/lab_signed_read/vendor/PIN.json`.

The offline generator creates fresh CSPRNG lab identities in exclusive private
directories. The firmware reads a separate read-only data partition, validates
its format and seed/public-key consistency, and wipes temporary key material.
There is no embedded device private key, network provisioning, automatic key
generation, test-vector identity, write/unlock/RF command or legacy fallback.
Only tests generated ephemeral random keys, then deleted their temporary files.
No persistent hardware identity was provisioned during this work.

## Verified software results

| Check | Result |
| --- | --- |
| Full existing host suite plus new tests, `GOMAXPROCS=4 npm test` | **2,551 passed; 0 failed** |
| Focused existing authority and compiled C interoperability | **30 passed; 0 failed** (18 authority + 12 new) |
| C unit checks | Opt-in refusal, key mismatch, seed/state wiping, signing-budget boundary and 200,000 deterministic noise bytes passed |
| ASan/UBSan C unit and interoperability | Passed; **12/12** interoperability tests; `ASAN_OPTIONS=detect_leaks=0` |
| TypeScript, `GOMAXPROCS=4 npm run typecheck` | Passed |
| Locked npm inventory | Passed, 542 locked dependency entries |
| ESP-IDF v6.1, opt-in disabled | Cross-compiled and linked; application image **134,672 bytes** |
| ESP-IDF v6.1, opt-in enabled | Cross-compiled and linked; application image **162,736 bytes** |
| Generated configs and ELF symbols | Bluetooth/Wi-Fi off in both; signer and USB install absent when off, present when on; no named BLE/Wi-Fi startup symbols |
| Generated flash-file lists | Only bootloader, partition table and application; **no key image** |
| Existing app, host trust verifier, protocol/core, historical firmware and package manifests | Unchanged |

The new tests cover all three reads and every ping length 0..128 (131 native
signed responses in the transcript parity test), streaming/fragmented input and
responses, a persistent C peer, semantic host metadata validators, recomputed-CRC
transcript tampering, wrong pinned/peer keys, old-response replay across requests
and fresh authorities, outer-envelope/request substitutions, all 255 unsupported
outer opcodes and 253 unsupported inner opcodes, malformed lengths/versions,
metadata bodies, CRC/header corruption, truncated frames, resynchronisation,
disabled/missing/corrupt/mismatched key images and provisioning permissions/no
overwrite. No fake successful verifier is used by the new tests.

The initial full run caught two test integration issues: changing `package.json`
invalidated pre-existing frozen source hashes, and sending stdin to an intentionally
failed startup raced its early pipe close. The package file was restored exactly;
the new test compiles its own C executable, and startup-refusal checks use empty
stdin. The final full run above is green without weakening existing guards.

## Toolchain and reproducibility

- Node v24.22.1; host GCC 14.2.0; Python 3.12.14.
- ESP-IDF v6.1 at `fff9895c82d744c7237be8847347bdd1b07c6643`.
- Xtensa GCC 15.2.0, crosstool-NG `esp-15.2.0_20251204`.
- Monocypher 4.0.2 at `0d85f98c9d9b0227e42cf795cb527dff372b40a4`.
- Separate `build/lab-off` and `build/lab-on` directories and SDK configs.
  Enabled build uses an additional defaults file containing only
  `CONFIG_APEX_SIGNED_READ_LAB_OPT_IN=y`. No key is needed for compilation.
- Local ESP-IDF dependency source was restored at its pinned submodule revisions;
  `IDF_SKIP_CHECK_SUBMODULES=1` avoided fetching unrelated SDK radio repositories
  during the final minimal-target builds. No APEX source or SDK API was stubbed.
- LeakSanitizer cannot run under this environment's tracing and was explicitly
  disabled for local ASan/UBSan evidence. **No leak-detection success is claimed.**
- `.github/workflows/lab-signed-read.yml` reproduces normal and sanitizer host
  tests and both ESP32 builds using the repository's pinned ESP-IDF v6.1 image.
  GitHub CI results must be checked separately on the review head.

See `source-sha256.json`, `build-summary.json` and accompanying text logs. Build
binaries, SDK downloads and all secret key images are excluded from the commit.
Commands and custody/format details are in
[`firmware/esp32s3-signed-lab/README.md`](../../firmware/esp32s3-signed-lab/README.md).

## Explicit limitations and review gates

- No accessory was connected, flashed, provisioned or operated. No RF was
  transmitted. **No iPhone or Android test occurred.**
- No native crypto/transport adapter or app pairing UI is added. Existing legacy
  accessory traffic remains unauthenticated.
- Read access has no host authentication. Repeated requests can be re-signed;
  the host's fresh challenge and request transcript reject old replies. This is
  not anti-relay, encryption, attestation or physical proximity evidence.
- Lab keys are plaintext in the offline image and partition; the read-only flag
  is not secure custody against physical/debug access. Production keys are out
  of scope. The independent full public-key confirmation is essential.
- USB partial-write handling, read failure, the 16 KiB task-stack choice,
  disconnect/reconnect behaviour, provisioning/partition layout and signing
  latency still require physical acceptance. The software tests do not establish
  any of these. A partial request can persist across USB disconnect; there is no
  physical connection-ownership adapter yet.
- Fixed memory and a 4,096-signature boot budget bound this peer; they are not a
  DoS guarantee. At the next eligible request after exhaustion the peer closes
  and wipes its key. No automatic restart or recovery exists.
- Review the implementation, protocol reservation and key custody before any
  separately approved lab provisioning/flashing. Merge and hardware flashing
  require the user's explicit approval and have not been performed.
