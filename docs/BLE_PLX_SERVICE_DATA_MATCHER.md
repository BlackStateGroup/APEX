# Bounded, source-specific selected-service membership

8 November 2026. Pure offline foundation only. `matchBlePlxSelectedServiceData`
accepts an SDK-shaped callback, an explicit platform, and exactly `FCD2` or `FEAA`.
It does not start scans, change native/runtime scanner behavior, save evidence,
connect, request permissions, transmit, or interpret service payloads.

## Result contract

Every result is a frozen object containing only `status`, `source` and `service`.
It never contains callback references, selected/unrelated bytes, identifiers,
exception messages, names, RSSI or source documents. Invalid caller platform or
service selections throw a fixed configuration error; invalid input data returns
`malformed`.

- `match`: exactly one selected service-data occurrence in valid Android AD,
  or one unambiguous selected entry in a valid iOS normalized dictionary.
- `no-match`: the available, valid selected source contains no selected service
  data. This is source-specific absence, not absence of a nearby transmitter or
  complete capture. Valid empty raw base64 / an empty dictionary returns this.
- `unavailable`: the own source property is missing, undefined or null. Inherited
  properties do not establish availability and are never read.
- `malformed`: present source has invalid encoding, framing, bounds, duplicate
  selected Android payloads, dictionary aliases or unsafe selected-source shapes.
  A valid matching prefix never masks an invalid tail or dictionary entry.

No state establishes identity, physical reception, authenticity, payload validity,
completeness or a protocol/device classification. Empty, encrypted, unknown and
unsupported payloads can match service membership without interpretation.

## Source authority, not fallback

**Android:** only the own `rawScanRecord` data property is inspected. Existing
`decodeBlePlxBase64` and `parseBleAdvertisingHex` check canonical base64 and the
entire AD source, including the existing 1,650-byte and 128-element bounds.
Any parser issue rejects the source, including malformed unrelated known fields.
Only actual service-data elements establish membership, not advertised UUID
lists. Repeated selected UUIDs reject even if bytes agree or use different UUID
widths. Other repeated raw AD elements remain allowed by the existing parser.

The normalized `serviceData` property is deliberately not read on Android. A
normalized match cannot replace absent/invalid/nonmatching raw AD; a normalized
absence cannot veto a raw match. Contradictions are neither reconciled nor
reported. This policy preserves the selected source's semantics and permits
raw-only callbacks. A later evidence-preparation step validates its own broader
selected-field snapshot and may reject a callback that passed this gate.

**iOS:** only the own `serviceData` property is inspected. `rawScanRecord` remains
opaque, not Android AD. An own plain-object dictionary is required; inherited,
null-prototype, array, accessor, symbol and nonenumerable entry shapes reject.
Each key must be a valid bounded UUID and each value canonical bounded base64.
The existing UUID canonicalizer accepts 16/32/128-bit spellings and mixed case.
Any two keys normalizing to the same UUID reject, including unrelated aliases.
All entries are checked before a match returns. No advertised UUID/name/RSSI/ID
field can establish membership.

Limits reuse the adapter's exported 32-entry dictionary cap, its 16,384-character
snapshot budget (sum of dictionary key/value code units here, not a JSON document
size guarantee), and the existing per-value 1,650-byte decoder bound. Each key is
at most 36 characters. Reject, never truncate. `Reflect.ownKeys` necessarily
materializes the supplied dictionary's existing own keys before the count check;
value processing, decoding and result retention are bounded, but this is not a
hard bound on engine enumeration allocations or preexisting callback memory.

## Bridge-data trust boundary and retention

PLX 3.5.1 `src/Device.js:109–111` copies native bridge fields onto a Device class
instance using `Object.assign`. Therefore the callback itself may have a class
prototype; only its own chosen source descriptor is used, never Device methods
or inherited data. Unrelated callback properties are not inspected. The map
must be ordinary bridge data with `Object.prototype`. Relevant accessors are
rejected using descriptors, without invoking getters or custom conversions.
This is **not a sandbox for adversarial proxies**: JavaScript reflection can
invoke proxy traps. Do not pass arbitrary executable objects across this boundary.

No result retains the source, even for a match. The caller may separately invoke
`prepareBlePlxSourceEvidenceInput` with the original callback and explicit
provenance, subject to its existing full validation and 4,096-character document
cap. That stores the selected source, which can contain unrelated bytes from a
matching callback; it is not a redacted chosen-service projection. A match is not
a reusable certificate for a mutable callback. Results cannot change when inputs
mutate, but later preparation must use the intended unchanged source and remains
responsible for validation. No preparation/persistence call is made by this gate.

## Native acquisition remains unresolved

This increment neither starts broad scans nor solves native caching/deadline
control. Existing advertised-UUID scanning can still omit service-data-only
BTHome. See [filter review](BLE_SERVICE_DATA_FILTER_REVIEW.md) for acquisition
alternatives and their unimplemented controls.

Installed exact PLX 3.5.1 sources were read locally, without downloads/install:

- `src/BleManager.js:75–80` returns `sharedInstance` from the constructor;
  `:111` creates the native client only for the first manager.
- `src/BleManager.js:151–165` awaits native destruction before clearing the
  singleton. Two concurrent `new BleManager()` calls do not provide isolation.
- `android/src/main/java/com/bleplx/adapter/BleModule.java:129–154` clears
  `discoveredDevices` through `clearActiveConnections` during `destroyClient`.
  Stopping a scan alone does not establish native cache cleanup.
- `android/src/main/java/com/bleplx/converter/ScanResultToJsObjectConverter.java`
  exposes raw bytes and normalized UUID-to-base64 service data separately.

A future broad session requires exclusive ownership of the existing shared
manager, refusal while accessory connections/operations are active, and verified
successful destruction/recreation under an explicitly designed lifecycle. No
concurrent second manager workaround is valid. Failed or uncertain destruction
must not be reported as cleanup success. JS caps cannot bound allocations/events
before delivery or enforce a hard deadline when JS is blocked; native controls
are needed for those guarantees. Destruction does not prove OS cache deletion.
No native/phone delivery, iOS completeness, RF passivity or lifecycle behavior was
executed or established by these synthetic checks.
