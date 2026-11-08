# Experimental source integration

This directory preserves the source-only archive of the independently reviewed
host experiment. Inclusion in this repository does not replace or import any
production analysis code. Both C++ candidates remain **rejected as drop-in
replacements**: the baseline passes 50/61 strict fixtures and frozen coefficients
pass 52/61. The nine remaining impulse peak disagreements are not waived.

Existing host compiler and sanitizer execution are documented in README.md and
proof-results. No mobile or embedded SDK target was built. LeakSanitizer was
blocked under ptrace; the later ASan/UBSan runs explicitly disabled leak checks.
The preserved MANIFEST.sha256 covers the original archive contents; this scope
note and .gitignore are integration additions, not original experiment evidence.

Run the experiment only from this directory. Its own proof-results outputs are
historical evidence and should not be overwritten when preserving a checkpoint;
copy the source to an isolated directory for a fresh run. Generated host binaries
are excluded. The exact TypeScript copies are reference snapshots, not app code.
