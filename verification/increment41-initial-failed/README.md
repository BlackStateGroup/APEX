# Initial v41 aggregate failure, preserved unchanged

Clean source 462ca82877238b1f02cf58ccf5af4c48aeba4d57.
Portable C passed; Node ran1910 tests:1904pass,6fail, zero skips/cancelled.
All six browser-C roundtrip cases failed their shared input-pin setup: the new
current manifest contains the native Bluetooth adapter, while that browser-only
fixture build result did not hash that path and returned undefined. This is a
verification integration failure, not an observed device/runtime defect.
Subsequent stages were NOT RUN. Process groups settled; no truncated logs.
All original result/manifest/log bytes are copied unchanged and separately hashed.
The correction must preserve all input checks and receive independent review;
a future complete aggregate uses a new output directory rather than overwriting
this run. No original evidence or source-review boundary is retroactively changed.
