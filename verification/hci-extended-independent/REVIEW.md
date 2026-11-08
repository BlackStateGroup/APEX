# Independent extended HCI review

Reviewed production commit: `0acf97f67d27575987de7a46058b4e368007bb59`.
Baseline: `2c11de2`. Review worktree: `apex-hci-extended-review`.

No production defect found within this review. No production files changed.

## Results

- Independent tests: 6/6 pass; combined focused HCI suites: 31/31 pass.
- Typecheck passes. Initial review-only failure was TypeScript inferring the synthetic builder's default array as Buffer<ArrayBuffer>[] while accepting Buffer<ArrayBufferLike>. An explicit Buffer[] annotation fixes the test helper, not production. Original failed log retained unchanged.
- Exhaustive 65,536 event words paired with every 16-bit periodic interval; 512 byte/direction combinations; all 230 accepted payload sizes and 26 rejected length octets; all report counts 1–10 at the exact 255-byte parameter ceiling.
- Every truncation of a two-report event rejected. Wrong framing, flags, count and capture truncation rejected. Reserved semantics remain structurally accepted.
- Actual CLI: explicit selection, opaque default, conflicting/duplicate/malformed options, late failure with empty stdout, generic errors, final symlink refusal, ancestor symlink acceptance and filesystem-read denial.
- Snapshot input/hasher-copy mutation, branding, recursive freezing, repeatability, output property allowlist and privacy covered.
- Six baseline byte-for-byte serialized comparisons pass: five metadata classifications and one legacy event. Source diff confirms original preparation, metadata listing, legacy selection and serializer body unchanged; serializer type union extended only.

## Source verification

Read independently on 2026-11-08 through read-only web retrieval, not browser execution:

- [Core 5.4, Vol 4 Part E](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host-controller-interface/host-controller-interface-functional-specification.html), §§5.2, 5.4.4, 7.7.65.13. Confirmed interleaving, endian/sign conventions, lengths, event flags, conditional PHY interpretation, address applicability, scalar ranges and fragmentation semantics. Direct types 2/3 do not establish target identity. The interval multiplier gives 81918.75 ms; the section's displayed maximum-seconds text is inconsistent with its own arithmetic. No exhaustive nonlegacy legality inference is made.
- [UART transport §2](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host-controller-interface/uart-transport-layer.html): H4 indicator and framing checked.
- [Pinned AOSP packet definitions](https://android.googlesource.com/platform/system/bt/+/ea7ab70a711e642653dd5922b83aa04a53af9e0e/gd/hci/hci_packets.pdl), blob `7dd0b221e29aa07df7891f3b569826586a4273ea`, lines 5425–5456: layout corroboration only, not enum authority. No upstream code or prose copied into implementation/tests.

## Reproduction and raw evidence

All commands used existing dependencies; no installs. Environment: CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false.

Commands:

    node --test tests/hci-offline.test.ts tests/hci-independent-review.test.ts tests/hci-extended-metadata.test.ts tests/hci-extended-independent.test.ts
    node node_modules/typescript/bin/tsc --noEmit

For parity, materialize the repository's own baseline temporarily with:

    git show 2c11de2:packages/core/hci-offline.ts > packages/core/.hci-independent-baseline.ts
    node verification/hci-extended-independent/compare-baseline.mjs
    rm packages/core/.hci-independent-baseline.ts

Logs in this directory: initial-tests.log, initial-focused.log, initial-typecheck-failure.log, final-focused.log, final-typecheck.log, baseline-parity.log. source-diff.patch records the production comparison. Empty final-typecheck.log means clean exit 0; shell result verified.

## Limits

Synthetic local software checks only. No aggregate, browser reruns, native/device, acquisition, logging, ADB, settings, credentials, publication or real captures. No RF, completeness, loss, measured-time, identity, ownership or authentication evidence. SHA equality establishes supplied-byte equality only. Node filesystem permission checks do not establish network isolation. Existing source/output bounds and trusted injected hasher remain unchanged.
