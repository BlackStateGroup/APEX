# Offline advertised-service filter diagnostic

This dependency-free explanation runs only on an already validated `BleObservation`, including a reinterpreted record after digest verification. It changes no scanner, permission, source schema, retained document or digest. Both FCD2 and FEAA are shown independently; they are not additional scan selections.

## Source-backed distinction

The [SDK filter review](BLE_SERVICE_DATA_FILTER_REVIEW.md) pins PLX 3.5.1 and RxAndroidBle 1.17.2: PLX supplies `setServiceUuid`, whose list predicate reads service UUIDs, separately from service data. The [pinned parser](https://github.com/dariuszseweryn/RxAndroidBle/blob/release-1.17.2-rxjava2%2Brxjava3/rxandroidble/src/main/java/com/polidea/rxandroidble2/internal/util/ScanRecordParser.java) distinguishes UUID-list AD types 0x02–0x07 from service-data types 0x16/0x20/0x21. The [BTHome format example](https://bthome.io/format/) used by the synthetic demo contains FCD2 service data without a separate UUID list. Therefore the current advertised-UUID filter is not general BTHome discovery.

The helper reuses the bounded offline parser's canonical UUIDs (16-, 32-, and 128-bit Bluetooth representations) and reports two independent facts:

- Service-data field present for the requested UUID, even when its payload is empty or not a supported application format. This is presence, not protocol validity.
- Requested UUID present in a separate Android UUID-list AD field. Names, manufacturer bytes, service solicitation and service-data UUIDs cannot satisfy this fact.

Duplicate valid UUID lists do not change positive membership. A well-formed incomplete-list AD type can establish positive membership. If no match is found and any list is marked incomplete, the list result is `cannot-assess`. Absent matching fields are reported as `not-present-in-supplied-source` only for parsed Android data whose source declares `complete`; that declaration is not verified capture completeness. For unknown/truncated source status, positives in parsed fields remain byte facts, but negatives are `cannot-assess`. Any malformed/limited parse, including an invalid field or unparsed suffix, conservatively makes both checks `cannot-assess`, even if a valid prefix exists. Missing observations and unsupported requested UUIDs also cannot be assessed.

For iOS, service-data presence describes only supplied normalized fields. A missing field is not present in that supplied projection, not proof of on-air absence. Android UUID-list membership always remains `cannot-assess`. iOS service UUID fields are not converted to invented Android bytes. [CoreBluetooth's scan API](https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/scanforperipherals(withservices:options:)) and the pinned forwarding sources in the review do not establish service-data-only matching on every iOS version.

## Limits and verification

Neither outcome predicts actual Android/OS filter delivery, iOS matching, device support, transmitter absence, physical reception, identity or authenticity. A scan response not supplied here may separately announce the service. A positive UUID-list fact is only one predicate, not proof that a callback would arrive. No full-capture claim is made, including for a source declaring complete. The diagnostic always labels platform delivery unverified.

`tests/ble-filter-diagnostic.test.ts` uses only synthetic bytes and covers the canonical service-data-only demo versus an added explicit list; both services; all six list AD types; all three service-data widths; request normalization; duplicates; malformed, incomplete, unknown, truncated and over-limit input; iOS uncertainty; no mutation; and scoped UI wording. The existing browser scenario now asserts display, edit invalidation and verified reopen. That scenario is added but not executed in this offline task. No browser, native build or radio operation is needed or performed.

## Reproducible synthetic comparison fixtures

- [Canonical service-data-only example](../src/fixtures/bthome-observation.json): 26 AD bytes, retaining the original BTHome example unchanged. FCD2 service data is present; no UUID-list entry is supplied.
- [Explicitly announced FCD2 example](../src/fixtures/bthome-explicit-uuid-observation.json): 30 AD bytes, adding `03 03 d2 fc` (length 3, complete 16-bit UUID-list type 0x03, UUID FCD2 little-endian) immediately after Flags. Its distinct provenance remains synthetic, with no capture time.

The explicit variant is `0201060303d2fc0b094449592d73656e736f720a16d2fc4002c40903bf13`. Its four AD elements begin at offsets 0 (Flags), 3 (UUID list), 7 (name) and 19 (service data). Both fixtures decode the same unencrypted BTHome-v2 temperature 25°C and humidity 50.55%. These exact bytes can inform a separately authorized owned-emitter acceptance setup; neither fixture proves phone reception, OS filtering or physical emitter operation. The diagnostic test checks byte counts, offsets, list membership, matching readings and unchanged unverified identity/reception flags.
