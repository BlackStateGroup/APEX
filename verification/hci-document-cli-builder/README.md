# Selected HCI document CLI builder evidence

Source cc429f6dda1de59c210589b64a06de99ad17acbd. Seven new actual subprocess
checks and 47 overlapping focused tests passed, plus full typecheck. No failed
builder runs were reported. Independent review added three subprocess suites and
passed 33 overlapping focused tests plus typecheck; see review-evidence/hci-document-cli.
Focused totals overlap and are not aggregate counts.

Preparation is explicit and mutually exclusive with pagination/ordinary selection.
Reopening reads a bounded regular file, uses fatal UTF-8 while preserving a BOM for
strict JSON rejection, and verifies derivative bytes/structure before publishing.
Original capture references remain UNVERIFIED. stdout is emitted only on complete
success; failures use generic diagnostics. Final symlinks are refused, while
symlinked ancestors remain permitted. The selected event can retain multiple
advertisers and sensitive data. Neither the derivative hash nor operator provenance
establishes authenticated origin, reception, ownership or truthful capture history.
No file writes, UI/journal changes, device/native/provider or publication actions.
Node write-denial checks are not a claim of operating-system network isolation.

Raw first/final logs are copied unchanged with .txt appended.

- final-focused-tests.log.txt: 4953 bytes; SHA256 564d071844f33e0c57acecc88a5f267c28ec756f5791de837cf7132c9f71709a
- final-tsc.log.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- first-tests.log.txt: 956 bytes; SHA256 0942449d0ee1ef557e1f0d73aa79bcb1e2bc6e02322d5cd5975f2f62b0ea75b0
- first-tsc.log.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
