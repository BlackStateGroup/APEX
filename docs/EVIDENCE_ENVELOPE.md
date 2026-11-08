# Stored evidence envelope validation

The local journal retains its existing schema, canonical JSON digest format,
source rules and size limits. Stored records now use the shared bounded strict
JSON reader before envelope validation. Duplicate decoded keys are rejected at
any structural level, even if the duplicate values agree or a key is spelled
with JSON escapes. A parser must not silently choose one of conflicting values
before reporting digest verification.

The stored envelope remains limited to 16,384 UTF-16 code units. Its maximum ten
simultaneously open JSON containers is the outer envelope plus the existing
canonical payload limit (depth 0 through 8). The deepest container can be empty;
nonempty child values still follow the original canonical depth check. Existing
valid records, including those at the exact nesting boundary, remain readable.
No stored rows, files or indexes are rewritten or deleted.

Strings are inert values. A payload string that contains duplicate-looking JSON
text is not parsed as envelope structure. Exact BLE/NDEF source-document strings
keep their current independent import validation and digest coverage.

The SHA-256 digest is over the canonical record content, excluding the digest
field. It does not attest to envelope whitespace or JSON key ordering; those
representations can change without changing canonical content. Exact retained
source-document strings are content, so changing their whitespace changes the
digest. The digest is not a signature, authentication, proof of reception or
protection from someone who can rewrite both content and digest. Local storage
remains unencrypted. Malformed records fail reading and remain stored for
recovery; this increment does not add automatic repair or deletion.

A synthetic regression previously verified a document containing conflicting
`frames` keys after the ordinary JSON parser selected the last value. The
reproduction and checks are retained under `verification/evidence-envelope/`.
Tests cover duplicate/escaped aliases at envelope and payload levels, the exact
nesting boundary, ordinary round trips and inert duplicate-looking text. No
native build, phone or real radio evidence was involved.
