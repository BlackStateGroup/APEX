# Narrow offline CI gate

The separate `.github/workflows/hybrid-iq.yml` workflow invokes `ci-host-check.sh` for the reviewed `experiment/hybrid-fft-exact-contract` branch in this repository. It uses `pull_request`, not `pull_request_target`, and excludes fork-origin automatic execution. Relevant proof, reference and workflow paths trigger it; the declared authenticated manual-dispatch trigger becomes available after the workflow is registered on the default branch. The PR-triggered gate can run before that.

The checkout action is pinned to the same commit already used by foundation CI. Its token has read-only contents permission and credentials are not persisted. No repository secrets, write token, third-party PR checkout, setup actions, package installation or toolchain download are used. The explicit PR head is tested and recorded in the successful job summary.

`ci-preflight.sh` selects Node 24 directly from the GitHub runner's preinstalled tool cache and rustc/cargo directly from preinstalled Linux x86-64 Rust toolchain directories. It does not invoke a rustup proxy. Missing tools fail the prerequisite instead of installing them. Rust auto-install is disabled, Cargo uses a fresh credential-free home and all crate operations are locked/offline. The crate has no registry dependencies. System G++ and ar must already exist.

The gate runs:

1. CI guard tests. Their Rust version probes are **mocks**; these tests establish selection/failure behavior, not Rust compilation.
2. Exact C++/JS host parity across 23,029,248 bins.
3. The same C++ host corpus under ASan/UBSan, with LeakSanitizer explicitly disabled.
4. Actual Rust/C++ wrapper unit tests in debug and release.
5. The full exact corpus through the actual Rust-owned-buffer host executable, including malformed-input rejection.

There is no fallback that converts a missing toolchain, compiler failure or parity mismatch into a pass. Rust timing and Rust sanitizer modes remain unsupported. A green foundation workflow alone does not establish these results: the separate `APEX experimental hybrid IQ proof` job must actually pass.

The CI addition does not change app integration, numerical version semantics, hardware behavior or the interpretation of the host subprocess benchmark. It does not establish mobile/device speed, Rust sanitizer acceptance, or production readiness. Until this workflow has actually run successfully, the Rust sources remain uncompiled/unverified in the available evidence.
