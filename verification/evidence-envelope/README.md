# Evidence envelope ambiguity repair

A synthetic envelope with payload keys `frames:999` and `frames:2` passed verification before this change, because JSON.parse retained only the last value before canonical hashing. before-duplicate-reproduction.json records that result. It uses generated synthetic data, not a user's stored record.

The stored envelope reader now uses parseBoundedJson at the existing 16,384-character envelope bound and a ten-container depth bound compatible with the existing canonical payload depth. Duplicate decoded keys are refused, without changing digests, valid evidence, retained source strings or database schema.

Validation: 100/100 focused evidence/workbench tests passed and semantic TypeScript passed. An independent read-only reviewer found no blocking issue and reran the six evidence tests successfully. Cases include duplicate aliases, maximum depth, rejection above that depth and inert duplicate-looking strings. See docs/EVIDENCE_ENVELOPE.md for the canonical digest boundary. No journal data was edited, migrated or deleted; no device or remote action occurred.
