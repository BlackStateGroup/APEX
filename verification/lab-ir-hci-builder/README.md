# Synthetic IR/HCI walkthrough builder evidence

Deliverable sources 6a14e799e9b40174bbeacf39849fcd33b650628e and
34f63efb91644c7a83cb428c0175078d4dede649. Original stages are unchanged;
removing only the two new fields reproduces the original 5796-byte output and
SHA256 a3d5a315c053b80d7c7fa4a5c62aa2d67b2a6316dcef9087f3a8eabe2ec35b82.
Final output is 8806 bytes including LF, SHA256
dfe1ae0ab01718192b652df1592af25b4294e64b013716ed26bb4926228b7504.

First focused failure was a manually counted opaque fixture length of 21 rather
than 22; the second overbroad privacy check matched explanatory prose. Both
original failed logs remain unchanged. Corrected focused suite passes 9/9 and
full typecheck passes. Parent/reviewer then reproduced permissive hex decoding
ignoring malformed fixture suffixes. Strict single ASCII hex line validation now
rejects them before Buffer decoding. This was trusted repository fixture integrity,
not an arbitrary user-input parser vulnerability. Independent failing/passing
regressions and final 16 overlapping checks are recorded separately under
verification/offline-lab-ir-hci-independent.

IR fields remain declared or conditional whole-array interpretations. HCI uses
manually authored host/controller bytes, opaque metadata and separate explicit
legacy selection/extended metadata. No real capture, native device, acquisition,
provider or network operation. Core input bounds apply after fixed repository
file reads; readFileSync itself does not bound allocation. Node filesystem-write
denial and targeted traps are not operating-system network isolation. All
assertions and bounded serialization precede the single success stdout write.

Logs/output below are copied unchanged with .txt appended.

- lab-ir-hci-final.json.txt: 8806 bytes; SHA256 dfe1ae0ab01718192b652df1592af25b4294e64b013716ed26bb4926228b7504
- lab-ir-hci-final.stderr.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- lab-ir-hci-first.json.txt: 8806 bytes; SHA256 dfe1ae0ab01718192b652df1592af25b4294e64b013716ed26bb4926228b7504
- lab-ir-hci-first.stderr.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- lab-ir-hci-strict-hex-focused.log.txt: 1038 bytes; SHA256 eafd6c99adc56dd95541fb30f111634d5813886989e116a600e0ffec93038835
- lab-ir-hci-strict-hex-tsc.log.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- lab-ir-hci-strict-hex.json.txt: 8806 bytes; SHA256 dfe1ae0ab01718192b652df1592af25b4294e64b013716ed26bb4926228b7504
- lab-ir-hci-tests-final.log.txt: 2005 bytes; SHA256 8ebde79127d6317a5490d05010df330f2c50414831cb1b6a599e733f30db6847
- lab-ir-hci-tests-final2.log.txt: 1036 bytes; SHA256 3f2d68e620b9890e97f7f3e5dc479b87cf9edc9856b5ebb771e91cdf63a67e83
- lab-ir-hci-tests-first.log.txt: 1962 bytes; SHA256 6cd05a4f86df166dbb00bfdab389cc8d36cf51780b9f031e1f134e45ed584b4c
- lab-ir-hci-tsc-final.log.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- lab-ir-hci-tsc-first.log.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
