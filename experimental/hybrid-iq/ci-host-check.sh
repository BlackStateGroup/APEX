#!/usr/bin/env bash
# Proposed CI entrypoint. Requires already-installed tools; installs nothing.
set -euo pipefail
cd "$(dirname "$0")"
command -v node g++ ar cargo rustc
node -e 'if(Number(process.versions.node.split(".")[0])!==24)throw new Error("Pinned proof requires Node 24")'
rustc --version
cargo --version
node proof.mjs verify
node proof.mjs sanitize
cargo test --manifest-path rust/Cargo.toml --locked --offline
cargo test --manifest-path rust/Cargo.toml --locked --offline --release
node proof.mjs verify rust
