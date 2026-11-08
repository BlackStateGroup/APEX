# Controlled offline BLE trials

Implemented from exact base ed294ad; no live acquisition or model interpretation. Ten focused tests pass. The implementation's full isolated regression passed 244 Node tests and semantic typecheck using the previously approved installed dependencies. Core/source/journal limits did not change.

Independent review passed all ten tests and added deterministic file-replacement probes (FIFO, directory, different regular file between check and open). Each rejected promptly, emitted no partial report and did not access a native device. The CLI rejects special files before reading and repeats descriptor identity/type checks after a nonblocking open where supported. Symlinks to regular files are allowed; content mutation by another writer is not an atomic file snapshot and remains documented.

An additional independent Python oracle compared 250 synthetic datasets containing 3000 variable-length payloads against every matrix value, null, histogram, run count and changed/stability flag. All agreed. Synthetic demonstration JSON is included; it is not a radio recording or field-mapping result. Source IDs, conditions, receipt references and grouping remain unverified operator declarations.
