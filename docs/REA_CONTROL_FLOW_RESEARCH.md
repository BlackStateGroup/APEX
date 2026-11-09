# RES-01A: byte-bound CRC structure across compiler variants

## Result and scope

APEX can now turn actual REA-supervised GNU disassembly into byte-verified
structural reports for all six public AXP core entry points. This is a desktop
research increment, not Ghidra decompilation, a phone-to-worker service, hardware
acceptance or completion of RES-01.

On 8 November 2026, four unexecuted Linux x86-64 host ELF builds were inspected:
GCC 14.2.0 at `-O0`, `-O2`, `-Os`, and `-O2` with one controlled source-copy
substitution from polynomial `0x1021u` to `0x8005u`. Production firmware is
unchanged. REA 6.8.0 supervised all 24 selected-function disassemblies.

The useful finding is that a call-name-only investigation misses the optimized
CRC copies. In the known `-O2` build, `apex_encode` and `apex_stream_feed` contain
`0x1021` immediates but no direct calls to `apex_crc16`. The `-O0` and `-Os` builds
retain direct calls and keep that immediate inside `apex_crc16`. Source inspection
and the compiler variants support inlining as the explanation; a missing call
alone would not. The tool now records both direct call addresses and immediate
candidates, so this difference is visible rather than silently lost.

| Build | Six selected functions: instructions | Bytes | `0x1021` locations | Direct calls to `apex_crc16` from encode/feed |
| --- | ---: | ---: | --- | --- |
| O0 | 366 | 1,429 | CRC function | 1 / 1 |
| O2 | 284 | 1,152 | CRC, encode and stream-feed | 0 / 0 |
| Os | 162 | 588 | CRC function | 1 / 1 |
| O2 polynomial negative control | 284 | 1,152 | None | 0 / 0 |

In the negative control, `0x8005` appears at the same three function locations.
That distinguishes this specific source change; it does not establish semantic
equivalence, vulnerability, cryptographic recovery or a generally reliable CRC
detector. A synthetic test deliberately puts `0x1021` in a subtraction and still
marks it only as a search lead, demonstrating why the literal is not proof.

Every variant retains one unresolved indirect callback in `apex_stream_feed`.
The report does not invent its destination. In optimized builds,
`apex_device_feed` is a five-byte direct tail jump outside its own function
range, not a call and not a recovered implementation of the callee.

## Exact inputs and provenance

The source baseline is private APEX main
`7f1110f9455d0c5b87419046b864314e1f1df191`. The three firmware inputs and five
existing research inputs were materialized and checked against their Git blob
IDs in `verification/rea-flow/base-inputs.json`. No Flipper or native bridge
branch was used or changed.

The actual run is under `verification/rea-flow/2026-11-08/`:

- `experiment.json` records source hashes, compiler, flags, per-variant function
  measurements and the explicit negative control.
- `inputs/` retains the exact source copies, including the separately named
  mutated copy. It is never written back to firmware.
- Four `.elf` files retain exact inspected bytes with execute permission removed.
  Their `*.compile.json` files record compiler arguments and streams.
- Each variant directory retains six original REA envelopes, `control-flow.json`
  and a digest manifest for those outputs.
- The O2 binary SHA-256 is
  `a9d2393adc37fffa3ef8eed26344a20d572930ec207f26de96c07db07ea7cca5`.

The targets are compiled and read, never invoked by these workflows. Compiler,
Node, REA and objdump processes do execute. The input binaries are host ELF files,
not ESP32-S3 images. Hashes identify bytes; they are not signatures or proof of
trusted ownership. Full installed-tool attestation is not claimed.

## Product change and use

No new dependencies or system installation is required beyond the already pinned
REA package and the existing GNU host toolchain. Nothing is bundled into mobile.
The existing app's ELF-note import format is unchanged and does not accept these
new control-flow documents as executable instructions or device attestations.

Inspect an explicitly selected, owned, supported binary:

```sh
node tools/inspect-control-flow.mjs path/to/owned-host.elf new-evidence-directory
```

Reproduce the four-variant controlled investigation from this checkout:

```sh
node tools/research-control-flow.mjs new-experiment-directory
```

Run structural and independent adversarial tests, then the actual pinned REA
integration (the latter needs the existing desktop REA dependencies):

```sh
node --test tests/rea-control-flow*.test.mjs
APEX_REA_INTEGRATION=1 node --test tests/rea-control-flow*.test.mjs
```

## Verify retained evidence before reuse

The separate offline verifier accepts the exact artifact plus a complete evidence
directory, without requiring REA, objdump or the original temporary snapshot:

```sh
node tools/verify-control-flow.mjs path/to/owned-host.elf existing-evidence-directory > verified-linkage.json
```

Keep the output **outside** the evidence directory. The directory must contain
only `manifest.json`, `control-flow.json` and the six named `*.rea.json` files.
An extra entry, `failure.json`, incomplete manifest, symlink, non-regular file,
invalid UTF-8, oversized input or mismatched digest/length causes rejection.
Manifest entries are an exact filename allowlist. Recorded source paths,
snapshot paths and arbitrary extra fields are never opened or executed.

The verifier reads bounded regular-file descriptors, checks the actual ELF
digest, validates all seven manifest entries, then replays the raw REA envelopes
and compares **every function summary** with a fresh derivation from the retained
instruction listing and exact ELF bytes. Simply changing a graph, count or range
and recalculating its manifest digest does not pass. All eight evidence files and
the artifact are observed again before returning, including identity and byte
comparisons. This is not an atomic filesystem snapshot or protection against
coordinated same-user tampering.

The output is `apex.rea.verified-byte-linkage` schema version 1. It has no local
paths or timestamps: artifact, manifest and report hashes link each selected
symbol's exact byte range and hash to its raw evidence file hash and evidence ID.
Each symbol includes instruction/block counts and explicit unresolved-transfer
count and graph coverage. Matching inputs produce the same output after moving
the bundle or renaming the artifact. The output is data, not a phone import,
executable job, trust score or hardware attestation.

Crucially, digest agreement is **not authenticity**. Coordinated replacement of
all inputs can pass. GNU instruction text is still trusted and is not
independently decoded: altered mnemonic text plus a correspondingly regenerated
summary can remain self-consistent. Tool versions, timestamps, source observations,
historical non-execution and snapshot cleanup remain recorded assertions. The
verifier itself runs no target and no analyzer; it does not establish behavior,
decompilation, credential access, phone integration or physical compatibility.

The verification tests replay all four retained real compiler variants and
exercise rehashed summary tampering, changed raw observations, failures, unsafe
paths, file kinds, input bounds and path-free deterministic output. A CLI test
runs with Node child-process permission denied. The actual REA integration test
also verifies a newly generated report. CI replays every newly generated compiler
variant with child-process permission denied after the analysis step.

Without the environment flag, the real REA integration test is explicitly skipped,
not passed. A separate path-scoped CI workflow runs it plus the experiment. The
workflow's presence does not prove CI has executed; this record describes local
runs only unless a later exact-commit run is linked.

## Acceptance checks

The parser intentionally accepts only linked little-endian ELF64 x86-64 with an
ordinary bounded section table and exactly one executable, nonempty static ELF
symbol for each selected AXP name. Stripped inputs, unsupported architectures,
ambiguous symbols, out-of-range tables and excessive metadata are rejected.
Selected functions are limited to 64 KiB, total symbol traversal to 100,000
entries, section count to 4,096 and each symbol name scan to 1,025 bytes.

Every selected instruction byte must exactly cover its ELF symbol range in order,
including GNU wrapped byte lines. Missing, altered, duplicated, gapped,
overlapping or out-of-range bytes fail. A direct branch into an instruction's
middle fails. Report limits and subprocess output/time limits are enforced.

REA raw and normalized observations must agree, including provider, operation,
selected symbol, exact argv, snapshot path, artifact hashes, exit zero, complete
status, no truncation, no signal, no stderr and no detected artifact change.
This validates the locally produced envelope's consistency, not a cryptographic
REA signature. GNU objdump remains the trusted instruction decoder.

The workflow reads bounded regular-file descriptors and uses one private,
read-only snapshot for all six analyzer calls. Source identity/digests and the
snapshot digest are checked again. Successful snapshot cleanup is required
before the summary is published. Existing output directories are refused;
failed analysis retains any completed raw evidence and never returns success.
A late publication failure can leave a partial summary. Consumers must require
a complete valid manifest, verify every listed digest and reject any directory
containing `failure.json`; a summary file alone is not an accepted result. Source-file digests observed at workflow start/end accompany
the results. Same-user tampering and intervening changes are not excluded.
REA owns normal child cleanup. Abnormal termination of its parent is not a
verified process-tree cleanup guarantee.

Independent adversarial review found and fixed two defects before acceptance:
GNU width-suffixed/REX-prefixed return spellings initially produced false
fallthrough, and aliased symbol tables could multiply parser work beyond the
intended aggregate budget. Eleven independent tests cover those issues plus
malformed ELF/listings and control-flow edge cases. The final local suite also
runs real supervised analysis, verifies retained hashes and snapshot removal,
and checks existing-output refusal and stripped-input rejection.

## Boundaries and next step

These are structural direct-transfer graphs, not recovered C or complete
control-flow proofs. They include padding and potentially unreachable code.
Indirect targets, external callees, return destinations, exceptions, signals,
dynamic linking and self-modification are unresolved. Call fallthrough is
conditional on the call returning. Block and instruction counts are not runtime
performance or complexity measurements.

Ghidra is still unconfigured and a full JDK is still missing in this environment.
No installation was attempted. The full-engine milestone remains the existing
REA worker contract: authorize/provision the selected engine, decompile this
known binary, compare recovered behavior with independent vectors, verify
cleanup and persistence, then implement and accept the bounded phone job path.
This increment supplies exact input artifacts and a better baseline for that
comparison, without claiming those remaining gates have passed.
