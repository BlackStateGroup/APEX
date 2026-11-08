# Independent exact BLE candidate arithmetic oracle

Run `python3 verification/ble-field-oracle/check.py` with Node 24 and Python 3.
No external dependency, network, device, file-write to the journal, or process
execution of supplied content is involved. The Node helper receives generated
JSON input only and invokes the actual candidate validator.

Python's `int.from_bytes` and `fractions.Fraction` independently derive expected
raw signed/unsigned integers, reduced values and signed residuals, and inclusive
tolerance decisions. The deterministic seed creates 1,200 complete supported
synthetic TLM datasets, two assigned trials each. All widths 1–4, both byte
orders and both signedness settings are covered; divisors include 1, 3, 7, 10,
100, 256 and 1,000,000,000, and value offsets include both allowed extrema.
Tolerance values are placed at adjacent nine-decimal quantization points around
the independently calculated absolute residual. Deliberately out-of-bounds
candidate offsets produce incomplete rows without treating them as zero.

All 2,400 rows agreed on exact integer/rational results and decisions. The
production code performs no fitting or candidate search; generating varied
synthetic software tests here is not protocol discovery or a real experiment.
The two rows per generated dataset intentionally repeat its synthetic payload
and are not independent observations. This validates arithmetic behavior, not
field semantics, sensor truth, native compatibility, RF reception or identity.
