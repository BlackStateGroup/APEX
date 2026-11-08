# Native numerical research status · 8 November 2026

The current application still uses its unchanged TypeScript I/Q engine. The
experiments below are retained as research, not enabled replacements or new
radio capabilities. They are separate from the main aggregate's passing tests.

## Rust: source candidate, compiler gate blocked

[Source and architecture](../experimental/rust-iq/README.md) are included under
experimental/rust-iq. The dependency-free bounded kernel and binary host harness
have independent source review. Eight Node codec/oracle tests and 3,328 direct-DFT
reference-bin comparisons pass; these validate the harness/reference, not Rust.
Cargo is absent, so Rust compilation, Rust unit tests, numerical parity and
benchmarking have not run. The executable verification gate returns BLOCKED,
not a successful skipped check. No mobile binding or app import exists.

## C++: compiled host research, replacement rejected

[Source, raw results and independent review](../experimental/cpp-iq/README.md)
are included under experimental/cpp-iq, without executables. The original
bounded C++17 kernel was built with existing G++ 14.2.0 for x86_64-linux-gnu.
Both variants fail the strict replacement gate: baseline 50/61 cases, frozen
coefficients 52/61. Frozen JS-derived coefficients remove two zero/null
mismatches, but nine impulse peak-selection cases still disagree. Tiny linear
error does not waive a changed public peak result. The canonical engine is not
replaced, and no numerical rule has been silently relaxed.

Both variants passed a separate 14-case/3,584-bin DFT amplitude oracle and
rejected 39 malformed inputs. Address/undefined-behavior sanitizer runs had no
diagnostics; LeakSanitizer was blocked under ptrace, with later leak checking
explicitly disabled. Seven Node harness tests pass. These observations do not
make the failing compatibility gate pass or establish complete sanitizer safety.

Raw diagnostic host timings are retained with compiler, source/binary hashes,
workload, warmups and batch arrays. They exclude bridge/startup/import/UI costs
and compare different output structures and runtime costs. They are not phone
speed, battery, real-time or language-only performance claims.

## Next acceptance gate

Define and version the cross-runtime numerical behavior for coefficients,
magnitude, exact-zero/null values and near-tied peak selection before replacing
any app code. Then compile and verify the Rust candidate on an authorized,
provisioned builder and measure the actual bridge/lifecycle path on real target
devices. Mobile/embedded SDK target builds and physical acceptance remain unrun.

The [full product vision and source trail](vision/README.md) preserve ambition,
conversation recovery, limitations and phased architecture. Its v42 checkpoint
is a frozen historical reference. The current combined v43 verification is
linked from [APEX_CONTINUATION](../APEX_CONTINUATION.md).
