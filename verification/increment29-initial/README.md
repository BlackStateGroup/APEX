# Original twenty-ninth checkpoint failure

Run on clean source 60e38bfba94ded086c16d00dc4e47750564b804b from
2026-11-08T05:17:41.399Z to 05:18:54.202Z. Portable C passed. Node tests
passed 1052/1054, with zero skips. The remaining seven stages were not run.
The fixed runner stopped after failures, with process cleanup settled.

Both failures are exact inspector-list expectations from earlier features:
tests/analysis-inspector-independent.test.ts and tests/nfc-static-memory-review.test.ts
still expect the old ten-choice list, omitting the newly added hci-document ID.
No production defect was indicated. The UI builder and independent reviewer are
updating precise expected IDs/routes, retaining all prior checks rather than
loosening assertions or reverting production. A separate complete rerun will be
required. These original raw logs and stage-not-run metadata remain unchanged.
