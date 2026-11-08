# Offline I/Q implementation validation

Base: fe2c875d0983ff821abe0852dc4ff8837d96b7c9. Node v24.22.1.
The existing approved root and REA dependency installations were reused by local
symlink. No installs, external writes, uploads, browser/native or receiver/device
operations were performed. All generated signal samples are synthetic.

- focused-tests.log: 16 new synthetic/parser/CLI tests pass.
- full-node-tests.log: portable C build/checks and all 250 Node tests pass with
  two test workers (avoids known baseline unconstrained subprocess contention).
- python-tests.log: all 22 source-archive Python tests pass.
- typecheck.log: full semantic TypeScript check passes.
- synthetic-tone-demo.json: output of node tools/demo-iq.ts, containing exact
  synthetic sample and metadata hashes, explicit source classification and
  selected 256-sample periodic-Hann spectrum. A demonstration of digital
  arithmetic, not physical radio reception.

Commands run:

```
node --test tests/iq-offline.test.ts tests/iq-analysis.test.ts tests/inspect-iq.test.ts
npm run typecheck
node tools/demo-iq.ts
npm run firmware:build
node --test --test-concurrency=2 tests/*.test.ts
python3 -m unittest discover -s tests -p 'test_*.py'
```

No UI/export/native/device acceptance or new sanitizer run is claimed. The earlier
full sanitizer gate remains outstanding; sanitizer configuration/assertions were
not changed. Read docs/OFFLINE_IQ_INSPECTION.md for supported profile and limits.
