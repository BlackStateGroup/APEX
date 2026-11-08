# HCI builder evidence

Source stack: 102b12619ae7d4c9af08ac754ba7e8585df65c51, 1aac6ac and f37a2ef. Raw builder logs are copied unchanged, with .txt appended. The initial focused failure was an incorrect synthetic fixture byte-count expectation (57 versus actual 58), not a parser repair. Expanded original verification passed ten focused tests and TypeScript.

Independent review identified missing standalone caveats in selected-event JSON. Two follow-ups added shared disclosures and explicit digest byte-equality scope without changing parser, selection or opaque-payload rules. Final builder focused verification passed eleven checks and typecheck. Overlapping run counts are not additive. Independent failure, corrected reviewer fixture and final evidence are under ../../review-evidence/hci/.

No real capture was used, no phone logging/ADB/security setting/device action occurred, and no opaque/key/ACL/extended payload was decoded or dumped. Node subprocess filesystem writes were denied; no network-isolation claim is made. Core hashing is trusted and receives a separate copied byte view, not the retained original.

## Copied log integrity

- hci-offline-digest-disclosure-focused.log.txt: 1176 bytes; SHA-256 f640014ea39d849964743129053690a02c02e1e5369a52826f97c40955420417.
- hci-offline-digest-disclosure-tsc.log.txt: 0 bytes; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- hci-offline-disclosures-focused.log.txt: 1175 bytes; SHA-256 d932e162d67318e43870ef54dbee72f581b8a571eda8d33f8dc082428c1782da.
- hci-offline-disclosures-tsc.log.txt: 0 bytes; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- hci-offline-focused-expanded.log.txt: 1099 bytes; SHA-256 941a098d94ab990c87f8a652073e6fdeaa1ce9e07e1b129657fccd16dcb3eeb7.
- hci-offline-focused-final.log.txt: 895 bytes; SHA-256 2139f109fcd387b1809ccc56f8925d72a2a30676b0226fd69486e03ba523c6a8.
- hci-offline-focused-first.log.txt: 1544 bytes; SHA-256 4281c5f126426e70f6c0fabdb268403c61bdfad79d3f950217400f8479b1e0dc.
- hci-offline-tsc-expanded.log.txt: 0 bytes; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- hci-offline-tsc-final.log.txt: 0 bytes; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- hci-offline-tsc-first.log.txt: 0 bytes; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- hci-offline-tsc-second.log.txt: 0 bytes; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
