# Memory-only ordinary IR workbench

The Analysis tab now includes a separate ordinary Flipper `.ir` inspector. It uses the strict existing [offline IR parser](IR_OFFLINE.md), not the older pulse-array recording editor or the evidence journal. Unsupported input fails atomically; rejection by this intentionally narrow subset is not a claim that a protocol or waveform is physically invalid.

## Interaction and retention

- Paste the whole ordinary remote file and explicitly declare `synthetic-fixture` or `recorded-import`. These are caller claims, not verified origins. Inspect is explicit. Editing, changing declaration and loading the example never inspect automatically.
- The example was authored for this workbench, with one standard NEC declared-field record and one synthetic complete raw timing array. Neither is a physical recording or copied upstream fixture. Matching declared/recognized values do not prove shared device identity.
- The exact accepted JavaScript ASCII draft received by the app is retained, including any CRLF and comments it receives. The editor accepts at most 262144 ASCII characters, equal to accepted draft bytes. The controller does not truncate, normalize or partially replace this accepted text. Clipboard, browser/native TextInput and other pre-handler processing may already have changed the original file text or line endings; that behavior is unverified. The UI digest therefore identifies the accepted draft, not necessarily the original file bytes before paste. The CLI separately hashes the actual file bytes it reads; its original-file semantics are unchanged. Non-ASCII or oversized edits retain the previous draft, clear results and block Inspect until an accepted replacement (including the authored example) or Clear. ASCII controls can be edited but are rejected by strict inspection as documented in the parser contract.
- Leaving Analysis clears inspected results and fences pending results while retaining the draft, caller declaration and rejected-edit block in memory. Return and Inspect again. Reload loses everything. Clear removes draft, declaration, result and rejected-edit block.
- Pending hashing is not cancellation. Private generation checks fence both late successes and late errors; activation leases reject callbacks queued from a previous tab activation, including after reentry. The controller exposes frozen snapshots, not mutable state or input arrays. No caller-provided state is merged into its private state.

## Bounded observations and honest labels

Results show at most four records per page. Duplicate names retain separate ordinals. Names and exact duty tokens use JSON-quoted display excerpts of at most 64 ASCII characters with original length; the retained source and exact report fields are unchanged. The editable source is deliberately displayed in full in a height-bounded field, so the metadata bound excludes that input.

Raw duration arrays are **not displayed**. Count, minimum, maximum and total microseconds are compact numeric summaries over the whole array. Total duration is safely representable under the existing per-record bounds. There is no hidden unbounded timing dump or duration navigation.

- Parsed address/command values are declared standard NEC integers with original four-byte field spellings, not decoded airframes.
- Raw recognition applies to the entire unchanged duration array, conditional on an assumed first-mark alternating convention. No capture, polarity detection, repair or authentication is claimed. Nonrecognition can still describe valid raw timing data.
- Frequency and duty are declared settings, sometimes firmware defaults, not measured carrier values. The exact decimal duty token and binary64-rounded numeric projection are shown separately.
- Repeats are `not-represented`, not false. The UI digest identifies exact accepted draft bytes; it establishes no authenticity, ownership, device identity, compatibility or physical reception.
- All text and URLs are inert. There is no save, journal import, export, share, copy action, URL opening, transmit/replay path, device/provider call, new permission or persistence.

## Trusted local hash seam

`inspectIrFile(bytes, context, localHash?)` preserves its two-argument Node/Web Crypto behavior. The optional trusted `IrStringHasher` receives only an immutable exact ASCII string after the existing byte/context snapshots and strict parsing. UTF-8 hashing of ASCII is byte-identical to the core input bytes; normalization inside the hash adapter would violate its contract. For UI use these are the accepted draft bytes, not independently verified pre-paste file bytes. The private byte copy never escapes. A lowercase 64-hex result is required, but shape validation does not establish that an arbitrary adapter performed honest SHA-256.

The app reuses `src/platform/bundle-digest` solely as the existing platform-local string hash implementation, with no evidence-store import. Web uses Web Crypto; native resolution selects the existing Expo Crypto adapter. No global crypto mutation, new package or install is involved. Native runtime execution, platform compatibility and physical devices remain unverified.

## Verification and limits

On Node v24.22.1 with the pre-existing dependency tree:

- `node --test tests/ir-offline.test.ts tests/ir-workbench.test.ts tests/ir-static-render.test.ts`: **21/21 pass**.
- `npm run typecheck`: **pass**.
- `node node_modules/@playwright/test/cli.js test --list`: **32 scenarios listed**, including the newly authored ordinary IR scenario. No browser launched or scenario executed.

Tests exercise exact string-hash/default/web-adapter parity; asynchronous input/context mutation and hash rejection; digest shape validation; no partial reports; immutable nested observations and alias integrity; edit limits and retention; explicit declarations; rejected-edit blocking across tab/declaration changes; all relevant late-success/error fences; old-activation queued actions; newer inspections; four-record projections; large duty/name excerpts and 1024-duration numeric summaries; and malformed/unsupported inputs. Actual TSX is transpiled and rendered with React DOM server and narrow React Native primitive mocks. This is static projection coverage, not lifecycle/event/browser/native execution. The production controller is tested directly for lifecycle behavior.

Raw initial/final logs are retained under `verification/ir-workbench/`. The initial production-only typecheck passed; adding tests revealed three TypeScript test-narrowing errors (a union narrowed across a callback, plus getter state narrowed across controller calls). Their original test source and failing log are retained. Tests were corrected with a captured decoded object and fresh snapshot helper; production behavior was not changed to satisfy those diagnostics. The final typecheck and focused rerun pass. The npm environment emits an existing `http-proxy` configuration warning.

No full aggregate tests, firmware rebuild, app export, browser, native or physical-device run was performed for this feature; parent review owns the later aggregate checkpoint. Existing dependency installation was reused. No claims of rendered phone layout, user-event behavior or end-to-end native hashing are made.

## Paste-boundary disclosure correction

A follow-up clarifies that UI byte identity starts with the accepted JavaScript ASCII draft. It cannot establish preservation before clipboard or TextInput processing. The UI now labels the hash “Accepted draft SHA-256” and states this boundary explicitly. Static projection assertions verify the disclosure. No parser, hashing, controller or CLI behavior changed. Focused and typecheck rerun logs are retained in `verification/ir-workbench/paste-disclosure/`; previous logs and source manifest remain unchanged.
