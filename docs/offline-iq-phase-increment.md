# Controlled offline I/Q phase increments

This additive core/Node utility reads only explicitly supplied metadata and data files through the existing bounded, regular-file-only reader and branded exact-byte `PreparedIq` parser. It does not acquire data, discover files, use devices, write reports, transmit, replay, or invoke providers. Existing parser, FFT, activity and lag-correlation behavior and App are unchanged.

Example (all four options are mandatory; choose geometry yourself):

```
node tools/inspect-iq-phase-increment.ts recording.sigmf-meta recording.sigmf-data --start-sample 0 --lag 1 --step 1 --count 4
```

For selected pair index k, left sample is `startSample + k*step` and right sample is `left + lag`. Start is a nonnegative safe integer; lag, step and count are positive safe integers. Count is at most 512. The exact BigInt final extent is checked before reading samples. Both endpoints of every pair must lie in the capture; no padding or truncation occurs. A large unused step is permitted when count is one. Every option must be an own data field of an ordinary object; unknown, missing, symbol, inherited and accessor fields are refused. This is validation of ordinary API/CLI inputs, not a hostile arbitrary-JavaScript sandbox.

For left `li + j*lq` and right `ri + j*rq`, the product is right times conjugate(left): real = ri*li + rq*lq; imaginary = rq*li - ri*lq. Individual energies are li²+lq² and ri²+rq². Products and energies are exact BigInt calculations serialized as decimal strings. This agrees with a one-sample window in the existing lag-correlation core.

For nonzero-energy endpoints, phase is atan2(imaginary, real), with principal interval (-pi, pi]. The exact negative real axis maps to +pi, including a negative quarter tone measured across two samples. The positive real axis maps to +0. No phase is unwrapped. If either endpoint has zero energy, phase and frequency are unavailable with an explicit reason and absent numeric fields.

The nominal principal frequency offset is phase * declared sample rate / (2*pi*lag). Alias spacing is declared sample rate / lag. Its principal interval is (-aliasSpacing/2, +aliasSpacing/2]. Frequencies differing by integer multiples of this spacing have the same pair phase. For a nonstationary signal, this quantity is simply a scaled endpoint phase difference, not an inferred constant frequency. Supplier center frequency is retained only as original source declaration, never added to an offset or treated as an actual carrier. Digital counts and phase-derived offsets are not physical/calibrated RF measurements.

Each pair includes sample endpoints, inclusive interval endpoints, the bounding sample span's exclusive end, and nominal endpoint times. Report-level nominal interval is lag/sampleRate. Times rely on declared sample rate and are not RF timestamps. Pairs may overlap or reuse endpoints and are not independent observations. No DC correction, noise model, smoothing, automatic period selection, threshold fitting, symbol recovery, modulation/protocol classification or identity inference is performed.

Reports are fresh caller-owned objects; modifying an options object after analysis does not alter the report, and modifying a report does not alter the prepared recording or a subsequent report. Nested prepared-source provenance is frozen. Original whole-file hashes, supplier claims, context and acquisition limitations are preserved. JSON is emitted to stdout only after full success; failures emit stderr and a nonzero exit. Report size is bounded by parser limits and 512 pairs; there is no persistence in the analyzer/CLI.

## Verification

Synthetic tests cover both quarter-tone directions, DC, alias/half-turn conventions, zero endpoints, int16 rails, independent exact integer oracle, irregular selected geometry, one-sample lag-correlation orientation, safe bounds, 512-pair limit, accessor/forged-provenance rejection, original hashes, and mutation isolation. CLI tests run actual child processes for success, usage failure and malformed UTF-8 failure, and exercise missing/duplicate/unknown/unsafe options, regular-file constraints, size limits and empty input.

These deterministic tests establish implementation behavior for the bounded profile, not calibration, sensor correctness, real-world RF accuracy or protocol validity. Floating-point phase/time/frequency outputs are approximations. Exact command outputs and source commit are in `verification/iq-phase-increment/`.
