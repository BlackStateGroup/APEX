# USB cleanup receipt design, not implemented

Read DESIGN.md for the source-grounded proposal and blockers. No native recovery
patch is supplied: a partial closeLink fix would leave unresolved failed-open
ownership, ambiguous OS effects, and dead-bridge/module-recreation cases.
Active Kotlin, native API and App source are unchanged. Proposed API signatures
and algorithms are non-executable sketches. The source hash binds the analysis;
it is not native validation.

Local hypothetical state-model checks, with no package resolution or downloads:

    CI=1 npm_config_offline=true EXPO_OFFLINE=1 node --test docs/proposals/usb-cleanup-receipts/model.test.mjs

Native compilation, device tests, installation and hardware execution: NOT RUN.

See DESIGN.md's model-limits section before interpreting the checks. OwnerId,
epochs, revisions, actual handles/acquisition, concurrency and bridge delivery
are unmodeled. The retained original host-checks.log is historical (13 tests).
review-failure.log retains the independent failing case; host-checks-followup.log
records the corrected model's run including both identity regressions.
