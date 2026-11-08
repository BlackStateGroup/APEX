# Extended synthetic walkthrough builder evidence

Builder commit: `6657f48aff12a276d563a85d5e7f166b94f91d3c`.

All copied log bytes are unchanged; `.txt` was appended to log names. `first-tests` is the previous two-test baseline, not validation of the extension. `focused-first` records one failure: a fault-injection fixture used the wrong length selector, so its intended corruption was not applied. The selector was corrected rather than weakening the expected nonzero exit or empty-stdout assertions. Final focused checks passed 3/3 and final TypeScript output is empty with successful exit. The final summary is 5796 bytes including its newline with SHA-256 `a3d5a315c053b80d7c7fa4a5c62aa2d67b2a6316dcef9087f3a8eabe2ec35b82`.

Independent evidence/tests are under `../../review-evidence/offline-lab-independent/`. Filesystem writes were denied for tested demo subprocesses; shell captures write these evidence files. No native/device/RF/provider/browser behavior is established. The quartertone has nonzero endpoints; zero-energy behavior is documented, not exercised by this demonstration.

## Copied log integrity

- `offline-lab-extended-first-tests.log.txt`: 326 bytes, SHA-256 `5f8c390dc2de6f6961aac4fa965afe7b8c83bbf9e5f7923650271e5e8feceea1`.
- `offline-lab-extended-focused-final.log.txt`: 440 bytes, SHA-256 `7965fe547387bfd305acc06242617fa7e5f40231ae88728657f76c6b6eb51786`.
- `offline-lab-extended-focused-first.log.txt`: 1396 bytes, SHA-256 `332cc8af36e2597348854376533d43fb03e2f6a5267ce71fa7a84f9679295348`.
- `offline-lab-extended-typecheck-final.log.txt`: 0 bytes, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `offline-lab-extended-typecheck-first.log.txt`: 0 bytes, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
