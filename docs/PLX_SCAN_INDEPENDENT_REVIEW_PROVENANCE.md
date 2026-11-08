# Scan review execution provenance clarification

The independent review of candidate `dfb98d5174b5eee926240f0b0f777d5d7f394b8a`
was performed in `/workspace/scratch/b96d3539d24d/apex-installed-scan`, the supplied
builder checkout. The reviewer did not create a separate clone. The checkout was
clean at the candidate commit when review began; the reviewer appended additive
review tests, documentation and evidence there, producing commit
`6f759b82ae6168dd171d820a73095249719977e1`.

“Independent” in `docs/PLX_SCAN_INDEPENDENT_REVIEW.md` means independent review
judgment and a separately authored synthetic scan fixture. It does not mean a
separate clone, dependency installation or executor. The checkout used its existing
`node_modules` symlink to `../apex-continuation/node_modules`. Test processes used
the unchanged loader's per-case module isolation, which is distinct from checkout
isolation.

The assignment's separate-clone expectation was missed. This addendum records the
actual execution provenance without changing the pinned report, test inputs or
retained logs. No tests were rerun solely for this clarification. The original
report is `docs/PLX_SCAN_INDEPENDENT_REVIEW.md`; the retained execution evidence is
`verification/plx-scan-independent/`, both in the checkout above.
