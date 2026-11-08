# Offline I/Q inspection, APEX profile v1

This is **offline import; acquisition not verified**. This document describes the
runtime-portable TypeScript parser and numerical analysis, plus the Node-only
read-only CLI. The separate [app inspector](OFFLINE_IQ_APP_INSPECTOR.md) supports
explicit web local-byte inspection with default or selected FFT windows and bounded time-frequency frames; native
arbitrary-file import remains unavailable. Neither path adds acquisition,
provider/device control, journal persistence, demodulation, identity or modulation
identification. Every built-in fixture is synthetic digital data, not a recording
of physical reception.

## Run

Use the repository's supported Node 24 environment and existing dependencies:

```
node tools/inspect-iq.ts /explicit/recording.sigmf-meta /explicit/recording.sigmf-data
node tools/inspect-iq.ts /explicit/recording.sigmf-meta /explicit/recording.sigmf-data --fft-size 256 --start-sample 0
node tools/demo-iq.ts
node --test tests/iq-offline.test.ts tests/iq-analysis.test.ts tests/inspect-iq.test.ts
```

The CLI prints JSON to stdout and errors to stderr (nonzero exit). It reads exactly
two explicitly named local files, never discovers neighboring files, follows a
metadata URL, unpacks archives or writes the files. Final-path symlinks and
non-regular files are rejected. Pre-open lstat, nonblocking/no-follow open,
post-open fstat, bounded limit+1 reads, and post-read file/path checks reject
ordinary replacement/size/modification races. These checks are not filesystem
snapshot isolation or protection against a privileged adversary. Retain the
original pair separately; this slice does not provide a durable evidence store.
CLI input is always classified external-file, even when metadata claims otherwise.

## Deliberately narrow format

APEX profile v1 accepts SigMF version string 1.2.6, ci16_le, one channel, one capture
starting at zero, empty annotations, finite sample rate 1..1e9 samples/s and finite
declared center frequency -1e12..1e12 Hz. Metadata is 1..65,536 bytes of fatal-decoded
UTF-8 without BOM. Duplicate decoded JSON keys, depth over 8, objects over 128 keys,
keys over 128 UTF-16 code units, arrays over 256 entries, strings over 4096 code
units and any nonfinite number reject. Data is 4..262,144 bytes divisible by four.
Complex sample count is 1..65,536. No truncation, padding or conversion occurs.

Absent/default-only num_channels=1, offset=0 and metadata_only=false are supported.
Dataset, trailing bytes, capture header bytes, global indices and unknown core
fields reject. Optional global author/description/hw/recorder/license and capture
datetime remain untrusted plaintext. Timestamps are retained, not validated.
URLs and license strings remain inert and establish no redistribution rights.
Extensions (up to 16) require unique names, version strings and optional=true;
required extensions reject. Unknown namespaced fields are retained only for a
declared optional namespace, with a warning that they are not interpreted.
These limits are APEX choices, not declarations that other SigMF recordings are
invalid. This is not a claim of full SigMF application or schema compliance.

## Byte integrity and provenance

prepareIq accepts explicit byte views, separate context (schemaVersion=1,
origin=synthetic-fixture or external-file, canonical ISO UTC importedAt, optional
bounded supplierLabel), and a trusted byte hashing adapter. Core code imports no
Node APIs. Both views are copied synchronously before the first asynchronous hash,
respecting offsets; shared-memory views reject. Retained metadata is not
re-encoded. Exact metadata and data receive separate SHA-256 hashes and lengths.
Optional metadata SHA-512 is checked against the entire exact data view;
malformed/mismatching values reject. Missing SHA-512 is not-provided; a match is
byte-match-only, never verified reception or authenticity. Hash callbacks receive
copies. The caller must supply a correct cryptographic adapter; the Node adapter
uses built-in crypto. A malicious adapter is outside this trust boundary.

Prepared values are branded/frozen, metadata is recursively frozen, and byte
accessors return copies. Analyze only a freshly prepared value rather than trusting
supplied decoded arrays, statistics or verified flags. Context is separate from
supplierClaim metadata; descriptions cannot elevate origin to native/live.
Hashes do not authenticate receiver, time, tuning, chain of custody or lawfulness.
A standalone report includes profile/parser and analysis options/version plus
context, byte lengths and hashes. Reproduction requires original files and context.

## Mathematical conventions and limits

Read signed little-endian I then Q, normalize each by 32768, and use z=I+jQ.
Statistics cover every sample: raw component minima/maxima, normalized means,
DC magnitude, peak/RMS magnitude, second-pass AC RMS, and endpoint counts.
The metric is **rail hits (possible clipping)**, not proof of analog clipping.
Magnitude above one is valid for complex samples. No rail hits does not prove
clean acquisition. Word width does not establish ADC resolution or calibration.
Duration M/Fs differs from last-sample time (M-1)/Fs.

One explicitly selected FFT window uses sizes 256/512/1024/2048/4096 (default 1024),
a safe nonnegative start, periodic Hann, an unnormalized negative-exponent forward
complex FFT, and magnitude divided by sum(window). There is no DC subtraction,
resampling, zero padding, averaging or positive-bin doubling. A default window
that cannot fit returns statistics and spectrum=null; explicitly invalid windows
reject. Shifted bins increase from -N/2 to N/2-1, offset=m*Fs/N. The RF axis uses
declared center frequency; orientation/inversion and tuning are not verified.
Bin spacing and window duration are not frequency accuracy guarantees.

Linear magnitude and 20log10(magnitude) relative to normalized unit amplitude are
reported; exact zero has null raw dB. The -160 dB display floor is labeled and
never substitutes for raw amplitude. All-zero data has no meaningful peak.
This is coherent-gain-normalized magnitude, not PSD, calibrated power, volts,
dBm, physical noise floor or antenna signal strength. Hann adjacent bins and
quantized off-bin leakage are numerical effects, not evidence of multiple
transmitters. Peak bins do not identify modulation or senders.

## Sources and tests

- SigMF 1.2.6 rendered specification: https://sigmf.org/ (consulted 2026-11-07).
  Specification content is not vendored. Its licensing is distinct from recording
  licenses; this implementation does not infer rights from either.
- NumPy DFT convention and ordering: https://numpy.org/doc/stable/reference/routines.fft.html
- SciPy periodic Hann definition: https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.windows.hann.html
- Node byte hashing: https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptocreatehashalgorithm-options

Synthetic analytical zero/DC/positive/negative-tone SHA-256 baselines, rail and
endianness cases, independent direct DFT checks, window boundaries, provenance,
byte preservation, malformed metadata and read-only CLI cases are covered by
unit tests. No physical receiver, phone raw-I/Q path or hardware was tested.

## Bounded time-frequency overview

The runtime-portable pure function `analyzeIqTimeFrequency(prepared, options)` in
`packages/core/iq-analysis.ts` requires an authentic branded PreparedIq plus all
four explicit options: `fftSize`, `startSample`, `hopSamples`, `frameCount`.
No defaults or inferred window counts are used. Options must be a plain object
with exactly these own data properties; accessors, extra keys and symbols reject.

- FFT sizes remain 256/512/1024/2048/4096.
- Start is a nonnegative safe integer. Hop is an integer 1..65,536 samples;
  overlap (hop < size), contiguous windows, and gaps are allowed.
- Frame count is an integer 1..64; frame count times FFT size must be <=16,384.
- Every complete half-open window must fit the original sample range, including
  the last window at start + (frameCount - 1) * hop. No truncation or zero padding.
  Invalid ranges, options and budgets throw rather than returning partial data.

Example using the existing prepared value:

```
analyzeIqTimeFrequency(prepared, {
  fftSize: 256, startSample: 0, hopSamples: 128, frameCount: 8
});
```

A separate read-only Node CLI requires exactly two supplied file paths and all
four flags (flag order may vary):

```
node tools/inspect-iq-time-frequency.ts recording.sigmf-meta recording.sigmf-data --fft-size 256 --start-sample 0 --hop-samples 128 --frame-count 8
node --test tests/iq-time-frequency.test.ts tests/inspect-iq-time-frequency.test.ts
```

It reuses the original bounded regular-file reader and parser, including fatal
UTF-8 decoding and the existing file-size/symlink/nonregular checks. CLI tests
exercise malformed UTF-8, directory/symlink, empty and oversized input refusal;
they do not simulate adversarial file replacement races. Metadata paths/URLs
are never followed. CLI origin is external-file, with current import context
included. Reproducing identical full reports requires the same original bytes,
context and options; a new CLI invocation has a different import time.

The report contains source profile/parser, context, supplier claims, warnings,
exact full-file hashes/lengths and SHA-512 status once, not once per frame. These
are copied from PreparedIq, not re-encoded or restricted to the selected samples.
Retain original bytes separately. No new capture evidence or RF authenticity is
created. The core does not change or discard the source bytes.

One common axis lists shifted signed bins, raw FFT indices, offset Hz and
declared RF Hz separately. Each frame contains aligned amplitude, relative-unit
raw dB and display-dB arrays plus a nullable peak signed bin. Counts refer to
time-frequency cells, not the number of scalar fields used to represent each
cell. Exact zero has null raw dB and -160 display dB. A zero windowed transform
has a null peak; this includes all-zero input and input whose only nonzero sample
is at the Hann zero-weight first position. Tiny nonzero amplitudes retain raw
dB below the display floor. Equal positive peaks use the first shifted bin.

Frame start, center and end-exclusive seconds are derived solely from declared
sample rate. Center is the midpoint of the half-open window, start + N/2, not the
midpoint of first and last sample positions. These are nominal sample positions,
not verified RF timestamps or metadata datetime values.

A private shared kernel was extracted from the existing single-window analysis
without changing FFT arithmetic, phase sign, periodic Hann or normalization.
The overview performs no DC removal, fitting, smoothing, averaging, image
generation or recognition. Overlapping frames are correlated. Window leakage,
adjacent bins and changing peaks do not establish multiple transmitters,
modulation, physical signals, calibrated power, accurate tuning or a phone
raw-I/Q capture path. Tests use synthetic changing signed tones, rotated phase,
DC/Nyquist/zero and impulse cases, an independent direct windowed DFT, exact
budget/range/hop boundaries, immutable inputs and invalid options.

## Explicit sample-pair phase differences

The separate [phase-increment analyzer](offline-iq-phase-increment.md) reports up
to 512 explicitly selected endpoint pairs: exact integer products/energies,
principal phase and nominal frequency offsets with their alias spacing. Zero
endpoints remain unavailable. No phase unwrapping, carrier/modulation inference,
calibration or new acquisition path is added. Existing FFT behavior is unchanged.
