# Delivery scope

New files under `experimental/hybrid-iq/` plus the isolated `.github/workflows/hybrid-iq.yml` gate; no main APEX implementation is changed. C++/JS host proof and independent reviewer evidence are executable/tested. Rust wrapper remains uncompiled in local evidence; the no-install CI gate must actually pass before claiming Rust acceptance. Source reference is APEX main d4434c5cf789938447e83e49a5cfcbdf68b59277.

Authoritative final reports: `proof-results/verify.json`, `sanitize.json`, `benchmark.json`, upstream core test output and `review/REVIEW.md`. Numerical success is distinct from app integration, Rust compilation and mobile/device acceptance.

The source delivery excludes `.build/`, reviewer executables and Rust target output. `MANIFEST.sha256` records delivered files except itself. The standalone archive additionally includes the sparse pinned oracle and preceding C++ experiment needed to rerun this proof. The original proof patch contains only new hybrid proof files. The later CI follow-up adds its separate workflow and guard tests; neither changes app runtime source.
