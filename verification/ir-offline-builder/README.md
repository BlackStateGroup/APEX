# Offline IR builder evidence

Initial source commit `3618e5b457a1b2ddaef11eb88febac7b4285c4ac`; corrected source `badead17f3ab9b31f90e9cec0ae65ec82bdaa238`. These raw logs are copied byte-for-byte, with `.txt` appended to names. The first run encountered unsupported Node type-stripping parameter-property syntax and a test type assertion error; the second focused run retained an incorrect expected line-range assertion. Those were corrected before the original final seven-test run and typecheck passed.

Independent review then reproduced exact decimal duty values above 1 being accepted after binary64 rounding. The metadata/decimal/projection follow-ups added first-mark and declared-carrier disclosures, exact decimal range validation before conversion, original duty token retention and explicit binary64/underflow policy. Latest projection logs pass seven focused tests and TypeScript. Overlapping run counts are not additive. Independent baseline failure, repaired review and final CLI failure-branch checks are retained separately in `../../review-evidence/ir-offline/`.

Earlier test titles incorrectly described network denial. Final docs/title correctly state filesystem-write denial only. These flags do not establish OS network isolation; original logs were not rewritten. All waveform inputs are manually authored synthetic inspection data. No device, transmission/replay, provider, native acceptance or remote publication occurred.

## Copied log integrity

- `ir-offline-focused-decimal.log.txt`: 746 bytes; SHA-256 `2e28b8b9b9332c59d469b9e7f0d475d255c0af1ec17ddf43bc8ee7ad6faa8148`.
- `ir-offline-focused-final.log.txt`: 743 bytes; SHA-256 `15f2524784f84e19b7c627a630c0051008aec2f749308cb379f6cc91cbd0f1b6`.
- `ir-offline-focused-first.log.txt`: 1549 bytes; SHA-256 `8f7bf104370ce27773c00879a8220e0051563668fd13b7da2ae87852283a35b7`.
- `ir-offline-focused-metadata.log.txt`: 744 bytes; SHA-256 `c9432e65bb938650625ba546203149f975fc03b47212a5a9d63b83248616d0e6`.
- `ir-offline-focused-projection.log.txt`: 745 bytes; SHA-256 `9c515d378527642e806cf2d6ee0f7c96de3b8ae74619fa6094575ce8fe7882a4`.
- `ir-offline-focused-second.log.txt`: 1825 bytes; SHA-256 `c8c7243ed1f857fdb2f597334797981427df45b7b2e089e8b3e8f1016e55cef3`.
- `ir-offline-tsc-decimal.log.txt`: 139 bytes; SHA-256 `4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1`.
- `ir-offline-tsc-final.log.txt`: 139 bytes; SHA-256 `4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1`.
- `ir-offline-tsc-first.log.txt`: 559 bytes; SHA-256 `1c66bc18166108454dc644cd2aa67b64ab970ad1ce0407c62eceabde4584c5b1`.
- `ir-offline-tsc-metadata.log.txt`: 139 bytes; SHA-256 `4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1`.
- `ir-offline-tsc-projection.log.txt`: 139 bytes; SHA-256 `4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1`.
- `ir-offline-tsc-second.log.txt`: 139 bytes; SHA-256 `4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1`.
