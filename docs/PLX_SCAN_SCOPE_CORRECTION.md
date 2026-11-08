# Superseding installed-PLX scan evidence scope

This addendum corrects the iOS acknowledgment interpretation of
`PLX_SCAN_FACADE_HOST_REVIEW.md` and `PLX_SCAN_INDEPENDENT_REVIEW.md`, including
historical test labels and any broad statement that their asynchronous iOS native
model matches the installed native contract. Their raw logs, pins and tests are
preserved unchanged. The initial review missed this platform-contract mismatch.
Its no-blocker conclusion applies only to the hypothetical Promise fixture, not
to evidence of installed iOS scan acknowledgment.

## Confirmed source distinction

Independently inspected the installed PLX 3.5.1 Objective-C scan exports at
`ios/BlePlx.m:98–105`, Android scan exports at
`android/src/main/java/com/bleplx/BlePlxModule.java:208–254`, and published ESM
`lib/module/BleManager.js:146–160,318–336` for this correction:

- iOS scan start and stop expose no Promise resolver/rejecter. The new fixture
  correctly returns undefined, not an async function's Promise.
- Actual ESM `_callPromise` races its input against destruction. Undefined permits
  fulfillment without native completion input. Start installs the JS listener;
  stop removes it locally before dispatching the native request.
- Android resolves its Promise after calling the adapter. Awaiting this Promise
  gates JavaScript handoff until that adapter-call return, not demonstrated RF
  cessation or OS queue drainage.

The original candidate's 18 cases and independent eight cases include synthetic
async iOS start/stop methods. In particular, held/rejected iOS native start/stop
Promise cases are **hypothetical alternate-contract fault tests**, not installed-
iOS acknowledgment tests. Their callback projection, error conversion and local
fencing assertions remain useful host checks, but cannot upgrade that contract.
Even synchronous early-event inputs are deliberately chosen synthetic ordering,
not evidence that the native bridge emits at that point.

## New audit reproduced

Accepted audit source commit:
`786f6d9b85f841f6ddc02736e01af71a97ee01ed`, originally from the separate
`/workspace/scratch/b96d3539d24d/apex-ios-scan-ack` checkout. Cherry-picked without
content changes as `afe7693` into the review chain in
`/workspace/scratch/b96d3539d24d/apex-installed-scan`. See
`IOS_SCAN_VOID_BOUNDARY_REVIEW.md` for the audit's full scope and source pins.

The five new tests use installed ESM unchanged and a void-return iOS scan boundary.
They demonstrate ordinary scan replacement, connect dispatch and local foreground
`reusable:true` after JavaScript stop settlement without any native-completion
input. The real workbench allows Inspect of the retained document. Local listener
retirement and old callback fencing still work. The fifth case distinguishes an
Android Promise that actually holds the JavaScript connection handoff.

Independent reproduction ran all three scan files together: **31/31 passing**
(18 historical candidate + 8 historical independent + 5 new boundary tests), plus
passing typecheck. This is one overlapping 31-case run, not an additional 31
unique cases on top of earlier runs. It does not reproduce the earlier C-inclusive
101-case run. Logs are in `verification/plx-scan-scope-review/`.

## Decision and limits

Accept this test/docs correction. No native scan/connection overlap, OS ordering,
radio cessation or physical failure was demonstrated. A local reusable controller
is not native-stop acknowledgment. No blanket iOS poisoning or ordinary-discovery
gate is justified by these host observations alone; Inspect is offline document
use. Existing iOS Reset and exclusive service-data observation gates remain closed
and unchanged. Any feature requiring native-release proof still needs a separately
verified native contract and acceptance.

This review changed no runtime code, dependencies, installed SDK bytes or existing
evidence. Only the specifically authorized scan bridge source was inspected; no
firmware/startup review, C/native build, browser/device/radio operation or remote
publication occurred. UI-copy changes, if any, are a separate parent-owned change.
