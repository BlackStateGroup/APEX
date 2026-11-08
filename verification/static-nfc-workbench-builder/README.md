# Static NFC memory workbench builder evidence

Source stack fc02cda7987bd32e618434fbc5d2bbb0a858c110,
8209323ebd04cc117267e3b9ea3b35b309679c9b and
8938995308ff4951483919ae366c8f822433c7fd. Standalone controller/card was
independently integrated as the tenth memory-only Analysis choice. Existing phone
NDEF and serialized NDEF routes remain separate. No core/native/digest changes.

Original fixture failures, including a data-mode/structure-length mismatch and
initial example padding count, are retained. The 48-byte example is an empty NDEF
TLV. The 64-byte structure now contains manually authored complete inert Text APEX,
with explicit labels and separate Inspect. Its initial 130-character padding
mistake was corrected to exactly 128 characters before final checks.

Final builder selection passed 31 overlapping focused checks, typecheck, and 36
browser scenarios listed only. Independent review passed 59 overlapping checks,
including nine new cases; see review-evidence/static-nfc-memory. Counts overlap and
are not additional aggregate totals. Original failed runs remain unchanged below.

No actual browser, mounted React, keyboard, scroll, accessibility, native hashing,
tag/device, acquisition or provider execution was performed. Local byte hashing
reuses the existing adapter under an alias; this is not HCI parsing. No automatic
inspection, source mode inference, URI action or persistence was added. Input draft
is visible, while result projections omit raw UID/lock/proprietary/trailing data.

All logs are copied unchanged with .txt appended.

- static-nfc-integration-focused-first.log.txt: 3048 bytes; SHA256 4b0246df5e7ce5088923455137ff0f98005c2affcaaa03d781842d4abc84a9ae
- static-nfc-integration-typecheck.log.txt: 139 bytes; SHA256 4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1
- static-nfc-integration-ui-list.log.txt: 4199 bytes; SHA256 069a2a47e4d5e00991142aa0fc5d3268d6c60ccbdc9eb8d7ed9cd8840c4556c1
- static-nfc-text-example-focused-final.log.txt: 3270 bytes; SHA256 056beb0303525f6bc9973b91d7f151d688c6d6bda660ea912e08a7b1c6a36ebf
- static-nfc-text-example-focused-first.log.txt: 11203 bytes; SHA256 f746540e647f47d172cf27a880831d9495e8e734fbe6096b8e536afb786b11c7
- static-nfc-text-example-typecheck.log.txt: 139 bytes; SHA256 4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1
- static-nfc-text-example-ui-list.log.txt: 4199 bytes; SHA256 069a2a47e4d5e00991142aa0fc5d3268d6c60ccbdc9eb8d7ed9cd8840c4556c1
- static-nfc-ui-focused-final.log.txt: 2420 bytes; SHA256 4b01bec11e68cde803a1d674844465cdbcf8423c9d65427bd679b8af96cec48a
- static-nfc-ui-focused-first.log.txt: 6636 bytes; SHA256 603903f0182be7a35ff4e889ee83a5b9fde8fdcfe783ac57b04c76fdd4e913b8
- static-nfc-ui-focused-second.log.txt: 1607 bytes; SHA256 10caaa3f37b4d4589b40946c39c9a67c91b729e168dab43b2ae4ced80c1c9a0c
- static-nfc-ui-focused-third-failed.log.txt: 12370 bytes; SHA256 fabc05981a7156f060830d0877e17914b36c3866a5c82537bc3fd3d750e06132
- static-nfc-ui-typecheck-final.log.txt: 139 bytes; SHA256 4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1
- static-nfc-ui-typecheck-first.log.txt: 139 bytes; SHA256 4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1
