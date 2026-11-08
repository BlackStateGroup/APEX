# Integrated protocol/session subset

After integrating source d2cc2f6 and independent evidence 96ae92b into the current
main worktree, this focused subset passed 123 checks with zero failures or skips:

    node --test --test-concurrency=2 tests/protocol.test.ts tests/protocol-byte-boundary.test.ts tests/protocol-byte-independent.test.ts tests/axp-response-json.test.ts tests/axp-response-independent-review.test.ts tests/session.test.ts tests/session-release-boundary.test.ts tests/usb-session-integration.test.ts

Existing offline/no-notifier settings were applied. The unchanged raw combined
stdout/stderr log is focused.log.txt. This is overlapping subset evidence, not an
additional aggregate total or native/device validation. It checks protocol changes
with stricter AXP response parsing and synthetic session/USB ownership behavior.
