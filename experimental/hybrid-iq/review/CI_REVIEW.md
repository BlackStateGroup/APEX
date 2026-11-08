# Independent CI source review

Reviewed 2026-11-08. No remaining blocking finding in the four hashed files below. This review qualifies the isolated CI definition and its fail-closed orchestration, not Rust compilation or numerical acceptance.

## Findings resolved

- Replaced multi-name `command -v` calls with individual prerequisite checks. Bash can return success when an earlier command is missing but the final command exists.
- Replaced a fixed `mkdir -p` Cargo home with a newly created temporary directory, preventing reuse of existing Cargo configuration or credentials.
- Set `RUSTUP_AUTO_INSTALL=0` and `CARGO_NET_OFFLINE=true` inside the host entrypoint before probes, including direct invocation outside the workflow.

## Independent verification

- CI guards: 10 passed, 0 failed. Missing Node, Rust, Cargo, G++ and ar fail without publishing selected environment paths. Fresh Cargo-home isolation passes.
- Bash syntax and `git diff --check` pass. Parsed-YAML assertions confirm only `contents: read`, one pinned checkout action, exact PR-head selection, `persist-credentials: false`, offline environment and a 20-minute job limit.
- Five independently mocked stage failures stop before later stages: C++ parity, C++ sanitizer, Rust debug tests, Rust release tests and Rust parity. The same checks confirm hostile inherited offline/auto-install flags are overridden before probes and `CARGO_TARGET_DIR` is cleared.
- Real local invocation fails immediately with `Missing preinstalled cargo`. No toolchain was installed.
- The reviewed automatic PR gate requires the named same-repository branch. It uses no `pull_request_target`, secret references, package installers or toolchain setup actions. Manual dispatch is an explicit separate trigger, subject to GitHub's workflow registration requirements.
- Rust source spot review found no obvious FFI ownership/bounds or offline-build defect: the C-layout window struct matches the C ABI, dimensions bound products, output is a fresh disjoint allocation, input is bounded, and the dependency-free build script invokes existing G++/ar only.

## Qualification

Rust is **source-reviewed but uncompiled locally**. Version-probe and orchestration mocks are not compiler, linker, unit-test, sanitizer or numerical evidence. Actual CI must pass its Rust debug/release tests and exact parity stage before claiming Rust acceptance. This change establishes no application integration, RF behavior or mobile/device performance. Re-review is required if the listed source bytes change.

## Reviewed SHA-256

```text
925746661f59f22ec0e6dde3ba68821afbd95fa97dd7c136220fa274b29f8f98  .github/workflows/hybrid-iq.yml
aa381b3299b0a8db4e6485d2bd26fe3610f5a000a5ce8929a7bbd2befe97db4f  experimental/hybrid-iq/ci-preflight.sh
1513b4df52c5c73ff5264e84feef1a81ad8f320f8e93c88b3e26f128bd164a88  experimental/hybrid-iq/ci-host-check.sh
6e453941627556b1f285a839ae5a07f591478531fb70b28964bb634b061dfcee  experimental/hybrid-iq/ci-guards.test.mjs
```
