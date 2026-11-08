# Historical foundation restoration

Fifteen README targets absent from the selected local reconstruction at
`27ad6b405d99171224a717474bee1af29b006f18` were restored from
[BlackStateGroup/APEX commit e51750ec0b34b280399877d67e1036058874c373](https://github.com/BlackStateGroup/APEX/tree/e51750ec0b34b280399877d67e1036058874c373).
These were missing from that reconstruction, not deleted upstream.

The [filtered file manifest](FOUNDATION_RESTORATION_MANIFEST.json) records every
restored path, pinned commit, source URL, Git blob SHA-1, SHA-256, byte count and
Git mode. All 15 destinations were checked absent before restoration. The
147,233 original bytes and all `100644` modes were retained exactly; local
independent hashing matched the recovery manifest verified against the complete
upstream tree and file blobs. No original content was rewritten, including
historical wording and whitespace.

These are original design documents and historical capability claims, **not
current continuation acceptance**, proof of physical hardware operation, or a
new implementation. The [console image](images/console.png) is a historical
software-simulator screenshot from the pinned commit, not a screenshot of
current changes. For current evidence and limitations, start with
[APEX_CONTINUATION.md](../APEX_CONTINUATION.md) and the
[continuation validation record](../verification/continuation.json).

The existing [LICENSE.md](../LICENSE.md) is unchanged. The historical LICENSE.md
retrieved for context was not restored or substituted. Restoring the historical
licensing inventory does not change the project's license or establish new
rights in third-party sources. Existing source-copy registers and executable,
core, native and dependency files are unchanged. No restored commands or code
were executed, and no dependencies were installed or remote changes made.

Only these original files, this provenance document, the filtered manifest and
a README clarification are part of this restoration. Raw retrieval responses
are not included.
