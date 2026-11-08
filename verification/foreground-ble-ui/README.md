# Foreground BLE UI verification

This increment is local and unpushed. The explicit native-only Devices card collects bounded selected-source documents in memory, stops on leaving the screen, and hands a chosen source to the offline Analysis workbench. Interpretation and persistence remain separate explicit actions. No native action was executed.

Passed:
- 12 pure coordinator tests (including synchronous-start/stop races, late generations, bounds, exact source transfer and no automatic save).
- Complete 218 Node host tests plus the portable C build/checks, using `node --test --test-concurrency=2 tests/*.test.ts` after `npm run firmware:build`.
- Full semantic `npm run typecheck`.
- `HOME=/tmp/apex-ble-ui-home CI=1 EXPO_NO_TELEMETRY=1 npm run build`: web/iOS/Android JavaScript exports. These are not native builds.
- Playwright discovers 15 browser scenarios; no browser scenario was executed.
- Existing 541-entry lockfile inventory check; package-lock SHA256 remains `8a9d0da060c260fb3009fecf79036c22fde1faf2737c0a5f4bf4c629901f1e74`.

Initial default-concurrency host run: 217/218 passed; the existing missing-GNU-tools REA subprocess exceeded its 30-second timeout. `host-tests-initial.txt` retains the failure. The isolated REA suite then passed all five tests, and the full bounded-concurrency rerun passed. No timeout, security check or test assertion was removed to make it pass.

Independent read-only review passed 29 coordinator/controller/native-mock tests and a composed collector/coordinator probe. The probe checked the 25-callback cap, exact source retention, late-callback rejection and busy-state release after delayed cleanup. No reproduced blocker.

Existing approved npm dependencies were reused from the isolated validation installation via ignored local symlinks. No package, lockfile, permission configuration, account, remote repository or source-register change occurred. Browser startup/network-isolation blockers remain established; React rendering, native compilation, native permission dialogs and real-phone RF behavior remain unverified.

Log trailing whitespace is normalized for patch hygiene; substantive output and failures are retained.
