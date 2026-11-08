# Independent HCI memory workbench boundary review

Reviewed exact production commit `0d3a75a9e9795dbac4aaeeb396f3899f751dcdb2`, based on stable `35950a5eb09024046a3a8ce4816b3b669ee84706`. No production changes were made. Initial pass found no regression; the follow-up below identified and repaired a disclosure defect.

Initial nine independently authored tests supplemented the builder's eight: strict whole-edit rejection and tab-persistent fence; overlapping old/new hash success and error; malformed hash outputs; same-source late invalid legacy selection clearing previous valid reports atomically; recursively frozen aliases and stale page handles; activation leases; actual native adapter executed against a narrow expo-crypto digest mock and Node oracle with non-ASCII bytes/Buffer subviews; actual TSX empty-result controls; inert dense AD fields and bounded long string projections. The rendering loader reuses the repository's established narrow static-render scaffold; assertions and fixtures are independent.

Results:
- `initial.log`: six independent controller/adapter tests passed.
- `render-initial.log`: two passed, one failed due to reviewer fixture accidentally containing 32 rather than 31 AD bytes. Removed the fixture's exclamation mark. This was a test-author error before parser execution, not a production defect. Original failure remains preserved.
- `focused-final.log`: all 17 focused builder and independent tests passed, zero skipped.
- `typecheck.log`: full TypeScript check passed.
- `playwright-list.log`: 33 scenarios enumerated only. No browser launch or local server attempted.

Boundary observations: adapters hash fresh copies of decoded bytes, not pasted hex text. The actual native adapter was exercised only with a mock of expo-crypto's byte-buffer API; this is not native runtime acceptance. These tiny adapters copy ordinary typed-array inputs with `new Uint8Array(bytes)`, not intrinsic-accessor hardening against hostile JS iterators. The real UI passes ordinary fresh typed arrays through the trusted core hasher boundary, which copies source bytes independently. No arbitrary-JavaScript sandbox claim is made.

Actual TSX was transpiled and rendered using React DOM server and narrow RN primitive mocks. No effects, mounted interactions, browser layout, native callbacks, real native crypto, hardware, physical reception, lifecycle timing on a device, or accessibility acceptance was verified. Controller race tests do not imply mounted React acceptance. Header-only zero-record metadata shows page 1 of 1 with both paging controls disabled. Zero-report legacy events are rejected by unchanged core semantics.

Existing dependencies were reused without installation. Checks set CI=1, EXPO_OFFLINE=1, EXPO_NO_TELEMETRY=1, npm_config_update_notifier=false, npm_config_offline=true, npm_config_audit=false and npm_config_fund=false. The adapter mock itself performs no network or filesystem writes. Static rendering uses temporary compiler output in the established test scaffold. No full aggregate, real captures, device/native/log/ADB/settings work, credentials, external publication, provider calls or radio actions were performed.

## Follow-up: AD interpretation status disclosure defect

The parent identified that accepted legacy transport framing could contain malformed AD while the projected UI showed only element/service counts and said the whole event was validated. Independently reproduced with AD bytes `050941` and accepted transport framing: core advertising status was malformed but the UI omitted it. Both controller and actual-TSX regressions failed on original production commit; `ad-status-initial.log` and `ad-render-initial.log` retain those failures. `parent-disclosure-repro.log` is copied unchanged from the parent's separate reproduction.

Builder repair `aa43603d23fa546740fbd9c03f6fcf7169bba2c9` was cherry-picked for review only. It separates framing acceptance from interpretation, exposes bounded AD status/issue/unparsed-byte counts, service matched/opaque/invalid/incomplete counts and BTHome parse categories without nested data dumps. The two original regressions pass, as does a new independently authored actual-TSX matrix covering encrypted BTHome, unknown service UUID, missing BTHome object, a complete public battery reading, and a recognized prefix followed by an unsupported object. No prefix is presented as a complete format match.

`ad-repaired-focused.log` records 22/22 passing focused tests (12 independent, 10 builder). `ad-repaired-typecheck.log` records passing full TypeScript check. No full aggregate or runtime browser/native validation was attempted. The independently mocked actual native digest implementation matches the installed expo-crypto source API `digest(algorithm, BufferSource): Promise<ArrayBuffer>`; that source check is not native acceptance.

Final production source reviewed: `06c26be6f427ac71c1e71f0e5a6a264fe3eabd55` (includes the repair). Its final wording distinguishes metadata-result privacy from the visible exact input draft. `final-source-focused.log`: 22/22 pass; `final-source-typecheck.log`: typecheck pass; `final-source-playwright-list.log`: 33 cases enumerated, never launched. No remaining confirmed regression in the reviewed scope.
