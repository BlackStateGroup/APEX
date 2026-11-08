# Native wrapper source preservation

Final reviewed patch: commit 5fb50a89a5bae44b47cc06fa00dcb1fab2271ee7 against 31763290d72e5e672759831dc1dd94791588a756. SHA256: 7011e085a6c906296aa7cc5ca146710fdd36bcce5f34e14e63c657ca9814b7c8.

The original wrapper could leave sources parked after SIGTERM without recovery guidance. An initial proposed lock/signal fix was independently rejected: inherited-stdio close did not establish descendant quiescence, and synthetic same-group writers corrupted restored sentinel files after both successful and failed fake prebuild. Its corruption proof is retained, not represented as a successful validation. No actual repository source corpus was damaged.

Final code requires tracked POSIX process-group absence before restoration. Uncertainty, live/zombie groups or permission errors retain corpus, lock and recovery metadata. Mode0700 preserves parking privacy. Unexpected lock contents preserve ownership. First late interruption extends the observation deadline once so termination escalation can occur; both deadlines use a monotonic clock. Windows with a corpus fails before moving it; absent-corpus behavior is retained with explicit limits.

Final implementation and independent review each passed23/23 focused tests. Syntax, semantic TypeScript and source diff checks passed. Logs are captured live. Prior late-interrupt timing reproduction and earlier candidate corruption are retained separately. Independent final review found no remaining blocking issue within the documented boundary.

All tests use synthetic temporary apps and fake local Expo programs. No actual Expo prebuild, native build, SDK installation, permission/signing action, device, network or remote operation occurred. This does not close native-build acceptance. Deliberately session-escaped descendants, unrelated destination races and abrupt wrapper termination remain outside guarantees; recovery requires inspection, not automatic stale-lock deletion. See docs/native-source-parking.md.
