# Offline I/Q window-energy activity inspection

The core/CLI scope below now has a separate [app workbench mode](iq-activity-workbench.md). Its explicit memory-only selected-window checks do not add acquisition, journal storage or physical burst inference.

This is a separate, bounded, offline-only core (`packages/core/iq-activity.ts`) and Node CLI. It consumes the existing branded `PreparedIq` import profile, not supplied analysis claims. It does not modify FFT arithmetic/output, acquire samples, access a radio, decode a protocol, control a device, or integrate with native/UI/journal/provider/network paths.

## Explicit invocation

```sh
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_offline=true npm_config_update_notifier=false npm_config_audit=false npm_config_fund=false \
node tools/inspect-iq-activity.ts metadata.sigmf-meta samples.sigmf-data \
  --start-sample 0 --window-samples 256 --hop-samples 128 --frame-count 4 \
  --threshold-numerator 100 --threshold-denominator 3
```

Both local paths and all six options are required. Unknown, duplicate or missing options are refused. The CLI reuses the existing bounded regular-file reader and refuses symlink inputs, nonregular files, empty/oversized files and detected file changes. Existing metadata parsing, datatype/profile restrictions and source-byte integrity checks apply. No files are written and metadata URLs are not followed.

The start must be a nonnegative safe integer. Window length is 1–4096 complex samples, hop is 1–65536 samples, frame count is 1–256, and window length × frame count must not exceed 262144 processed cells (overlap counts again). The entire requested range must exist: `start + (frames - 1) * hop + window <= sampleCount`. No padding, truncation, inferred frame count or partial report is allowed.

## Exact units and threshold

For each half-open window `[start, end)`, the core sums `I² + Q²` from original signed int16 components with BigInt arithmetic. There is no weighting, normalization or DC removal. `sumSquaredCounts` is a decimal string. `meanSquaredCounts` contains decimal-string numerator (sum) and denominator (window length), an exact, intentionally unreduced rational in raw ADC-count-squared units. JSON never contains BigInt values or a rounded numerical mean.

The operator supplies a rational mean threshold: each part must be an unsigned decimal integer string of 1–128 digits, and the denominator must be positive. Leading zeros are accepted and normalized in the report. The decision is **strictly above**: `sum * thresholdDenominator > thresholdNumerator * windowLength`. Equality is false. The comparison uses BigInt cross-multiplication, including thresholds larger than the exact floating-point integer range. No threshold is estimated from the recording.

## Windows and runs

Every selected window is reported, including below-threshold windows. Nominal start/end seconds divide sample indices by the declared sample rate; they are approximate nominal coordinates, not RF timestamps. Sample index boundaries and exact rational energy remain authoritative.

`windowRelationship` is single-window, overlapping, contiguous or gapped. Runs group consecutive **selected window indices** above threshold. A below/equal-threshold window breaks a run. `measuredSampleIntervals` merges overlapping or touching window coverage but always retains separate intervals for gaps. No run-wide elapsed duration or gap-spanning coverage is reported. A gapped run can contain several above-threshold selected windows without claiming anything about unselected samples.

Even merged contiguous coverage does not prove continuous above-threshold activity: each decision is a window average. Neither selected window edges nor run edges are physical burst boundaries. Overlapping windows reuse samples and are correlated.

## Provenance and limitations

The source context, supplier claims, warnings and original complete-file hashes appear once in `source`, unchanged from the prepared recording. Hashes identify original bytes, not merely selected ranges. Import time is not acquisition time. Declared sample rate, center frequency and retained supplier timestamps are not verified physical measurements.

DC offsets, gain, clipping and noise affect the result. There is no gain calibration, DC correction or noise-floor inference. Raw ADC-count-squared is not volts, dBm or calibrated RF power. Threshold crossings do not establish a signal, transmitter identity, modulation, protocol or physical burst. This feature makes no universal RF or unlocking claim.

## Checks

```sh
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_offline=true npm_config_update_notifier=false npm_config_audit=false npm_config_fund=false \
node --test tests/iq-activity.test.ts tests/inspect-iq-activity.test.ts
```

Deterministic tests cover signed extrema, zeros/DC, exact equality and nearby rational thresholds beyond floating-point precision, an independent direct-loop BigInt oracle over synthetic pairs, overlap/contiguity/gaps, split runs, nominal times, unchanged source hashes/context/bytes, output isolation, branded input refusal, explicit option validation, exact range and processing-budget edges, malformed imports, and bounded-file/symlink refusal.
