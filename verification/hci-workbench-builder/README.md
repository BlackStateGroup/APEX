# HCI workbench builder evidence

Source stack 0d3a75a9e9795dbac4aaeeb396f3899f751dcdb2,
aa43603d23fa546740fbd9c03f6fcf7169bba2c9 and
06c26be6f427ac71c1e71f0e5a6a264fe3eabd55. Original baseline workbench checks
passed before the parent and reviewer reproduced missing malformed-AD visibility.
Transport framing acceptance is now distinct from AD framing and service parse
statuses, preserved as bounded frozen numeric summaries. Privacy copy explicitly
distinguishes metadata output from the visible original hex draft.

Original before-fix reproduction and first fix test failure are retained. That
fixture used Eddystone byte 20 without a version and expected invalid; changing
its authored input to 2000 exercises the intended invalid TLM body, not a parser
repair. Final 10 focused checks and full typecheck pass. Thirty-three Playwright
scenarios are listed only. Independent review is separate under
review-evidence/hci-workbench-boundaries (22 overlapping checks).

Native byte hashing uses the installed Expo digest API, but only source and narrow
mock parity checks ran. Mounted events, clipboard processing, actual platform
hashing, browser and device acceptance remain unrun. No real captures, logging,
ADB, settings, acquisition, native device or provider actions occurred. No external
publication. Logs below are copied unchanged with .txt appended.

- ad-before-fix-repro.log.txt: 2296 bytes; SHA256 c627494ba5ba74d453843c2bd6c7ad57bd52c9f91b8f3d9bf6a754ad9c5e4e69
- ad-fix-focused-1.log.txt: 1772 bytes; SHA256 b7e635f6b9da0adba9208330f6037b811921ee8e0b133320a155592ba07b847f
- ad-fix-focused-2.log.txt: 1100 bytes; SHA256 c93324b5ea91b915a81f1ce1e2c648aab71fc9e44e683c4fdd6ee01944795585
- ad-fix-focused-3.log.txt: 1100 bytes; SHA256 a1abc6ab7943a67a7aa7328b91989aae55ab6d5bd54f73e8380329d62eaaed33
- ad-fix-typecheck-1.log.txt: 139 bytes; SHA256 4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1
- ad-fix-typecheck-2.log.txt: 139 bytes; SHA256 4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1
- ad-fix-typecheck-3.log.txt: 139 bytes; SHA256 4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1
- browser-list.log.txt: 3690 bytes; SHA256 229a88409830697a372b6eb69d88b353cdd829b4c097c7baa04b200d7025755e
- focused-1.log.txt: 610 bytes; SHA256 3e2c952bf915df99e1fac5c1ce33af966a8aef1b23203c92a6820cd2f384dd49
- focused-2.log.txt: 884 bytes; SHA256 208e30f6ce27f8d8f7fb414d68fee556f801dcb76e2fac5eb494b00529792c25
- static-1.log.txt: 302 bytes; SHA256 708fbf61a7f701faabcd6eb6dbfd520bdf445fa28d18c3303f06c2616f2b16bf
- typecheck-1.log.txt: 139 bytes; SHA256 4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1
- typecheck-2.log.txt: 139 bytes; SHA256 4bf47d6e007329281ee31f3c71e1c0ccb4b64e3d605f3f54c9c500a38e1dd6c1
