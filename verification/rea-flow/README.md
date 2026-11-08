# REA control-flow verification, 8 November 2026

- Baseline: private APEX main `7f1110f9455d0c5b87419046b864314e1f1df191`.
  `base-inputs.json` records the eight exact original materialized blobs;
  REA_RESEARCH.md subsequently receives the documented additive change.
- `APEX_REA_INTEGRATION=1 node --test tests/rea-control-flow*.test.mjs`:
  **61 passed, 0 failed, 0 skipped**, including 11 independent adversarial tests
  and an actual pinned REA-supervised six-function inspection. See `tests.txt`.
- `node tools/research-control-flow.mjs verification/rea-flow/2026-11-08`:
  four compiler/control variants, six functions each; all 24 observations passed
  exact byte/range/envelope checks. The selected ELF targets were not executed.
- Retained outputs: `2026-11-08/experiment.json`, source copies, compile logs,
  four non-executable ELF files and per-variant original REA reports/manifests.
- A separate Python check verified all 28 per-variant manifest entries, four
  artifact SHA-256 values, current analyzer source digests and deleted snapshots.
- Independent review found two issues, both fixed before final evidence:
  width-suffixed/REX-prefixed returns and aggregate aliased-symbol-table work.
  Final independent review also verified all retained experiment counts/hashes.
  Consumers must require a valid complete manifest and no failure.json; a partial
  summary can remain after a late publication failure.
- The recorded preflight still reports missing javac/Ghidra. No tool installation
  was attempted. No decompilation, persistence, phone path, RF/hardware access or
  complete semantic/call-graph proof is claimed.
- The new CI workflow has not been remotely run in this checkpoint. No changes
  were made to the shared firmware, mobile app, Flipper adapter or native bridge.

Reproduction depends on the existing pinned REA desktop dependencies, Node 24,
GCC/binutils and a compatible Linux host. Compiler versions may produce different
artifacts; the run records the actual inputs instead of demanding historical
bytes on every host. Outputs intentionally include job-local snapshot paths for
provenance even though those temporary snapshots were removed.

Earlier initial/development experiments remain local and are not the accepted
checkpoint. The retained 2026-11-08 run is the one bound to final analyzer sources.
