#!/usr/bin/env bash
# CI entrypoint. Requires preflight-selected installed tools; installs nothing.
set -euo pipefail
export RUSTUP_AUTO_INSTALL=0 CARGO_NET_OFFLINE=true
cd "$(dirname "$0")"
# Do not let external target-dir settings redirect the known executable path.
unset CARGO_TARGET_DIR
for tool in node g++ ar cargo rustc; do
  command -v "$tool" >/dev/null || { printf 'Missing preinstalled %s\n' "$tool" >&2; exit 1; }
done
node -e 'if(Number(process.versions.node.split(".")[0])!==24)throw new Error("Pinned proof requires Node 24")'
rustc --version
cargo --version
node proof.mjs verify
node proof.mjs sanitize
cargo test --manifest-path rust/Cargo.toml --locked --offline
cargo test --manifest-path rust/Cargo.toml --locked --offline --release
node proof.mjs verify rust
