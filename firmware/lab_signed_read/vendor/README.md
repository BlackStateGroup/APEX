# Pinned signing dependency

Unmodified Monocypher **4.0.2**, upstream commit
`0d85f98c9d9b0227e42cf795cb527dff372b40a4`:
<https://github.com/LoupVaillant/Monocypher/tree/4.0.2>.

`monocypher.c` and `.h` come from `src/`; `monocypher-ed25519.c` and `.h`
come from `src/optional/`. `LICENCE.md` is copied from the repository root.
Upstream offers BSD-2-Clause OR CC0-1.0; these files retain their full notices.
APEX's original source licence is unchanged. `PIN.json` records all five hashes;
the host build checks them before compiling. No dependency download is needed
to build the portable peer.

The peer calls `crypto_ed25519_key_pair` and `crypto_ed25519_sign`, the optional
SHA-512 **pure Ed25519** API compatible with Node/OpenSSL. It does not use the
default BLAKE2b EdDSA API or Ed25519ph. All transcript construction is APEX C code.
Reference: <https://monocypher.org/manual/ed25519>.

This pin and interoperability evidence are not a new cryptographic audit or
physical side-channel assessment. No upstream crypto code was modified.
