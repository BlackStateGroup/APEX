# Offline I/Q app inspector

The thirteenth Analysis choice, **Offline I/Q**, is a memory-only view of the existing strict SigMF preparation and single-window `analyzeIq` or explicitly selected `analyzeIqTimeFrequency` paths. Existing inspector IDs and routes remain intact. Core math, CLI, evidence formats, native modules and dependencies are unchanged.

## Inputs and explicit work

On web, two ordinary local file inputs stage exact metadata/data handles. Choosing or replacing files performs no read, hash or analysis. Inspect first checks **both captured sizes**: metadata 1–65,536 bytes and data 4–262,144 bytes divisible by four. Only then does it read raw array buffers. Returned lengths must equal captured sizes. No text normalization, truncation, padding, neighboring-file lookup, upload or network fallback occurs. Captured browser filenames are inert labels bounded to 160 UTF-16 code units, not authenticated paths or evidence that the pair belongs together. Picker cancellation leaves the staged source unchanged.

The unchanged core requires SigMF 1.2.6, ci16_le, one capture at sample zero and empty annotations. It refuses BOM, malformed UTF-8, duplicate decoded keys and unsupported profile fields. Optional SHA-512 mismatch refuses the whole report. Local SHA-256 and SHA-512 adapters hash exact bytes through WebCrypto or the already declared Expo Crypto `digest`; no string/hex-text hashing is used.

Native arbitrary-file import is unavailable in this build. A manually authored 1,024-sample all-zero synthetic pair can be staged on either platform without file reads or hashing. Explicit Inspect uses the same controller, preparation and platform digest path. Its independent expected results are zero amplitude, DC and rail hits, no peak, 1-second nominal duration at declared 1,024 Hz, and zero-amplitude FFT bins. Native source/mock checks are **not** native runtime acceptance. Fatal UTF-8 decoding and other JS/runtime support still require validation on the target device.

## Results and limits

In default and explicit single-window modes, full-file statistics include sample count and nominal duration, raw component ranges, digital means/DC, peak/RMS/AC RMS and endpoint rail hits. The default spectrum uses 1,024 samples at sample zero with periodic Hann and coherent-gain amplitude normalization. Short inputs show statistics plus an explicit insufficient-samples state; there is no padding. Eight bins per page show signed offset Hz, linear amplitude and dB relative to unit amplitude. Zero amplitude is explicitly negative infinity, not a measured noise floor.

Source details show full selectable hashes, exact lengths, external-file versus synthetic origin, import time separate from unvalidated producer-declared timestamp, declared sample rate/center frequency, and optional SHA-512 status. Hashes do not establish acquisition, sender identity or chain of custody. Digital amplitudes are not volts or dBm. Declared axes are not calibrated carrier measurements. Peaks do not recognize transmitters, protocols or modulation. No export, persistence, clipboard, permission, radio or device action is added.

## Lifecycle and resource bound

A stable mounted controller retains exactly one actual outstanding read/hash job slot until that job settles, even after Clear, replacement, tab/inspector exit, background and reentry. Selection can be replaced while old work drains; a second Inspect cannot start until settlement. Generation and active leases fence old publication after awaits, before successive hashes and before synchronous analysis. Old callback closures cannot change a newer state. Source/prepared byte arrays stay private; derived state is copied/frozen and exposes at most eight bin rows per page.

Exit/background releases staged selections and reports. Clear releases staged handles; replacement releases replaced handles. In-flight closures may retain their old sources until settlement. Reading/hashing is fenced, **not promised cancelled or securely erased**. Bounded parsing and FFT are synchronous and cannot be interrupted mid-call. One selected pair has at most 327,680 source bytes; that is **not a total heap limit**. Core snapshots, read buffers, digest copies, decoded metadata, parsed objects and FFT output may coexist.

## Verification boundary

Host tests exercise actual controller and byte adapters, with source/mock-native hashing and narrow React Native primitive/hook mocks for TSX projection and events. These checks do not establish browser picker behavior, native runtime support, touch accessibility, narrow-screen layout or device operation. A browser scenario is authored and list-checked only. No real user file, storage, network/provider, browser/native build, radio or permission action is part of this verification.

Controller observers are notified synchronously from a snapshot of subscribers. Observer exceptions are isolated, and nested notifications are suppressed while observer-triggered state changes still apply. Inspect claims its single-job slot and generation before notification, checks its lease after notification, and owns the slot through `finally`. A subscriber's Clear/exit can therefore fence the first read; recursive Inspect cannot acquire concurrent work. These are defensive public-controller guarantees, not evidence of an observed React runtime failure.

Staging, example loading, Clear and exit commit private source handles, labels, origin and report invalidation atomically before notification. A one-shot synchronous observer Clear, exit or replacement therefore cannot be overwritten by the older selection operation after notification returns.


## Staged single-window controls

Default mode still passes a fresh empty options object, giving 1024 samples at zero or full-file statistics only for shorter recordings. Explicit mode stages one of 256, 512, 1024, 2048 or 4096 samples and a start index. Periodic Hann stays fixed. The whole start edit must be 1–5 ASCII decimal digits with value 0–65535; leading zeros are accepted. Whitespace, signs, fractions, exponents, Unicode digits, trailing text and oversized edits are rejected, never widget-truncated into valid input. Rejected text is not retained and cannot silently reuse a previous good value. Invalid FFT size/start settings block Inspect in every mode until corrected or reset. Invalid hop/frame-count settings block time-frequency mode only; they are unused in the preserved single-window modes.

Every settings edit invalidates the old report, private bins, page and generation without reading or hashing. Clear, either example load and exit/background reset default mode, size 1024, start zero, hop 1024 and frame count 1. File replacement retains staged settings. Inspect snapshots fresh options from validated primitives before any notification/await, validates both captured file sizes, then checks explicit start + size against data bytes / 4 before either read. An incomplete explicit window refuses the whole inspection without padding or a default fallback. Each accepted Inspect rereads and rehashes both sources; no prepared recording is cached. Settings changes during reads or hashes fence old publication without releasing the actual outstanding slot prematurely.

The report displays actual FFT size, start and exclusive end plus normalization. Eight immutable rows are exposed per page, with at most 4096 retained bins. This is not a total heap bound.

The separate quarter-cycle example has 8192 exact integer complex samples at declared 8192 Hz. Its first half repeats (16384, 0), (0, 16384), (-16384, 0), (0, -16384); the second half reverses Q. It is authored without trigonometric generation or a runtime text encoder. A permitted window wholly contained in the first or second half has signed peak bin +N/4 or -N/4, respectively, and coherent-gain-normalized amplitude 0.5. Windows crossing the split may combine orientations. Full-file RMS is 0.5 and there are no rail hits. These are mathematical digital examples, not physical RF or protocol evidence. The existing zero example's exact bytes and hashes are unchanged.


## Explicit time-frequency mode

The same inspector now offers a third, explicitly selected time-frequency mode. Mode changes never read, hash or compute. The mode shares staged FFT size/start controls and adds hop (1–5 ASCII decimal digits, 1–65536) and frame count (1–2 ASCII decimal digits, 1–64). Leading zeros are permitted within the length bound. Invalid whole edits are cleared and represented as invalid, not truncated, clamped or silently replaced. Clear, either example and exit/background reset all five settings as documented above; replacing files preserves them.

Before either read, Inspect validates both captured sizes, all selected primitives, `fftSize * frameCount <= 16384`, and `start + (frameCount - 1) * hop + fftSize <= capturedDataBytes / 4`. The final half-open window may end exactly at the source boundary. Overlap, contiguous windows and gaps are supported; no missing window is padded or skipped. A single frame still requires an explicit bounded hop. Options and origin are captured before notifications/awaits. There is one exact-byte preparation/hash pipeline per Inspect, no PreparedIq cache and no automatic reanalysis.

Time-frequency mode calls **only** the requested multi-window kernel. Full-file statistics are explicitly omitted, and no incidental/default FFT is computed or mislabeled. Parsing, requested FFTs and derived output copying are bounded synchronous work, not interruptible mid-call. The original single-window/default outputs and short-default statistics-only behavior remain unchanged.

Public state has a separate `timeFrequencyReport`; the existing single-window `report` stays null in this mode. The report preserves full exact-file hashes and lengths, origin, import and unvalidated producer time, SHA-512 status and declared rate/center, without copying supplier claims into public state. Private retained derived arrays hold the common axis and every requested frame's amplitudes/raw dB/display dB. Source/prepared bytes are never exposed. Public report, geometry, selected frame, frame summaries and bin rows are copied/frozen. Settings/source changes drop both kinds of report, all pages and private retained arrays; the actual in-flight read/hash slot still drains before another Inspect can run.

The overview exposes four frame summaries per page, with explicit frame-select buttons and previous/next selected-frame navigation. Changing the overview page does not silently change the selected frame. Selecting a frame resets its bin page to zero. The selected frame exposes eight bins per page. Navigation never reads, hashes or runs FFTs. The retained maximum is 16384 cells with multiple arrays, **not a heap bound**; pagination limits rendered rows only. Deep copies and temporary core output may coexist.

Every frame summary reports its zero-based index, half-open sample bounds, nominal start/center/end-exclusive times and nullable peak signed bin. The center is the half-open window midpoint, not a middle sample timestamp. Selected bins show signed offset and declared RF axes, linear magnitude, raw relative-unit dB (null for zero, meaning negative infinity), and display dB. The -160 dB display floor is a display clamp, not physical noise or a measured sensitivity limit. A transformed all-zero window has no peak, including a nonzero input confined to the Hann-zero endpoint. Overlapping frames are correlated; Hann leakage/neighbors are not evidence of independent transmitters. Gap summaries describe the stride's uninspected positions between windows, not continuity of acquisition.

Synthetic controller and actual-TSX host tests cover all sizes, maximal cells/frames, strict whole-edit rejection, exact-fit/overflow preflight, counts of reads/hashes, every frame/bin page, immutable old snapshots, zero/Hann-zero results, exact positive/negative quarter-cycle transitions, gaps, and each settings/source change at held read/hash boundaries with success and rejection. Actual owner event and projection tests cover explicit controls, selected-frame and page callbacks, stale events, resets and unavailable native arbitrary-file inputs. Independent review adds direct-DFT comparisons and native digest/kernel-selection host mocks. These are **host-only** results, not browser execution or native runtime acceptance.

## Peak bin navigation

**Show peak bin page** jumps to the eight-bin page containing the already computed single-window peak or the currently selected time-frequency frame's peak. It uses the actual FFT size and shifted signed bin, including signed bin zero. The control is disabled for a null peak. It changes only the bin page and visible rows, retaining the exact report/source, selected frame and overview page. It performs no reads, hashes or analysis. Current lease and exact-state guards fence stale callbacks after settings/source edits, newer navigation, Clear or exit/background. Existing previous/next navigation is unchanged. Synthetic controller and actual-TSX host checks cover bounded sizes, edge/zero/null peaks, immutable pages and stale events; these are not browser or native acceptance.

## Exact energy mode

A separate fourth [selected-window energy / threshold mode](iq-activity-workbench.md)
uses six independently staged settings and the unchanged exact integer/rational
activity core. It computes neither FFT nor full-file statistics. Activity frames,
run summaries and selected measured intervals have bounded pages; gaps and equality
remain explicit. The threshold is supplied, not an inferred physical noise floor.
Native input and all acceptance limits above remain unchanged.
