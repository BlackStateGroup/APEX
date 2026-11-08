# Flipper offline response inspector research

Research date: 2026-11-08. No implementation, device interaction, outbound command generation, source-register edits, or publication occurred. This is a source-fact research record, not device acceptance.

## Existing provenance recovered

APEX e51750ec0b34b280399877d67e1036058874c373 already recorded protobuf 1c84fa48919cbb71d1cc65236fc0ee36740e24c6 and firmware 9981d9d4aa5ec7b14bb46cf15763dd293a7dec6a. The firmware assets/protobuf submodule independently confirms the exact schema pin. No newer revision was selected. The schema Changelog labels its latest entry 0.25; this is not proof of the version of an imported capture or a connected device.

The omitted original intake document is preserved byte-for-byte as original-FLIPPER_RPC_INTAKE.md. Git blob SHA verified locally: 7a9dfa1be448110186dacfc2cb9207576dff3d23. SHA-256: 5beecec884b7b4f889920d38ca36e5812935ad0ec6fbd66f89cea94b115547aa. It is historical research, not authorization or a new implementation. sources.json lists exact immutable source URLs and Git blob hashes returned by GitHub; these hashes are Git blob SHA-1 identifiers, not SHA-256 checksums. Official source files were read, not vendored.

## Verified wire facts

- Main is proto3: field 1 uint32 command_id, field 2 CommandStatus enum, field 3 bool has_next. These use varint wire type 0. Omitted scalar fields have protobuf defaults: ID 0, status OK=0, has_next false. Absence is not evidence that a device explicitly reported a value.
- Selected nested content uses length-delimited wire type 2: field 33 DeviceInfoResponse, field 40 ProtobufVersionResponse, field 45 PowerInfoResponse. DeviceInfo and PowerInfo each contain string key=1 and value=2. Version contains uint32 major=1 and minor=2.
- Main field 4 is Empty and can carry errors without a response-specific payload. Nonzero statuses must remain errors. ERROR_DECODE=2 explicitly warns that command_id may be wrong. Unknown enum numbers are not success.
- Firmware rpc.c lines 271 and 470/476 use PB_DECODE_DELIMITED and PB_ENCODE_DELIMITED: a protobuf unsigned-varint payload length precedes each Main message. It is not AXP framing, and BLE chunks are not message boundaries.
- Identity and power callbacks set has_next=!last. The final key/value message ends the stream itself. Do not require an extra empty terminal response. Group by ID and response type; preserve ordering and duplicate keys rather than converting directly to an ordinary object.
- Version callback sends has_next=false and build-derived version constants. Offline parsing cannot perform negotiation; retain an observed version response separately from the chosen decoding schema. Never claim hardware compatibility from schema-shaped bytes.
- system.options makes identity/power strings pointers without explicit maximum lengths. Its 1024-byte limit belongs to ping data, not identity strings or a general frame limit.

## Proposed narrow implementation contract (not upstream limits)

The smallest useful increment is a pure offline function over explicitly synthetic/imported response bytes, returning bounded observations and diagnostics. No native adapter, UI transport, serializers, request generation, device discovery, or command execution. Initially accept complete length-delimited input with explicit incomplete-tail diagnostics; split/coalesced fixtures can validate a bounded streaming wrapper later.

Suggested starting policy: maximum 64 KiB aggregate input, 8 KiB frame, 256 frames, 256 fields per message, 1 KiB per key/value UTF-8 byte sequence, and nesting limited to envelope plus selected payload. These are conservative application limits to document and test, not measured device constraints. Reject oversized input before allocating from declared lengths. Bound unknown fields and output diagnostics too.

Validate length/tag overflow and unterminated varints; uint32 known values must fit 32 bits. Generic unknown varints need a ten-byte/64-bit bound with overflow checks. Validate nonzero legal field numbers, expected wire types, all child bounds, exact frame consumption and strict UTF-8. Reject groups and invalid wire types rather than recursing. Unknown wire types 0,1,2,5 may be skipped only with validated lengths; retain tag/offset/length metadata and the bounded original input. Do not interpret unknown content as identity or success.

For a forensic inspector, flag duplicate known scalar tags or multiple content tags as ambiguous rather than silently adopting protobuf last-one-wins behavior. This is an intentionally narrower acceptance policy, not a claim that such encodings are invalid protobuf. Preserve field presence separately from effective defaults. Handle noncanonical varints under a documented diagnostic/rejection policy. Treat empty/no-content Main as unsupported, never successful identity. Unknown content together with selected content should not silently upgrade an ambiguous frame to a valid selected response.

At EOF, has_next=true means incomplete. Unexpected ID/type, repeated terminal sequences, errors and unknown status are explicit observations, not merged successful results. No timeouts are meaningful for complete offline bytes; live timeouts, cancellation, correlation and stale responses remain separate future work.

Test omitted defaults, empty strings, valid multiple pairs, final-pair completion, errors with Empty, unknown statuses/fields, duplicate tags/keys, wrong wire types, invalid UTF-8, field-zero, unsupported content, truncated/overlong lengths, numeric overflow, every split boundary, coalesced frames, incomplete continuation, and all budget boundaries. Synthetic fixtures must be labelled synthetic and cannot become physical acceptance evidence.

## Transport boundary

Pinned serial_service.c distinguishes RX write/read (authenticated), TX read/indicate (authenticated), flow-control read/notify (authenticated), and RPC-status read/write/notify (authenticated). Flow-control characteristic is four bytes; firmware applies REVERSE_BYTES_U32 before publication. The source has distinct buffering/replenishment behavior and outgoing fragmentation. serial_profile.c enables bonding. serial_service_uuid.inc defines separate vendor service/characteristics, unrelated to AXP UUIDs. Do not infer pairing, byte order of a platform UUID string, MTU, flow-control implementation, or mobile readiness from this source review alone. No live transport is needed for the offline reader. USB CLI/session entry was not inspected and remains unverified.

## Licensing gate

Firmware LICENSE is GNU GPL version 3 text. Original APEX LICENSING.md classifies R01 as GPL-3.0 family, research-only, requiring file-level review. The exact protobuf tree has no LICENSE or README; inspected schemas have no licensing headers. Current GitHub repository metadata reports license:null, which is corroborating metadata, not legal permission. The separate protobuf repository does not automatically inherit the parent firmware license. Do not vendor schemas, generate/distribute bindings, or copy firmware implementation without resolving applicable rights. Documenting interface facts and independently writing a minimal local offline reader are distinct from copying source; this report makes no blanket distribution/legal-clearance claim.

Any implementation must remain independently written and offline response-only, without source vendoring or generated bindings. Live protocol-version negotiation, mobile BLE/USB transport, actual captures, physical/DIY compatibility and distribution licensing remain open gates.
