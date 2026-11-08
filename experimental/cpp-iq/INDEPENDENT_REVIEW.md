# Independent host-only C++ I/Q review

Reviewed 2026-11-08 in the isolated experiment directory, not the main checkout. Reference source is labeled commit `63f530d1f6f8f943d4fd2c1016904f3259daf77a`. No existing source or evidence files were modified by this reviewer. The independent executable was created under `/tmp`.

## Conclusion

**No general numerical compatibility acceptance. No mobile or production acceptance.** The frozen variant passes the original 41 fixtures, but supplementary nonzero-position impulses expose strict peak-selection disagreements. Frozen Hann and FFT coefficients alone do not guarantee identical `std::hypot`/`Math.hypot` rounding or peak ordering for theoretically tied bins. Passing amplitude tolerances or an amplitude-only independent DFT does not excuse observable peak differences.

The current stored frozen benchmark report has original differential 41/41 PASS, supplementary differential 11/20 PASS and overall FAIL. The supplementary set comprises 15 impulses and five seeded full-range inputs; nine impulse peak comparisons fail. These are distinct from this reviewer's additional 20 random cases below.

## Findings

- No defect found in bounded request parsing, signed little-endian sample conversion, input/range guards, FFT sign, frequency shift, periodic Hann normalization or table offsets. The 64-bit end calculation precedes indexing. Accepted windows fit at most 65,536 samples, making subsequent 32-bit frame arithmetic safe. Short-circuit validation rejects unsupported FFT sizes and oversized frame counts before multiplication.
- Hann table offset `n - 256` is the sum of preceding supported lengths. Twiddle offset `size / 2 - 1` is the sum of preceding stage half-lengths. Maximum supported indices fit the generated arrays.
- Exact-zero/null and peak equality remain strict. Amplitude comparisons are toleranced rather than bitwise; low-amplitude raw-dB differences are reported explicitly. No silent relaxation was found.
- Seven codec/reference tests passed independently. Generated snapshot check verified 7,936 Hann, 4,095 cosine and 4,095 sine values.
- Independent ASan/UBSan build passed 61 differential cases: the supplied 41 plus 20 deterministic random inputs across all FFT sizes. Another 28 malformed/range requests were rejected with exit 2, empty stdout and the exact rejection diagnostic. Finite tests are not a proof of universal safety or compatibility.
- **Leak checking unavailable.** The initial leak-enabled run aborted on the first fixture because LeakSanitizer reports that it does not work under ptrace. Subsequent successful sanitizer runs explicitly disabled leak detection. Do not describe this as a leak-check pass. Parent evidence preserves this limitation separately.
- Benchmark medians are descriptive shared-host warm-compute measurements. Frozen lookup removes runtime trigonometric work relative to the reference. Metadata construction, data snapshots, allocation/destruction, GC and output layouts also differ. Timers exclude startup, framing, IPC, serialization, preparation and UI. The per-batch roundtrip includes three warmups and 25 calls, so is not single-call bridge latency. No language-only, equal-end-to-end, device, energy or mobile speed claim is established.
- Initial runner hardening findings: benchmark parity warnings did not themselves fail a stage; coefficient regeneration checks were not run automatically. See follow-up verification below.

## Commands and independent validation

Commands were executed from `/workspace/scratch/b96d3539d24d/apex-cpp-iq-proof`:

```sh
node generate-coefficients.mjs --check
node --test proof-codec.test.mjs
g++ -std=c++17 -O1 -fno-fast-math -ffp-contract=off -Wall -Wextra -Wpedantic -Wconversion -Werror -g -fsanitize=address,undefined -fno-omit-frame-pointer -fno-pie -no-pie -DAPEX_FROZEN_COEFFICIENTS src/iq.cpp src/host.cpp -o /tmp/apex-cpp-iq-review-asan
```

The first invocation of the following differential script used `detect_leaks=1:abort_on_error=1` and aborted with the LeakSanitizer ptrace diagnostic. The successful invocation was:

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fixtures, sizes, packPairs, encodeRequest, decodeResponse, compareNumerics } from './proof-codec.mjs';
import { prepareReference, runReference } from './reference.mjs';
let seed=0x182926; const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0; return (seed>>>16)-32768};
const cases=fixtures();
for(const n of sizes) for(let t=0;t<4;t++) cases.push({name:`independent-random-${n}-${t}`,data:packPairs(Array.from({length:n+37},()=>[rand(),rand()])),fftSize:n,startSample:37,hopSamples:65536,frameCount:1,sampleRate:12345678.125,centerFrequency:-123456789.75});
for(const f of cases){const r=spawnSync('/tmp/apex-cpp-iq-review-asan',[],{input:encodeRequest(f),maxBuffer:2e6,env:{...process.env,ASAN_OPTIONS:'detect_leaks=0:abort_on_error=1',UBSAN_OPTIONS:'halt_on_error=1:print_stacktrace=1'}});assert.equal(r.status,0,`${f.name}: ${r.stderr}`);assert.equal(r.stderr.length,0);compareNumerics(decodeResponse(r.stdout),runReference(await prepareReference(f),f));}
console.log(`${cases.length} strict differential cases passed under independent ASan/UBSan build (41 supplied +20 seeded random); leak detection unavailable/disabled`);
JS
```

Malformed-input validation:

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict'; import {spawnSync} from 'node:child_process'; import {fixtures,encodeRequest} from './proof-codec.mjs';
const base=encodeRequest(fixtures()[0]), inputs=[Buffer.alloc(0),base.subarray(0,47),Buffer.concat([base,Buffer.from([0])]),Buffer.alloc(262193)];
for(const [at,values] of [[12,[0,128,4294967295]],[16,[1,4294967295]],[20,[0,65537,4294967295]],[24,[0,65,4294967295]],[28,[0,1001,4294967295]]])for(const v of values){const b=Buffer.from(base);b.writeUInt32LE(v,at);inputs.push(b)}
for(const [at,values] of [[32,[NaN,Infinity,-Infinity,0,1e9+1]],[40,[NaN,Infinity,-Infinity,1e12+1,-1e12-1]]])for(const v of values){const b=Buffer.from(base);b.writeDoubleLE(v,at);inputs.push(b)}
for(const b of inputs){const r=spawnSync('/tmp/apex-cpp-iq-review-asan',[],{input:b,env:{...process.env,ASAN_OPTIONS:'detect_leaks=0:abort_on_error=1',UBSAN_OPTIONS:'halt_on_error=1:print_stacktrace=1'}});assert.equal(r.status,2,r.stderr?.toString());assert.equal(r.stdout.length,0);assert.equal(r.stderr.toString(),'apex-cpp-iq-proof: rejected input\n')}
console.log(`${inputs.length} independent malformed/range requests rejected cleanly under ASan/UBSan`)
JS
```

## Follow-up runner verification

Supplementary strict failures are correctly recorded as a FAIL stage, propagated to overall FAIL, and described as rejection of a drop-in numerical replacement. Verified by reading `proof.mjs`, `extra-fixtures.mjs`, and `proof-results/frozen-benchmark.json`. The full suite was not rerun for this follow-up.

The parent subsequently saved both hardening fixes. Independent follow-up source inspection confirmed:

- `requireCommand('coefficient-snapshot-check', process.execPath, ['generate-coefficients.mjs', '--check'])` executes before compilation and uses the normal command-failure path.
- Benchmark strict mismatches accumulate in local `parityFailures`; the benchmark stage becomes FAIL when that array is nonempty. Existing overall stage-to-report FAIL propagation applies.

`node --check proof.mjs` passed. The following exact focused assertions also passed; these are source/syntax checks, not a rerun or fault-injection test of the complete runner:

```sh
grep -nE 'coefficient-snapshot-check|parityFailures|host-warm-compute-benchmark|report.status = report.stages' proof.mjs
node --check proof.mjs
node --input-type=module <<'JS'
import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
const source=readFileSync('proof.mjs','utf8');
assert.ok(source.includes("requireCommand('coefficient-snapshot-check', process.execPath, ['generate-coefficients.mjs', '--check'])"));
assert.ok(source.includes("status: parityFailures.length ? 'FAIL' : 'PASS'"));
console.log('Runner hardening source assertions passed');
JS
```
