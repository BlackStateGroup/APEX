/** Independent, offline btsnoop v1/H4 subset. See docs/HCI_OFFLINE.md. */
import { parseBoundedJson } from './bounded-json.ts';
import { parseBleAdvertisingHex, interpretBleServiceData } from './ble-advertisements.ts';
export const HCI_SOURCE_LIMIT = 262_144;
export const HCI_RECORD_LIMIT = 4096;
export const HCI_PAGE_LIMIT = 64;
export const HCI_OUTPUT_LIMIT = 1_048_576;
/** Standalone disclosures accompany every metadata page and selected-event report. */
const HCI_DISCLOSURES = Object.freeze([
  'Operator-supplied offline host/controller bytes, not physical RF samples.',
  'No guarantee of capture completeness, authenticity, ownership, or device identity.',
  'SHA-256 identifies the supplied byte content: digest equality establishes byte equality only, not authenticated origin, truthful capture history, ownership, receiver identity, physical reception, or device identity.',
  'Raw signed timestamps are producer-declared claims; no wall-clock conversion.',
  'Zero cumulative drops does not establish absence of losses.',
  'Resolved identity addresses are not necessarily the actual over-air addresses.',
  'Scan responses remain separate from advertisements; no address pooling or concatenation.',
  'Extended advertising is uninspected; no fragment reassembly. Other unsupported payloads remain opaque.',
]);
export interface HciContext { provenance: 'synthetic-fixture' | 'recorded-import'; label: string; }
export interface HciRecord {
  readonly index: number; readonly offset: number; readonly payloadOffset: number;
  readonly originalLength: number; readonly includedLength: number; readonly flags: number;
  readonly cumulativeDrops: number; readonly timestampRaw: string;
  readonly captureTruncated: boolean; readonly classification: string; readonly flagStatus: string;
}
export interface PreparedHci {
  readonly format: 'btsnoop-v1-h4'; readonly source: Readonly<HciContext & { sha256: string; byteCount: number }>;
  readonly recordCount: number;
}
const originals = new WeakMap<PreparedHci, { bytes: Uint8Array; records: readonly HciRecord[] }>();
function fail(reason: string, offset = 0): never { throw new Error(`HCI import refused: ${reason} at offset ${offset}`); }
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const viewTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const viewSize = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const viewBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const viewOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const bufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function snapshot(input: Uint8Array, max: number, min: number): Uint8Array {
  if (!(input instanceof Uint8Array)) fail('byte input size/type');
  // Intrinsic accessors ignore subclass/own-property claims and reject proxy views.
  let size: number; let offset: number; let buffer: ArrayBuffer;
  try {
    if (viewTag.call(input) !== 'Uint8Array') fail('byte input size/type');
    size = viewSize.call(input); buffer = viewBuffer.call(input); offset = viewOffset.call(input);
    // This intrinsic also rejects shared storage, regardless of a shadowed buffer property.
    bufferSize.call(buffer);
    if (bufferResizable?.call(buffer)) fail('resizable input buffers');
  } catch { fail('unsupported input buffer/view'); }
  if (size < min || size > max) fail('byte input size/type');
  return new Uint8Array(new Uint8Array(buffer, offset, size));
}
function contextSnapshot(input: HciContext): Readonly<HciContext> {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) fail('context type');
  const copy: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !['label', 'provenance'].includes(key)) fail('context field');
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !Object.hasOwn(d, 'value')) fail('context requires own data');
    copy[key] = d.value;
  }
  if (typeof copy.label !== 'string' || copy.label.length < 1 || copy.label.length > 256 || /[\u0000-\u001f\u007f]/.test(copy.label)) fail('context label');
  if (copy.provenance !== 'synthetic-fixture' && copy.provenance !== 'recorded-import') fail('context provenance');
  return freeze(copy as unknown as HciContext);
}
export async function prepareHci(input: Uint8Array, context: HciContext, hash: (bytes: Uint8Array) => Promise<string>): Promise<PreparedHci> {
  const bytes = snapshot(input, HCI_SOURCE_LIMIT, 16);
  const ctx = contextSnapshot(context);
  const view = new DataView(bytes.buffer);
  if ([98,116,115,110,111,111,112,0].some((b,i) => bytes[i] !== b)) fail('magic');
  if (view.getUint32(8) !== 1 || view.getUint32(12) !== 1002) fail('requires version 1 and H4 datalink 1002', 8);
  const records: HciRecord[] = [];
  let offset = 16;
  while (offset < bytes.length) {
    if (records.length >= HCI_RECORD_LIMIT) fail('record limit', offset);
    if (bytes.length - offset < 24) fail('incomplete record header', offset);
    const originalLength = view.getUint32(offset), includedLength = view.getUint32(offset + 4);
    const payloadOffset = offset + 24, flags = view.getUint32(offset + 8);
    if (includedLength > originalLength || includedLength > bytes.length - payloadOffset) fail('record bounds', offset);
    const type = includedLength ? bytes[payloadOffset] : undefined;
    let classification = ({1:'command-opaque',2:'acl-opaque',3:'sco-opaque',4:'event-opaque',5:'iso-opaque'} as Record<number,string>)[type ?? 0] ?? 'unknown-opaque';
    const captureTruncated = includedLength < originalLength;
    // Labels only: no opaque payload or event contents are returned.
    if (!captureTruncated && type === 4 && includedLength >= 4 && bytes[payloadOffset + 1] === 0x3e) {
      if (bytes[payloadOffset + 3] === 2) classification = 'legacy-advertising-candidate';
      if (bytes[payloadOffset + 3] === 13) classification = 'extended-advertising-uninspected';
    }
    const expectedFlags = type === 4 ? 3 : type === 1 ? 2 : undefined;
    const flagStatus = flags > 3 ? 'reserved-bits' : expectedFlags !== undefined ? (flags === expectedFlags ? 'consistent-not-verified' : 'contradictory') : (type === undefined || type < 2 || type > 5 ? 'uninspected' : (flags & 2) ? 'contradictory' : 'consistent-not-verified');
    records.push(freeze({index: records.length, offset, payloadOffset, originalLength, includedLength, flags,
      cumulativeDrops: view.getUint32(offset + 12), timestampRaw: view.getBigInt64(offset + 16).toString(), captureTruncated, classification, flagStatus}));
    offset = payloadOffset + includedLength;
  }
  const sha256 = await hash(new Uint8Array(bytes));
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) fail('SHA-256 result');
  const prepared = freeze({format: 'btsnoop-v1-h4' as const, source: {...ctx, sha256, byteCount: bytes.length}, recordCount: records.length});
  originals.set(prepared, {bytes, records: Object.freeze(records)});
  return prepared;
}
function original(prepared: PreparedHci) { const data = originals.get(prepared); if (!data) fail('unrecognized prepared object'); return data; }
export function listHciRecords(prepared: PreparedHci, start = 0, count = HCI_PAGE_LIMIT) {
  const {records} = original(prepared);
  if (!Number.isSafeInteger(start) || start < 0 || start > records.length || !Number.isSafeInteger(count) || count < 1 || count > HCI_PAGE_LIMIT) fail('page bounds');
  const next = Math.min(start + count, records.length);
  return freeze({source: prepared.source, recordCount: records.length, start, nextStart: next < records.length ? next : null,
    warnings: HCI_DISCLOSURES, records: records.slice(start, next)});
}
function hex(bytes: Uint8Array): string { return Array.from(bytes, b => b.toString(16).padStart(2,'0')).join(''); }
export function selectHciLegacyEvent(prepared: PreparedHci, index: number) {
  const {bytes, records} = original(prepared);
  if (!Number.isSafeInteger(index) || index < 0 || index >= records.length) fail('record selection');
  const record = records[index]!; const p = record.payloadOffset, end = p + record.includedLength;
  if (record.captureTruncated || record.classification !== 'legacy-advertising-candidate' || record.flags !== 3) fail('selection requires complete legacy event with flags 3', record.offset);
  if (record.includedLength !== 3 + bytes[p + 2]! || record.includedLength < 5) fail('event length', p);
  const count = bytes[p + 4]!;
  if (count < 1 || count > 25) fail('report count', p + 4);
  let cursor = p + 5;
  const reports = [];
  for (let i = 0; i < count; i++) {
    if (end - cursor < 10) fail('report bounds', cursor);
    const reportOffset = cursor, eventType = bytes[cursor]!, addressType = bytes[cursor + 1]!;
    const address = bytes.slice(cursor + 2, cursor + 8), length = bytes[cursor + 8]!;
    if (eventType > 4 || addressType > 3 || length > 31) fail('unsupported report semantics', cursor);
    const dataOffset = cursor + 9;
    if (length + 1 > end - dataOffset) fail('report data bounds', dataOffset);
    const rssiRaw = bytes[dataOffset + length]!, signed = rssiRaw > 127 ? rssiRaw - 256 : rssiRaw;
    if (rssiRaw !== 127 && (signed < -127 || signed > 20)) fail('unsupported RSSI', dataOffset + length);
    const dataHex = hex(bytes.slice(dataOffset, dataOffset + length));
    const advertising = parseBleAdvertisingHex(dataHex);
    const serviceReadings = advertising.elements.flatMap(e => e.value.kind === 'service-data' ? [{elementOffset: e.offset, reading: interpretBleServiceData(e.value.uuid, e.value.payloadHex)}] : []);
    reports.push({index: i, reportOffset, eventType, kind: eventType === 4 ? 'scan-response' : 'advertisement', addressType,
      addressWireHex: hex(address), addressDisplay: Array.from(address).reverse().map(b => b.toString(16).padStart(2,'0')).join(':').toUpperCase(),
      dataOffset, dataLength: length, dataHex, rssiRaw, rssiDbm: rssiRaw === 127 ? null : signed, advertising, serviceReadings});
    cursor = dataOffset + length + 1;
  }
  if (cursor !== end) fail('trailing event bytes', cursor);
  return freeze({source: prepared.source, sourceKind: 'offline-hci-legacy-advertising-event', warnings: HCI_DISCLOSURES, record, reports});
}
/** Structural metadata only. No advertising-data bytes escape this selector. */
export function selectHciExtendedMetadata(prepared: PreparedHci, index: number) {
  const {bytes, records} = original(prepared);
  if (!Number.isSafeInteger(index) || index < 0 || index >= records.length) fail('record selection');
  const record = records[index]!, p = record.payloadOffset, end = p + record.includedLength;
  if (record.captureTruncated || record.classification !== 'extended-advertising-uninspected' || record.flags !== 3) fail('selection requires complete extended event with flags 3', record.offset);
  if (record.includedLength < 5 || record.includedLength !== 3 + bytes[p + 2]!) fail('event length', p + 2);
  const count = bytes[p + 4]!;
  if (count < 1 || count > 10) fail('extended report count', p + 4);
  // Validate the entire event before interpreting or constructing any report.
  const offsets: number[] = [];
  let cursor = p + 5;
  for (let i = 0; i < count; i++) {
    if (end - cursor < 24) fail('extended report bounds', cursor);
    const length = bytes[cursor + 23]!;
    if (length > 229) fail('extended data length', cursor + 23);
    if (length > end - cursor - 24) fail('extended data bounds', cursor + 24);
    offsets.push(cursor); cursor += 24 + length;
  }
  if (cursor !== end) fail('trailing event bytes', cursor);
  type State = 'known' | 'unavailable' | 'inapplicable' | 'reserved' | 'feature-context-unknown' | 'contradictory';
  function scalar(offset: number, length: number, state: State, meaning: string, value?: number) {
    const raw = bytes[offset]! + (length === 2 ? bytes[offset + 1]! * 256 : 0);
    return {offset, length, raw, state, meaning, ...(value === undefined ? {} : {value})};
  }
  function phy(offset: number, secondary: boolean) {
    const raw = bytes[offset]!;
    if (secondary && raw === 0) return scalar(offset, 1, 'inapplicable', 'No secondary packets');
    if (raw === 1 || (secondary && raw === 2)) return scalar(offset, 1, 'known', raw === 1 ? 'LE 1M' : 'LE 2M');
    if (raw === 3 || raw === 4) return scalar(offset, 1, 'feature-context-unknown', raw === 3
      ? 'LE Coded: unspecified coding without Advertising Coding Selection Host Support; S=8 with that support'
      : 'S=2 only with Advertising Coding Selection Host Support; otherwise reserved');
    return scalar(offset, 1, 'reserved', 'Reserved PHY');
  }
  function power(offset: number, meaning: string) {
    const raw = bytes[offset]!, signed = raw > 127 ? raw - 256 : raw;
    return raw === 127 ? scalar(offset, 1, 'unavailable', meaning) : signed >= -127 && signed <= 20
      ? scalar(offset, 1, 'known', meaning, signed) : scalar(offset, 1, 'reserved', meaning);
  }
  function address(offset: number, actionable: boolean) {
    const span = {offset, length: 6};
    // Ignored, anonymous and reserved address storage has no address interpretation.
    if (!actionable) return span;
    const octets = bytes.slice(offset, offset + 6);
    return {...span, wireHex: hex(octets), display: Array.from(octets).reverse().map(b => b.toString(16).padStart(2,'0')).join(':').toUpperCase()};
  }
  const reports = offsets.map((offset, index) => {
    const event = bytes[offset]! + bytes[offset + 1]! * 256;
    const legacy = Boolean(event & 16), directed = Boolean(event & 4), status = (event >> 5) & 3;
    const legacyContradiction = legacy && (![0x13,0x15,0x12,0x10,0x1b,0x1a].includes(event) || bytes[offset + 9] !== 1 || bytes[offset + 10] !== 0);
    const advertiserType = bytes[offset + 2]!, directType = bytes[offset + 16]!;
    const advertiserMeanings = ['Public address','Random address','Resolved public identity address','Resolved static random identity address'];
    const directMeanings: Record<number,string> = {0:'Public address',1:'Non-resolvable private or static address',
      2:'Controller-resolved target: TargetA or corresponding scanner address, depending on scanner Own_Address_Type (public context)',
      3:'Controller-resolved target: TargetA or corresponding scanner address, depending on scanner Own_Address_Type (random context)',
      254:'Unresolved resolvable private target address'};
    const sid = bytes[offset + 11]!, interval = bytes[offset + 14]! + bytes[offset + 15]! * 256;
    return {index, reportOffset: offset, reportLength: 24 + bytes[offset + 23]!,
      eventType: {...scalar(offset, 2, legacyContradiction ? 'contradictory' : event & 0xff80 ? 'reserved' : 'known',
        'Flags describe the original advertisement, including on scan responses; no exhaustive nonlegacy legality check'),
        connectable: Boolean(event & 1), scannable: Boolean(event & 2), directed,
        scanResponse: Boolean(event & 8), legacy, reservedBits: event & 0xff80},
      dataStatus: {offset, length: 2, raw: status, mask: 0x60, shift: 5,
        state: status === 3 ? 'reserved' : 'known', meaning: ['Terminal complete (may be the last fragment only)', 'More fragments pending', 'Terminal truncated', 'Reserved data status'][status]},
      advertiserType: scalar(offset + 2, 1, advertiserType <= 3 ? 'known' : advertiserType === 255 ? 'unavailable' : 'reserved',
        advertiserMeanings[advertiserType] ?? (advertiserType === 255 ? 'Anonymous; no address' : 'Reserved address type')),
      advertiserAddress: address(offset + 3, advertiserType <= 3),
      primaryPhy: phy(offset + 9, false), secondaryPhy: phy(offset + 10, true),
      sid: scalar(offset + 11, 1, sid <= 15 ? 'known' : sid === 255 ? 'unavailable' : 'reserved', sid === 255 ? 'No ADI' : 'Advertising SID'),
      txPower: power(offset + 12, 'dBm; latest applicable TxPower-bearing packet, not an RF sample'),
      rssi: power(offset + 13, 'dBm; last packet, not an RF sample'),
      periodicInterval: scalar(offset + 14, 2, interval === 0 ? 'inapplicable' : interval < 6 ? 'reserved' : 'known',
        interval === 0 ? 'No periodic advertising' : 'Milliseconds (raw units of 1.25 ms)', interval >= 6 ? interval * 1.25 : undefined),
      directType: scalar(offset + 16, 1, !directed ? 'inapplicable' : directType === 2 || directType === 3 ? 'feature-context-unknown' : directMeanings[directType] ? 'known' : 'reserved',
        !directed ? 'Ignored because directed flag is clear' : directMeanings[directType] ?? 'Reserved directed address type'),
      directAddress: address(offset + 17, directed && Object.hasOwn(directMeanings, directType)),
      dataOffset: offset + 24, dataLength: bytes[offset + 23]!, dataLengthOffset: offset + 23,
      diagnostics: legacyContradiction ? [{state: 'contradictory', offset, meaning: 'Legacy event type or primary/secondary PHY combination contradicts legacy reporting constraints'}] : [],
    };
  });
  return freeze({source: prepared.source, sourceKind: 'offline-hci-extended-advertising-metadata', record, reports,
    warnings: [...HCI_DISCLOSURES.slice(0, -1),
      'Extended metadata only: advertising data is neither returned nor interpreted. No fragment pooling or reassembly; terminal complete can mean only the last fragment, not a whole advertisement. Other unsupported payloads remain opaque.',
      'Structural validation is not full semantic validity. Controller feature and scanner configuration context is unknown; metadata is neither authenticated nor a physical RF measurement.']});
}

export function serializeHciReport(report: ReturnType<typeof listHciRecords> | ReturnType<typeof selectHciLegacyEvent> | ReturnType<typeof selectHciExtendedMetadata>): string {
  const output = JSON.stringify(report, null, 2);
  if (new TextEncoder().encode(output + '\n').length > HCI_OUTPUT_LIMIT) fail('output limit');
  return output;
}

/** Explicit opt-in only: retains the WHOLE selected event, not just one advertiser. */
export const HCI_LEGACY_DOCUMENT_LIMIT = 4096;
export interface HciLegacyEventDocument {
  readonly schemaVersion: 1;
  readonly format: 'APEX-HCI-selected-legacy-event';
  readonly sourceKind: 'offline-hci-legacy-advertising-event';
  readonly representation: 'btsnoop-v1-h4-single-record-derivative';
  readonly context: Readonly<HciContext>;
  readonly sourceReference: Readonly<{sha256: string; byteCount: number; recordIndex: number; recordOffset: number}>;
  readonly derivative: Readonly<{fileHeaderHex: string; recordHex: string; byteCount: number; sha256: string}>;
}
const SELECTED_DISCLOSURES = Object.freeze([
  'Derivative SHA-256 covers decoded binary file header plus selected record, not JSON, hex text, or the original full capture. The injected hash adapter is trusted; output shape does not establish its honesty.',
  'Original source hash, size, index and offset are UNVERIFIED references on reopen. Plausible references are not authenticated or checked against an original capture.',
  'Operator provenance is a declaration. Labels do not establish SDK or native acquisition provenance.',
  'Neither digest establishes acquisition, authentication, ownership, receiver identity, physical reception, device identity, completeness, or truthful timing.',
  'The whole selected event may contain several advertisers and arbitrary vendor identifiers or sensitive content. Only unrelated records are excluded.',
  'Reports and offsets are recomputed in single-record derivative coordinates. No pooling, scan-response concatenation, extended export or reassembly.',
]);
function exactDocumentObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('selected document object');
  const names = Object.keys(value);
  if (names.length !== keys.length || names.some(key => !keys.includes(key))) fail('selected document fields');
  return value as Record<string, unknown>;
}
function documentInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) fail('selected document integer');
  return value;
}
function documentDigest(value: unknown): void {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('selected document digest');
}
/** Structural schema, bounds and reference plausibility only. Does NOT verify the
 * binary digest or complete legacy framing; use readHciLegacyEventDocument for that. */
export function parseHciLegacyEventDocument(document: string): HciLegacyEventDocument {
  const value = exactDocumentObject(parseBoundedJson(document, HCI_LEGACY_DOCUMENT_LIMIT, 2),
    ['schemaVersion','format','sourceKind','representation','context','sourceReference','derivative']);
  if (value.schemaVersion !== 1 || value.format !== 'APEX-HCI-selected-legacy-event' ||
      value.sourceKind !== 'offline-hci-legacy-advertising-event' || value.representation !== 'btsnoop-v1-h4-single-record-derivative') fail('selected document format');
  const context = exactDocumentObject(value.context, ['provenance','label']);
  contextSnapshot(context as unknown as HciContext);
  const source = exactDocumentObject(value.sourceReference, ['sha256','byteCount','recordIndex','recordOffset']);
  documentDigest(source.sha256);
  const sourceSize = documentInteger(source.byteCount, 55, HCI_SOURCE_LIMIT);
  const index = documentInteger(source.recordIndex, 0, HCI_RECORD_LIMIT - 1);
  const offset = documentInteger(source.recordOffset, 16, HCI_SOURCE_LIMIT - 39);
  const derivative = exactDocumentObject(value.derivative, ['fileHeaderHex','recordHex','byteCount','sha256']);
  documentDigest(derivative.sha256);
  if (derivative.fileHeaderHex !== '6274736e6f6f700000000001000003ea') fail('selected document file header');
  const recordHex = derivative.recordHex;
  if (typeof recordHex !== 'string' || !/^(?:[0-9a-f]{2}){39,282}$/.test(recordHex)) fail('selected document record hex');
  const byteCount = documentInteger(derivative.byteCount, 55, 298);
  if (byteCount !== 16 + recordHex.length / 2) fail('selected document byte count');
  const end = offset + recordHex.length / 2, suffix = sourceSize - end;
  if ((index === 0) !== (offset === 16) || offset < 16 + 24 * index || suffix < 0 || (suffix !== 0 && suffix < 24)) fail('selected document source reference plausibility');
  return freeze(value as unknown as HciLegacyEventDocument);
}
/** No public raw-record/range accessor: full legacy validation precedes extraction. */
export async function createHciLegacyEventDocument(prepared: PreparedHci, index: number, hash: (bytes: Uint8Array) => Promise<string>): Promise<string> {
  const selected = selectHciLegacyEvent(prepared, index);
  const {bytes} = original(prepared);
  const header = bytes.slice(0, 16);
  const record = bytes.slice(selected.record.offset, selected.record.payloadOffset + selected.record.includedLength);
  const derivative = new Uint8Array(header.length + record.length);
  derivative.set(header); derivative.set(record, 16);
  const sha256 = await hash(new Uint8Array(derivative));
  documentDigest(sha256);
  const document = JSON.stringify({schemaVersion: 1, format: 'APEX-HCI-selected-legacy-event',
    sourceKind: 'offline-hci-legacy-advertising-event', representation: 'btsnoop-v1-h4-single-record-derivative',
    context: {provenance: prepared.source.provenance, label: prepared.source.label},
    sourceReference: {sha256: prepared.source.sha256, byteCount: prepared.source.byteCount, recordIndex: index, recordOffset: selected.record.offset},
    derivative: {fileHeaderHex: hex(header), recordHex: hex(record), byteCount: derivative.length, sha256}});
  parseHciLegacyEventDocument(document);
  return document;
}
/** No persistence/UI side effects. Exact imported JSON is retained, never rewritten. */
export async function readHciLegacyEventDocument(document: string, hash: (bytes: Uint8Array) => Promise<string>) {
  const value = parseHciLegacyEventDocument(document);
  const binaryHex = value.derivative.fileHeaderHex + value.derivative.recordHex;
  const bytes = Uint8Array.from(binaryHex.match(/../g)!, pair => Number.parseInt(pair, 16));
  const prepared = await prepareHci(bytes, value.context, hash);
  if (prepared.recordCount !== 1 || prepared.source.byteCount !== value.derivative.byteCount || prepared.source.sha256 !== value.derivative.sha256) fail('selected document derivative verification');
  const selection = selectHciLegacyEvent(prepared, 0);
  return freeze({document, value, selection,
    verification: {derivative: 'verified-binary-sha256-and-legacy-structure' as const,
      originalSourceReference: 'UNVERIFIED' as const, provenance: 'operator-declaration' as const}, warnings: SELECTED_DISCLOSURES});
}
