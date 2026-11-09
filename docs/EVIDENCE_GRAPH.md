# Local research evidence graph

This additive, offline capability connects device handles, experiments, recording
artifact references and hypotheses. It supplies a strict parser, immutable graph
report and a selected-file CLI. It does not change the app, journal, APEX Learn,
REA, native bridges, firmware or hardware behavior.

## Run the synthetic example

With the repository's supported Node 24 runtime:

```sh
node tools/validate-evidence-graph.ts tests/fixtures/evidence-graph.json
node --test tests/evidence-graph.test.ts
```

The fixture is entirely synthetic. Its repeated-letter digests are illustrative
declarations, not hashes of included recordings. The report links one supporting
discovery example and one contradicting designated held-out example to a proposed
temperature interpretation. It keeps the contradiction visible and leaves the
operator's 0.6 score unchanged. No decoder or hardware validation is implied.

The CLI reads one explicitly selected regular file, rejects invalid UTF-8 and
oversized input, prints the full report to stdout and returns a nonzero status on
rejection. It does not traverse directories, fetch artifacts, execute a target,
contact a provider, write to the input file or persist anything. Shell redirection
can save the result when the operator chooses it. Treat labels, methods and
statements as untrusted plain text, never executable code or markup.

## Schema version 1

The document contains exactly `schemaVersion`, `devices`, `experiments`,
`recordings` and `hypotheses`. The fixture is a complete schema example.

- A **device** has an opaque, globally unique `id`, a display `label` and a
  declared `scope`. Two equal labels never merge devices. A handle is not a
  permanent physical identity, serial number, authenticated peer or permission.
- An **experiment** has an `id`, falsifiable `question`, declared `method` and
  `deviceIds`. The graph records that plan; it does not run the experiment or
  attest that the method was followed.
- A **recording** has an `id`, `label`, `experimentId`, `deviceId`, `origin` and
  `artifact`. Origin is `synthetic-fixture`, `user-supplied` or `native-capture`.
  The artifact includes lowercase `sha256`, `byteLength` and a `format` label.
  These are declarations, not verified bytes. Paths, URLs and executable content
  fields are intentionally absent. Recording devices must belong to their
  referenced experiment.
- A **hypothesis** has an `id`, `statement`, explicit `deviceIds` and
  `experimentIds`, `confidence` and `evidence`. Confidence has `value` (null or
  0–1), `source` (`operator-declared` or `model-declared`) and `rationale`.
  Evidence links name a `recordingId`, `relation` (`supports`, `contradicts`,
  `inconclusive`) and designated `subset` (`discovery`, `held-out`,
  `unspecified`). Each linked recording must belong to the hypothesis's declared
  device and experiment scope. Hypotheses may be recorded before evidence exists.

Each recording can occur once per hypothesis. IDs are unique across every node
kind. All references must exist and have the expected kind. Duplicate JSON member
names, missing or additional fields, invalid declarations and conflicting byte
lengths for the same declared digest reject the entire document. Input objects
cannot bypass JSON validation. Results and their nested arrays/objects are frozen.

Limits: 262,144 UTF-16 code units, JSON depth 5, 256 total nodes, 1,024 total
references, 32 device/experiment references per list and 64 evidence links per
hypothesis. IDs are 1–80 ASCII letters/digits/`_.:-`, beginning with a letter or
digit. Labels, questions, methods and rationales have separate bounded lengths
and reject control characters. Declared byte length ranges from zero to 1 GiB;
no recording bytes are loaded. The CLI additionally bounds file bytes before
decoding. These bounds limit graph processing, not physical capture sizes.

## Report and confidence boundaries

`analyzeEvidenceGraph(document)` returns the parsed graph, typed directed `edges`
and one evidence summary per hypothesis. Device/experiment relationships,
recording provenance and support/contradiction links are explicit and reversible
to the input IDs. Input list order is preserved for deterministic replay.

The report always says:

- `identityStatus: not-authenticated`
- `artifactIntegrity: not-verified`
- `sampleIndependence: not-established`
- Hypothesis `status: hypothesis` and `confidenceCalibration: not-established`

No graph relationship, confidence number, native-origin label, digest or quantity
of links changes these statements. There is no confidence propagation, automatic
acceptance, inference of ownership/authorization or transport/provider access.

Recording references with the same declared digest are grouped for each
hypothesis. Re-labeling a copy cannot inflate distinct-artifact support counts.
The report separately flags repeated content, discovery/held-out content overlap,
multiple interpretations and conflicting origin labels. Supporting, contradicting
and inconclusive counts may overlap: one content group can contain several
interpretations. Counts are not independent sample sizes or probabilities.

A different digest is not proof of an independent sample. A designated held-out
label is not proof of blinding, unseen data, a frozen decoder or ground truth.
The graph does not inspect actual recording bytes, authenticate their producer,
check sensor calibration, verify a model's rationale or measure physical success.
Existing format-specific verification remains a separate step before an adapter
may claim anything stronger. There is deliberately no import shortcut that can
mark this graph's declarations as verified.

## Integration seam and next steps

The module uses only the existing bounded JSON parser and standard TypeScript.
It accepts no filesystem, network, provider or hardware object. Existing workflows
can construct a document from explicitly selected records, retaining source
digests and declarations, then render the report. This release does not implement
that app/journal integration, a visual editor, durable storage or migration.
Exporting a document is a separate user action; review potentially identifying
labels and notes before sharing. All public examples here are synthetic.

The design follows the repository's
[research record template](vision/RESEARCH_PROGRAMME.md#2-research-record-template)
and [research-to-capability workflow](vision/PRODUCT_VISION.md#4-complete-workflows).
It makes negative evidence and uncertainty navigable rather than treating a
connected graph as authentication or proof of a physical outcome.
