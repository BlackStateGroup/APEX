# Fixed I/Q snapshot boundary review

At original worker commit 58dc574 (integrated as a1566eb), intrinsic fixed-buffer
Uint8Array bytes and a strict own-data context snapshot replace overridable
size/provenance reads. This is pure API robustness, not a CLI exploit, hardware
result or arbitrary-Proxy/global-monkeypatch sandbox. Shared, resizable, detached,
proxy and non-Uint8Array inputs reject. Genuine fixed-buffer subclasses, Buffer
and subarrays retain valid behavior.

The initial reproduction records the former empty/oversize acceptance and
changing origin. Final worker logs retain 10 focused tests, typecheck, portable C,
587 tests on that worker base and exact valid-output parity across five FFT sizes,
time-frequency, activity, lag, digests and context. Independent review repeats
focused tests and checks poisoned host accessors/iterators, mutation isolation,
hash-input isolation, freezing, nonenumerable values and revoked proxies.

Logs and original scripts are copied byte-for-byte, with .txt appended to preserve
them outside executable source discovery. Scripts include original local paths
and are historical evidence, not portable test entrypoints. The combined current
checkout is verified separately in increment17-final.
