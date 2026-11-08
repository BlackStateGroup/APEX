# Offline checkpoint runner review

Original commits 080f8c4, bf92503 and f612b29 are integrated as 7228e95,
2af9ce8 and 1b923d2. Fourteen local runner tests and TypeScript checks pass.
Independent tests cover pending inherited pipes, actual descendants and publication
collisions. The initial synthetic log preserves the missing TERM marker that
revealed premature KILL escalation. The corrected log records the descendant's
TERM marker before cleanup.

Final-result publication now uses an atomic no-replace hard link; existing files,
symlinks and directories survive and prevent publication. The manifest reports
publication failure. This requires local hard-link support and a private stable
output parent. Offline flags are not a network sandbox. The runner is for trusted
local repository/toolchain code, not hostile processes escaping their group.

Raw logs/scripts have .txt appended and are otherwise unchanged; scripts contain
original paths and are not portable test entrypoints. Original and corrected
results remain separate. No full runner invocation occurred in these review
logs; its first combined run is recorded separately under increment17-final.
