# IQ staged single-window implementation verification

Final source: 073ce04 (with 3143255 and 5df5f43), based on 695d646.

- `node --test tests/iq-app-*.test.ts tests/iq-analysis.test.ts tests/iq-offline.test.ts`: 73/73 pass on final source.
- `./node_modules/.bin/tsc --noEmit`: pass on final source.
- Existing independent IQ tests were materialized from b1207e6 for these checks but are not duplicated in the implementation commits. The independent render test received local mock-only TextInput/new callback additions; reviewer owns its integrated version.
- Baseline focused controller/runtime/selection checks: 17/17 pass.
- First complete implementation IQ app matrix: 30/30 pass.
- Strict terminal LF/CR/CRLF/U+2028/U+2029 regression coverage: 6/6 new window tests pass. The explicit character validation is defense in depth/clarity, not a demonstrated failing prior dollar-anchor case.
- Initial typecheck before adapting existing render projection props failed TS2769: projection fixture lacked mode, size, start and toneExample callbacks. The test fixture was corrected, then typecheck passed. This initial diagnostic was printed to the tool result, not captured in a raw file.

The exploratory full `node --test tests/*.test.ts` run occurred before final wording and before provisioning this fresh sibling's portable firmware prerequisite: 1197/1215 pass, 18 fail. Preserved `full-suite.log` shows failures involving missing `build/apex-firmware` (and related firmware/RE inspector prerequisites). This is not a full aggregate pass. No dependency installation or portable rebuild was performed here. Parent owns aggregate verification with its existing prepared prerequisites.

No browser, native application/device runtime, physical radio, actual user files, storage workflow, network/provider, credential or publication action was tested. TSX uses host primitive/hook mocks only. Scope is controller, projection, mathematical synthetic fixtures, strict exact-byte provenance and core regression checks. The fixture is not physical RF/calibration/protocol evidence. Core, schemas, dependencies and lockfiles are unchanged.
