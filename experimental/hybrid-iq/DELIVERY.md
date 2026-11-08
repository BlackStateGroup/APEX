# Delivery scope

New files only under `experimental/hybrid-iq/`; no main APEX implementation is changed. C++/JS host proof and independent reviewer evidence are executable/tested. Rust wrapper and no-install CI entrypoint are source-only. Source reference is APEX main d4434c5cf789938447e83e49a5cfcbdf68b59277.

Authoritative final reports: `proof-results/verify.json`, `sanitize.json`, `benchmark.json`, upstream core test output and `review/REVIEW.md`. Numerical success is distinct from app integration, Rust compilation and mobile/device acceptance.

The source delivery excludes `.build/`, reviewer executables and Rust target output. `MANIFEST.sha256` records delivered files except itself. The standalone archive additionally includes the sparse pinned oracle and preceding C++ experiment needed to rerun this proof. The patch contains only new hybrid proof files for application to the existing repository.
