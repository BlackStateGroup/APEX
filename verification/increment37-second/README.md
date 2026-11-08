# Second thirty-seventh aggregate attempt

All 1619 Node tests and portable C passed. Full TypeScript checking then found
that the baseline host-harness expected-failure case pairs were inferred as
possibly undefined indexed elements. Raw TS2769 diagnostics and all stage states
are preserved; later stages were not run. This is a test typing correction,
not evidence that known historical transport faults were fixed.
