# I/Q time-frequency verification

Implementation 56a1f1; parent integration e6da1a6. The pure overview and explicit-two-file CLI are offline only. No acquisition, recognition, calibration, native UI or evidence-store integration was added.

Focused tests: 23/23 passed with semantic TypeScript and diff checks. The checked-in tests include an independent negative-exponent DFT over three overlapping, nonzero-start, off-bin synthetic windows, signed changing tones and phase, DC/Nyquist/zero, exact option/range/cell bounds, unchanged input bytes and CLI malformed UTF-8/symlink/directory/size refusals. They do not simulate adversarial filesystem replacement or measure real signals.

`node verification/iq-time-frequency/compare-prior-kernel.ts` reproducibly compares 50 full pre/post-refactor single-window reports and 100 new time-frequency frames at every supported FFT size. Exact deep equality passed. `prior-analysis.ts` is the exact previous packages/core/iq-analysis.ts from 7027b8c, with only its two relative import paths relocated for this verification directory. It is a historical parity reference, not an independent FFT implementation; the DFT tests provide the separate numerical oracle. Seed and results are in prior-kernel-parity.json.

All verification used local files and existing dependencies. Native reception, RF timestamps, sender identity, modulation recognition, calibrated power, tuning and phone raw-I/Q support remain unverified.
