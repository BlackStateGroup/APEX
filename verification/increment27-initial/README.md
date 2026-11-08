# Initial combined v27 run: failed retained evidence

Clean tested source 3c0aed43ac54fe537ba4be7274f2453ab1653b89.
Run 2026-11-08T04:56:33.746Z through 04:57:38.888Z.
Portable C passed. Node tests: 1001 passed of 1002, one failed, zero skipped.
Remaining seven runner stages were not run after the test-stage failure.

The sole failure was tests/ir-static-render.test.ts, whose old assertion expected
'Leaving Analysis clears'. Actual corrected UI copy explicitly says 'Leaving this
inspector or Analysis clears inspection results.' The new chooser adds inspector
switching, so the production disclosure is accurate and should not be reverted.
The exact test expectation is being updated and independently checked before a
new full run in a separate output directory. This run is not a passing checkpoint.

All raw logs and metadata copied unchanged; .txt appended to .log names.

- manifest.json: 10046 bytes; SHA256 9595b4bb7ceb6bcc77c8368d4355dc2003e353c8b64f694ad233936e3312601d
- node-tests.stderr.log.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- node-tests.stdout.log.txt: 98781 bytes; SHA256 b44e91c0e14909705e4c0176318146094e2d3063235bd2fbcef69c39055e6b9a
- portable-firmware.stderr.log.txt: 0 bytes; SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- portable-firmware.stdout.log.txt: 139 bytes; SHA256 fe2f33a7dbff9f1ed1374544089721242fe0e82cfc8c8133c9f27cb305c6fee3
- result.json: 10046 bytes; SHA256 9595b4bb7ceb6bcc77c8368d4355dc2003e353c8b64f694ad233936e3312601d
