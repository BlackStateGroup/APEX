# Research jobs in the APEX app

The Research tab now connects to an explicitly selected HTTPS worker, lists registered firmware and durable jobs, submits a bounded REA operation, requests cancellation, verifies results and saves them into Cases. No connection or job runs automatically when the tab opens.

The worker is a **single-operator laboratory service**, not a deployed or hardened multi-tenant analysis platform. It accepts no uploaded binaries, URLs, filesystem paths, arbitrary commands or user-supplied REA arguments. An operator registers up to 16 local ELF files when starting it. Each job names an exact SHA-256. The worker checks the registered bytes again, takes a private immutable analysis snapshot and never executes the target.

## Supported operations

- REA 6.8.0 ELF-note inspection, including source digest/size checks.
- REA 6.8.0 with Ghidra 12.1.4: decompile one of the six public AXP functions (`apex_crc16`, `apex_encode`, `apex_stream_init`, `apex_stream_feed`, `apex_device_init`, `apex_device_feed`). A missing function or unavailable engine fails the job.

These operations build on the separate [full-engine experiment](https://github.com/BlackStateGroup/APEX/pull/27). This service does not claim that decompilation reconstructs the original source or proves behaviour on physical hardware. ELF notes and pseudocode are different result types.

## Start on an analysis host

Requires Linux, Python 3.12+, Node 24, the locked REA dependencies and a certificate trusted by the connecting phone/browser. Ghidra jobs additionally require the pinned engine and its compatible full JDK. Existing workspace setup installs REA dependencies; it does not provision or expose this service.

```sh
npm ci --prefix tools/reverse-engineering --ignore-scripts --omit=optional
python3 tools/build_firmware.py
# Set APEX_RESEARCH_TOKEN from your secret manager or a private environment file.
# Generate a fresh random value with: openssl rand -hex 32
python3 tools/research_worker.py \
  --state /private/apex-worker-state \
  --target /absolute/path/to/owned.elf \
  --cert /absolute/path/to/server-cert.pem \
  --key /absolute/path/to/server-key.pem
```

The default listener is loopback port 8443. An operator can explicitly select an interface with `--bind` and an exact browser origin with `--web-origin https://your-apex-app.example`. Native clients do not require a browser origin. TLS verification is never disabled. Do not put tokens into URLs or case documents. The access token is checked on every API request, is not logged, and is removed from the analysis subprocess environment.

In the app, enter the HTTPS origin and token, connect, select a registered target, then inspect notes or choose a function. Refresh jobs to observe progress. There is no automatic polling or retry. Repeating a submission whose response was lost reuses its request identifier. The server rejects reuse of an identifier with different inputs.

Leaving the tab, backgrounding or disconnecting clears credentials and aborts local requests. **This does not cancel an accepted remote job.** Reconnect and select Cancel research job when desired. Jobs remain discoverable after an app restart because they live on the worker. A lost submit response can therefore be reconciled without assuming that no work started.

## Durable state and interruption

SQLite uses WAL and `synchronous=FULL`; acceptance follows the committed insert. An OS advisory lock prevents two service instances using the same state directory. The service is intentionally one operator and one running analysis at a time. A maximum of 16 queued and 100 total jobs bounds retained storage; there is no automatic deletion of evidence.

States are queued, running, cancelling, succeeded, failed, cancelled, interrupted and cleanup-unknown. Cancellation wins over a result not yet committed. A success or cancellation is published only after the owned process group has been observed absent. Output and elapsed time are bounded. These process-group checks do not establish isolation against an engine or descendant that deliberately escapes its group.

On restart, previously running/cancelling jobs become interrupted and the dispatcher pauses. A cleanup-unknown job also pauses new work. Neither becomes a fake success or a claimed cancellation, and neither is silently retried. Existing results and queued cancellation remain accessible. Inspect the host and reconcile outstanding processes before starting a **new private state directory**; preserve the old directory for evidence. Automated reconciliation of uncertain process identities and production retention/rotation remain later work. No reset endpoint discards this uncertainty.

The service reads registered local binaries using bounded regular-file descriptors and rejects symlink leaf paths. Its state directory must be private. The operator and analysis host remain trusted; REA/Ghidra are native parsers, not a sandbox for hostile firmware. No engine isolation or remote-host attestation is claimed.

## Evidence and bounds

Targets: 16 bytes to 4 MiB, ELF only. Requests: 4 KiB. Engine stdout/stderr combined: 128 KiB. Returned output: 32 KiB; complete result: 64 KiB. A job deadline defaults to 180 seconds, followed by bounded process cleanup. The HTTPS listener allows eight concurrent connections with bounded socket reads/handshakes.

The client checks job/request/target identity, supported provider/version, output length and SHA-256 before showing a result as verified. ELF-note results additionally bind their internal artifact digest and size. This checks consistency and transport identity, not the truth of a compromised host's claims. Web responses are streamed with a byte cap; React Native fetch lacks a streaming reader, so it requires explicit bounded content framing and checks the decoded size afterwards. Native redirect and transport behaviour still need actual-phone acceptance.

Saving creates a new case containing a **worker source reference** and a derived result linked to it. The source reference explicitly says that original firmware bytes are not present on the phone. Credentials are excluded. Case export/restore uses the existing integrity and lineage checks. A failed multi-step save may leave a partial case for inspection; it is not reported as a completed save.

## Verification

The focused suites exercise committed acceptance, repeat/conflicting requests, queue bounds, real process cancellation/time/output limits, a fresh process exiting abruptly, startup fencing, result tampering, single-owner locking, TLS trust rejection, origin/authentication checks, and the actual TypeScript client reaching real REA ELF inspection through HTTPS. Ghidra's selected-function path is additionally exercised in its dedicated CI job with the official engine archive verified by SHA-256.

The phone-width browser scenario covers submit/cancel/status, rejection of a changed result, successful verification, case lineage/export, and credential clearing. Its supplied pseudocode is explicitly a synthetic test fixture; the real engine test is separate. Native compilation and physical iPhone/Android acceptance remain separate from browser and host tests.

```sh
node --test tests/research-jobs.test.ts
APEX_WORKER_REAL_REA=1 python3 -m unittest discover -s tests -p 'test_research_worker.py' -v
npx playwright test tests/research-worker.ui.spec.mjs
```
