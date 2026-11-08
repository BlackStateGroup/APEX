# Independent static NFC review

Reviewed builder source `a5408450d57a0ac09d0d71363d9cc62d34bcb8fd` in a separate worktree, with no changes to implementation. Independent tests are manually authored synthetic bytes. No runtime regression found. During pre-commit review, the builder clarified NDEF-relative versus data-area/source coordinates and added explicit coordinate fields before the reviewed commit.

## Evidence and outcomes

- `initial-tests.txt`: original 10 independent tests pass.
- `initial-typecheck.txt`: preserved review-test-only TS2532 at line 54 (`changed[0] ^= 1`). Corrected to an explicit asserted indexed read. No production change resulted. Initial test source retained in review commit `a5b4d53`.
- `final-focused-tests.txt`: 39/39 pass across independent static NFC (11), builder static NFC (8), and existing NDEF parser/evidence tests (20).
- `final-typecheck.txt`: full repository TypeScript `--noEmit`, exit 0 (empty successful output).
- `git diff --check`: exit 0.

Independent enumeration: 12,288 tag-position cases (256 tags at each of 48 positions); 24,064 short-length-position cases (256 length octets at each of 47 available positions for two value tags); 1,024 single-CC-octet substitutions (all values at each of four positions with the other three fixed). These are not all four-byte CC combinations.

Additional checks cover literal source hash/offsets and exact NDEF value framing, preserved decoder status/issues with all coordinate systems, missing/empty/multiple NDEF, end exhaustion, post-terminator opacity, late failure suppressing prior NDEF, proprietary/structure-byte omission, inert URI, invalid/chunked/opaque values, fixed/nonshared view brands, shadowed view properties, context mutation before hash await, hash-copy isolation, deep freeze/report branding, output bounds, and actual CLI generic empty-stdout errors. CLI runs use Node permission mode with filesystem reads allowed and no write grants. Both direct paths and ancestor symlink paths succeed; final-component links fail. Fixtures remain unchanged. This is permission-constrained execution evidence, not a hostile-runtime proof.

Commands used with `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npm_config_update_notifier=false npm_config_offline=true npm_config_audit=false npm_config_fund=false`:

```
node --test tests/nfc-static-independent.test.ts
./node_modules/.bin/tsc --noEmit
node --test tests/nfc-static-independent.test.ts tests/nfc-static-offline.test.ts tests/ndef-offline.test.ts tests/ndef-evidence.test.ts
```

Existing installed dependencies reused by symlink, no install. Initial shell setup was not executed because its cwd did not exist yet; retried setup from an existing cwd. No aggregate, browser, native/device, network writes or publication was run.

## Independent public-source check (2026-11-08)

[Infineon application note](https://www.infineon.com/dgdl/Infineon-How-to-operate-my-d-move-devices-in-NFC-Forum-Type-2-Tag-infrastructures-ApplicationNotes-v04_00-EN.pdf?fileId=5546d4624ad04ef9014af3554908139f): actual Z8F80907343-B revision 5.1, 2026-03-23 despite URL name. Printed pages 6–7 support layout/static-region and TLV-tag facts; pages 15–17 support static CC examples. A 48-byte static data region does not prove that the physical device has only 64 bytes. No device access/locking claim inferred.

[Nordic SDK 13.0.0 data format](https://docs.nordicsemi.com/r/bundle/nrf5_sdk_v13.0.0/page/nfc_type2tag_format_dox.html): corroborates CC capacity in units of eight bytes and value-length semantics. Its 992-byte example is not the APEX profile or a general Type 2 requirement.

[NFC Forum specification page](https://nfc-forum.org/build/specifications/type-2-tag-specification/): lists version 1.3. Full normative text not obtained. This review validates an explicitly narrower product policy, not current specification conformance, certification or licensing clearance. Extended length byte order was not verified and is excluded. No vendor implementation/prose copied.

## Reviewed source hashes

```
149c6999c998ea596ba911e974234b631468f70102fec6144fe7cb92f7dc5b1b  packages/core/nfc-static-offline.ts
df94be1a9cd5d46d0708069258a769acbb5225abf9a2d269823bca2e4c97421f  tools/inspect-nfc-static.ts
78f4b10c3780a59b167d75b0115be48044574bd4b7a7632c8432552bd15fc713  tests/nfc-static-independent.test.ts
```
