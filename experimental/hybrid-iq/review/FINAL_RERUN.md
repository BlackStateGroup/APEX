# Final author rerun after independent review

The six implementation/helper files were independently reviewed at the hashes in `reviewed-source-sha256.txt`. The kernel, C ABI, host parser, JS contract and ABI test remain unchanged. The reference helper subsequently had only its final extra blank line removed; no numerical statement or import was changed. The proof runner added exact upstream-blob pinning, normalized trailing compiler-output blank lines, and gained a source-only Rust verification mode.

The author reran the unchanged independent test script against the same reviewed native executable after those changes; `final-rerun.txt` preserves its 30-case/259,584-cell PASS. The full optimized/sanitizer reports hash their actual current source inputs. This rerun does not turn the uncompiled Rust wrapper or new Rust-mode runner branch into independently reviewed or executed code.

`failure-controls.mjs` also demonstrated that reversed FFT sign, a finite transform perturbation and pinned reference-source drift are rejected by the relevant numerical/source gates. It mutates temporary copies only; `proof-results/failure-controls.txt` records the result.
