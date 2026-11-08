# Extended HCI builder evidence

Source 0acf97f67d27575987de7a46058b4e368007bb59. Original first focused run had
one overbroad privacy assertion matching explanatory prose, not a payload leak;
first typecheck found a test-only union-narrowing error. Test assertions and types
were corrected, without changing payload omission or weakening the contract.
Final 17 focused checks (11 legacy and 6 new extended) and full typecheck pass.
No aggregate, actual capture, browser, native, device, acquisition or network
acceptance is inferred. Input files were manually authored synthetic bytes.
Logs are copied unchanged with .txt appended. Independent review is recorded
separately under verification/hci-extended-independent.

- hci-extended-focused-final.log.txt: 1801 bytes; SHA256 c5bfd0f782bc79d852fe46916790c975c282ccaef2afcd0c4569ebff3c417bdb
- hci-extended-focused-first.log.txt: 2435 bytes; SHA256 7c41110f309fc21cb831a3225ea0f9ff3e931cfc0c26ba18f2e7d77e7a70be67
- hci-extended-typecheck-final.log.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- hci-extended-typecheck-first.log.txt: 589 bytes; SHA256 c939a8388a0491196062f1cc1b8f2546e21ec244885a47ac0404406054c1cbd9
