# Advertised-UUID cleanup repair evidence

The original cross-flow audit reproduced retained-source inspection after backend
Stop failure using the real scan controller and UI coordinator. The checked-in
regression in tests/foreground-ble-workbench.test.ts preserves that scenario.

The first isolated aggregate lacked the already-approved local REA dependency
symlink; eight REA tests failed. Its original log is retained. After supplying
that existing dependency path, the worker aggregate passed 542/542 and focused
checks passed 43/43. No installation or timeout change was made. Main combined
548/548 validation, portable C and TypeScript are in increment13-final.

Independent reviewer reported 71/71 focused tests plus TypeScript and no blocking
issue in the scoped source/mock review. No browser, mounted React, native bridge,
phone, tag or RF acceptance was run. SDK reuse is distinct from native teardown.
