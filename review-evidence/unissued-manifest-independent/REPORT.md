# Follow-up: current manifest consumer correction

Parent's full aggregate at 462ca82 reported 1904/1910 Node tests passed and six failures. This review independently reproduced precisely the six browser-C host-suite failures at review source 892bf6e: before hook compared undefined to the native adapter's a4fc189e... digest. The shared current manifest contained that file but the browser-C suite's fixed hash-source list omitted it. This is an input-verification integration defect; no browser-C behavioral test passed its before hook. The earlier independent 198-test command did not include this six-case suite and was never a complete aggregate pass.

Original failure is retained in before.tap with before.sha256. All 19 current manifest entries independently match actual disk bytes (manifest-verification.txt). The three executable consumers are browser-c-roundtrip.test.ts, native-c-roundtrip.test.ts, and plx-facade-host/fixture.ts. Native-C already includes every manifest key in its hashes; PLX already directly hashes each manifest path. The narrow correction must add the missing native-adapter hash to browser-C without deleting/revising any pin or weakening assertions. Native adapter bytes are verified by browser-C's shared manifest, not executed in that browser client chain.

Scope remains host Node and fake-SDK C data callbacks only. No browser execution, native SDK build, device/radio work, firmware edits, startup review, installs or publication.

Reviewed correction a815b108451a010b8ed62f1d76a5c609e953f49f: exactly two lines add the native adapter to the browser-C actual hash list and clarify verified-versus-executed scope. Independent rerun: 90/90 pass, no skipped/cancelled; typecheck passes. Command:

node --test tests/browser-c-roundtrip.test.ts tests/native-c-roundtrip.test.ts tests/plx-facade-c.test.ts tests/plx-unissued-acquisition.test.ts tests/app-plx-cancellation.test.ts tests/app-plx-independent.test.ts

npm run typecheck

Output: after.tap, typecheck.txt. Exact final source hashes: after.sha256. Current and historical manifests and both receipt runtime files compare byte-exact with review892bf6e. All three consumers now verify the complete unchanged current manifest. Approved for integration and parent full-aggregate rerun. This 90-case focused success does not overwrite or retroactively pass the prior aggregate failure.
