# Receive-only host verification, 2026-11-08

Focused baseline: APEX main `d4434c5cf789938447e83e49a5cfcbdf68b59277`.
The four baseline files were byte-checked against that commit's Git blobs.
This checkout is not a full main-repository build.

## Passed

- GCC/G++ 14.2 compilation and link of original C++ service/guard/adapter plus
  the selected real pinned RadioLib compilation units and original AXP C core.
- Linked-driver tests with a synthetic register/FIFO model. Every generated
  SPI transaction is checked against the receive-only filter. The negative
  checks cover every one-byte command, TX aliases/FIFO/control writes, illegal
  frames and requests, default disablement, all start-frame split points,
  stale capture IDs, 60-byte packets, queue drops/preservation, event limits,
  CRC rejection, SPI failure, initialization expiry and clock rollback.
- Terminal transport regressions cover failed INFO followed by START across
  every chunk split, failed START/POLL/STOP replies, partial output, failure
  while stopped, absent output, read failure with a buffered partial request,
  and no later reply, poll, re-arm or restart after transport failure.
- AddressSanitizer and UndefinedBehaviorSanitizer, halt on error enabled.
- Source pin and patch tests: 16 exact blobs, deterministic patched Module
  digest, unchanged input checkout, mismatch/overwrite rejection.
- Python syntax, workflow YAML parsing and staged whitespace check.

Logs: `host-build.txt`, `asan-ubsan.txt`, `source-pin.txt`.

The unmodified upstream Module.cpp initially failed UBSan for a zero-length
memcpy with a null source. The recorded build-time four-site guard fixes that
path; this result does not describe an unmodified upstream sanitizer pass.

## Not passed / not run

- LeakSanitizer cannot execute in this ptrace-based sandbox; its diagnostic was
  “LeakSanitizer does not work under ptrace”. The successful ASan/UBSan run used
  `ASAN_OPTIONS=detect_leaks=0`. Leak detection is requested in CI but not run here.
- ESP-IDF cross-build: not run; `idf.py`, CMake and the Xtensa toolchain are absent.
  Added CI jobs are a future validation gate, not completed evidence.
- Independent firmware review found a reply-failure race: buffered START and
  later ticks could still arm after output failed. This checkpoint fixes that
  with a terminal service-owned transport latch and regression tests; independent
  re-review is pending. GPIO errors are latched in the platform but can remain
  unreported to the service until a later SPI operation or lease expiry.
- Flashing, electrical/RF measurements, packet reception, phone integration,
  hardware stop behavior and the full APEX suite: not run.

Host executable SHA-256 values at this checkpoint:

- Normal: `72c906418a800e8826654a254f420e00a47e813fba0009c601450d629672ddd0`
- ASan/UBSan: `aa6f813eeb383a47d89028eba3826f9cad79664c9ace94912cb9362c43b4b3aa`

These are host test binaries, not ESP32 firmware images.
