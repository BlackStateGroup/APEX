# Independent review: optional IQ bridge foundation

Reviewed 2026-11-08 on Linux x86-64, Node v24.22.1 and Debian G++ 14.2.0. **No remaining blocker found in the reviewed portable boundary under its documented ownership and native-owner contracts. This is not mobile integration or release acceptance.**

## Findings fixed and independently rechecked

1. **Overrideable typed-array properties bypassed input ownership/bounds checks.** A real SharedArrayBuffer-backed Uint8Array with an own `.buffer` property pointing at an ordinary ArrayBuffer passed the original check. An actual 262,148-byte array with a spoofed 1,024-byte `.length` was copied despite the 262,144-byte limit. The final codec reads the intrinsic typed-array tag, length, buffer and offset, checks the real backing buffer before copying, and validates geometry against owned bytes. Request and response regressions now reject both bypasses.
2. **Reusing a native session across executors repeated request identity.** Two executors each began with request 1; the second could accept the first executor's same-shaped response for different input. The final client permanently claims each numeric native session within this loaded JS module, rejects duplicate claims even after disposal, and caps lifetime claims at 1,024. Independent duplicate-object-alias and registry-exhaustion tests pass. Native must still ensure session uniqueness across JS reloads or separate module instances; the JS registry cannot enforce that.
3. **Late fallback failure after cancellation must remain cancellation.** The implementation owner's additional fix normalizes asynchronous fallback rejection to `Cancelled` after cancel/dispose. Both cases were independently tested, including busy-gate release only after settlement.

## Independent verification

- Compiled and ran `abi.test.cpp` with ASan and UBSan. All 10 cancellation checkpoints, no partial output, exact output span and rounding rejection passed.
- A separate seeded C++ harness ran **12,000 randomized ABI cases: 4,935 successes and 7,065 rejections**. Cases mix truncated/extended packets, header/payload mutations and valid dimensions across all five FFT sizes. Every call checks output prefix/suffix canaries; every failure checks zero bytes written and untouched output. Maximum request/output and a deliberately throwing callback's defensive exception containment also passed. The throwing callback is a robustness probe, not permission to violate the documented nonthrowing callback contract.
- **17 independently authored JS check groups passed** after the fixes: spoofed shared/resizable/oversized arrays, incorrect typed-array branding, proxies, valid offset views with throwing shadow getters, cross-realm Uint8Array, malformed/shared responses, native success, duplicate sessions before/after disposal, held busy gate through cancellation/drain, bounded session registry, late fallback rejection after cancel/dispose, and detached input. Native calls used an independently compiled ASan/UBSan host.
- Strict TypeScript check passed for `codec.ts` and `client.ts` with `--noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --lib ES2022`. No Node or DOM type library was required.
- The original `src/kernel.cpp` and `src/kernel.h` have no tracked diff. Source review found the per-frame boundary still calls the existing arithmetic unchanged. The full raw-double/exact-projection corpus is the separate `proof.test.mjs` gate; these independent checks complement, rather than replace, that gate.

Compiler flags for independent C++ checks: `-std=c++17 -O1 -g -Wall -Wextra -Wpedantic -Wconversion -Werror -fno-fast-math -ffp-contract=off -fsanitize=address,undefined -fno-omit-frame-pointer -fno-pie -no-pie`. Runtime: `ASAN_OPTIONS=detect_leaks=0:abort_on_error=1`, `UBSAN_OPTIONS=halt_on_error=1:print_stacktrace=1`. No sanitizer diagnostics occurred. LeakSanitizer was disabled; no leak-freedom claim.

The independent sources and clean output are preserved in `review/abi-fuzz.cpp`, `review/probe.mjs`, `review/check.sh` and `review/results.txt`. Reproduce from the repository root with `bash experimental/hybrid-iq/bridge/review/check.sh`. The runner uses existing Node 24 and g++, builds only the authored local sources into a temporary directory, removes those temporary binaries on exit, and installs nothing. These independent review checks are not part of the default CI gate.

The final primary logs were also inspected: `results/host-exact.txt` and `results/host-sanitize.txt` each show 16/16 tests passed, covering 1,485 requests, 8,924 windows, 23,029,248 bins and 46,058,496 exact raw components per run. `results/core-regression.txt` shows 15/15 original core regressions passed. Those are the implementation owner's primary runs, distinct from the independently executed checks above.

## CI source review

The new `iq-bridge.yml` automatic job is limited to same-repository pull requests with the exact head branch `experiment/optional-iq-bridge` and relevant paths. Its explicit manual `workflow_dispatch` route is not branch-restricted. The workflow grants only `contents: read`, uses the same pinned checkout commit as the prior hybrid workflow, disables persisted credentials, references no secrets, and installs nothing. It selects an already installed Node 24 from the runner tool cache and requires an existing g++.

`ci-host-check.sh` passes `bash -n`, requires the installed tools, changes to the repository root, and runs the authored test file once optimized and once with ASan/UBSan. Source assertions for branch/origin guards, read-only permissions, the checkout pin, absence of installation/secrets, and both test invocations passed. The success summary is reached only after the test step succeeds. This is workflow-source review, not evidence of a GitHub Actions run for a future commit; no publish, branch change or PR operation was performed by this review.

## Important limits

- This C ABI is stateless. A real native owner must enforce session reservation, single flight, owned/pinned immutable inputs, valid disjoint writable outputs, thread-safe callback state, and settlement only after native work drains. Pointer provenance, concurrent mutation and callback lifetime cannot be proved by byte-length validation.
- Cancellation is cooperative between frames and before output publication. It can race the final copy; the JS cancellation fence remains necessary. A hung native promise keeps the client busy indefinitely by design. No timeout-based teardown or recovery protocol was tested.
- Session/request identity prevents accidental stale pairing; it does not authenticate a malicious native implementation or prove that correctly labeled numerical values came from the expected input. Native coefficient range checks likewise do not establish canonical Hann/twiddle provenance.
- No Android/iOS build, JNI/Swift binding, Hermes/ARM execution, Rust mobile linkage, app/controller integration, real-device performance, memory-pressure behavior, leak freedom or universal numerical/memory-safety proof is established here. Exact arithmetic on other compilers/architectures still requires the real platform corpus and effective floating-point build flags.

## Reviewed source and independent log SHA-256

| File | SHA-256 |
|---|---|
| `codec.ts` | `c9f41bf09c95bd57563dd1fcbd991843fc617f8197f6e45cfe9da06411f44bfb` |
| `client.ts` | `c4e7c530f9c9badf3167f6cf96acdefde6010c0489abdfa1f682df70f9167d26` |
| `bridge.cpp` | `c2a6942e334626dcbe61b083880740f314137695e002b7bbdefbe90e199de8c1` |
| `bridge.h` | `79ebdbc803d0a7ed612740548415d89fd8db928c4ecab43a8fb47c3691300ae7` |
| `host.cpp` | `0309bd18e2363849ff48916c4490ae164be2bff81dc2d1f9371caa7694f5af6b` |
| `abi.test.cpp` | `9db43a6def626eb5b3731e2bc55c3317bf0875fd5db763694912c7dc011a28a1` |
| `proof.test.mjs` | `f6f325a2096e3b3129a9eadc9fb592299294dbbbcc7e0dca4fa001e7890541cd` |
| `../src/kernel.cpp` | `404956d68d26490a5db70f5a60ffb905abd66e74f20b31b04d7198b5988576cc` |
| `../src/kernel.h` | `0ce5a1a11185a4ea4efd1771813f881f7ffa80192ba437c111c2a1225b0b21a8` |
| `ci-host-check.sh` | `e0b02421b2aff20e591e1ba5e97fad4a090bbfd39bb9c05a68d8c5af3805a06e` |
| `../../../.github/workflows/iq-bridge.yml` | `80137cfbf217621a3724559bbb4994a31c8c00c723f01b0803d51f71936462f9` |
| `review/abi-fuzz.cpp` | `eb66226f4ae940004c7790c7e585f629045693760e893abdb77024d18113e5ca` |
| `review/probe.mjs` | `01b547129ffdd03f245869e360361dd0fb70ea70e68f1205d8eff30e8eb29ea3` |
| `review/check.sh` | `c9ce311b3a04b75c936a91a6b2e050c677bcc01893c040e2631a2f2a7e05a339` |
| `review/results.txt` | `9bbd01beb229ae4620dcd2c4d049b24c80dc076d6eda9e9b1d5684c9f28a35d2` |
