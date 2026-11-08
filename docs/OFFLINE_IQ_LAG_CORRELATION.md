# Offline selected-lag I/Q diagnostic

`analyzeIqLagCorrelation` takes an existing branded `PreparedIq` and exactly five explicit options: `startSample`, `windowSamples`, `firstLag`, `lagStep`, `lagCount`. Existing import, FFT/time-frequency and activity code is unchanged.

```sh
node tools/inspect-iq-lag-correlation.ts metadata.sigmf-meta samples.sigmf-data --start-sample 0 --window-samples 256 --first-lag 1 --lag-step 1 --lag-count 64
```

Both files and all five flags are required. The Node adapter reuses the bounded regular-file reader and writes JSON only to stdout (errors to stderr), never files. Input is the existing narrow ci16_le profile, not acquisition or general SigMF support.

Each selected positive lag L compares x[start+n] with x[start+L+n]. Exact BigInt sums use **right × conjugate(left)**. Complex sums, both energies, and unreduced `(real² + imaginary²)/(leftEnergy × rightEnergy)` are decimal strings. A zero denominator is tagged `unavailable`, with exact zero numerator/denominator, never a numeric score. Source context and complete-original-byte hashes occur once. Lag seconds use the declared nominal sample rate.

Limits: 1..4096 samples/window, 1..256 lags, at most 262144 compared sample pairs. Start is a nonnegative safe integer; first lag and step are positive safe integers. All selected lags and full windows must fit the recording without padding or truncation. A step is unused when count is one. No automatic best-period selection.

DC and constant tones can correlate at all lags. Overlapping samples are correlated, and comparisons reuse a left window. Selected lags are not exhaustive. There is no DC removal, tapering, noise-floor estimate, transmitter/modulation/protocol inference, calibrated-power claim, RF acquisition or unlock functionality.

Tests independently calculate exact results and exercise signed extrema, complex orientation, zero energy, DC, tones, synthetic repetition, the Cauchy bound, strict options, complete ranges, work limits, hashes, mutation isolation and CLI bad-file refusals.

See [verification logs and commands](../verification/iq-lag-correlation/README.md).
