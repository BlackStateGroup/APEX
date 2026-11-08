# Independent selected HCI evidence review

## Scope

Synthetic, offline core/CLI/platform review. No original user captures, network,
browser, native build, device, radio, provider, credentials or publication.
The tested contract is descriptor-checked plain data and detached snapshots,
not a sandbox against hostile JavaScript, proxies or dishonest crypto adapters.
Original capture references remain UNVERIFIED; no physical reception or
acquisition authenticity is inferred from checksums.

## Independent regression coverage

`tests/hci-evidence-independent.test.ts` adds 19 groups covering:

- Exact imported whitespace/escaped characters and unchanged canonical outer
  envelope; full binary derivative verification with no stored report/flag.
- Missing byte hashing capability at save, journal verify, standalone verify,
  bundle creation and bundle read, while parse/list remain structural.
- Re-signed outer envelopes and bundles carrying stale derivative hashes,
  extended-event substitution, invalid late RSSI/count and additional records
  with recomputed binary digest. Errors insert nothing and return no success.
- Exact synthetic-fixture / recorded-import source mapping and native rejection.
- Getter, hidden/symbol/inherited fields, toJSON and disguised-kind ingress.
- Caller mutation across delayed byte/text hashing and disposable hasher byte
  copies. Existing string-only crypto callers retain old verification behavior.
- Valid date with many tabs that fits its unescaped field but overflows the
  enclosing JSON limit. Rejection occurs before byte hashing, without truncation.
- Real Node CLI create/preview output equality, malformed HCI, invalid UTF-8,
  symlink, extra argument and invalid date rejection with empty stdout.
- Real web journal adapter against in-memory Storage, full HCI verification,
  quota errors and preservation of already stored records.

## Findings and corrections

The early implementation inspected input spreads/record kind before checking
outer descriptors. Builder corrected this to reject new-kind accessors before
invocation and to detach payload data before awaits.

Independent reproduction then found missing-own-kind toJSON substitution
(`own-kind-substitution.log`). After correction, nominal old-kind toJSON could
still substitute a new HCI record (`disguised-kind-failure.log`). These were
own-data policy gaps: the parsed document still underwent binary and outer
checks, so no verified-versus-persisted mismatch was demonstrated. Final
correction rejects conversion into the HCI kind before its hashing capability.

The initial compatibility run also reproduced the extensionless platform import
failure under Node. Builder changed web/native imports to their explicit .ts
modules; this is adapter wiring, not native-runtime acceptance.

## Evidence sequence

- `first-run.log`: expected pre-implementation baseline failure on 60e38bf,
  before the new evidence kind existed.
- `first-implementation.log` and `first-implementation-source.sha256`: 15
  independent groups passed on a copied intermediate implementation after its
  initial accessor repair.
- `own-kind-substitution.log`: 15 passed, 1 failed on missing-kind toJSON.
- `compatibility-initial.log`: 42 passed, web adapter import failed.
- `pre-disguised-focused.log`: 65 passed on builder 70a71ec source, before adding
  the final disguised-kind case. Exact hashes in `pre-disguised-source.sha256`.
- `disguised-kind-failure.log`: 17 passed, 1 failed on disguised-kind toJSON.

Final source revision, hashes, focused test count and typecheck are recorded
below after correction. Full aggregate execution belongs to the parent and is
not claimed by this review. No UI/controller file was changed in this work.

## Final result

Final independent run: **73/73 focused tests passed**, including **19 independent
HCI evidence groups**, and `node_modules/.bin/tsc --noEmit` exited 0. This combines
existing focused regressions with builder tests; it is not an aggregate count.
Exact reviewed production is builder commits `70a71ec`, `820005a`, `c2d7ef4`,
plus evidence commit `f829477`; reviewer worktree tested commit is retained in
`final-tested-revision.txt`. Final source SHA-256 is in `final-source.sha256`.
No unresolved blocking finding was found in this bounded review.

The parent-requested optional-byte-method audit additionally found lost
`EvidenceCrypto` receiver binding. A stateful method threw on save, despite the
standalone platform adapters being unaffected (`method-receiver-failure.log`).
After the kind-disguise correction, only this test failed
(`post-kind-before-method.log`). Final code captures the byte function once and
binds it to the crypto object before awaiting the full reader. Standalone final
callback API behavior remains unchanged.

Final command:

```
node --test tests/hci-evidence-independent.test.ts tests/hci-event-evidence.test.ts tests/evidence.test.ts tests/evidence-bundle.test.ts tests/evidence-bundle-repair-independent.test.ts tests/hci-selected-document.test.ts tests/hci-selected-document-independent.test.ts tests/hci-document-cli-independent.test.ts tests/web-evidence.test.ts
node_modules/.bin/tsc --noEmit
```

The existing selected-HCI golden reports remain identical in their independent
regression. The four generic-kind canonical/bundle/CLI baseline/current artifacts
provided by the builder also have matching SHA-256 pairs. The explicit old-kind
independent test verifies unchanged canonical JSON and old string-only callers,
including false for digest mismatch versus throw for an invalid source.
