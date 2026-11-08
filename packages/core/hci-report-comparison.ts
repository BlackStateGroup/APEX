/** Bounded, explicit offline comparison. No acquisition, pairing or inference. */
import { HCI_LEGACY_DOCUMENT_LIMIT, parseHciLegacyEventDocument, readHciLegacyEventDocument } from './hci-offline.ts';

export const HCI_COMPARISON_OUTPUT_LIMIT = 65_536;
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function validateDocument(value: string): void {
  if (typeof value !== 'string' || value.length > HCI_LEGACY_DOCUMENT_LIMIT) throw new Error('Invalid comparison document');
  parseHciLegacyEventDocument(value);
}
function validateIndex(value: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || Object.is(value, -0) || value < 0 || value > 24) throw new Error('Invalid report index');
}
type Opened = Awaited<ReturnType<typeof readHciLegacyEventDocument>>;
function selectedMetadata(opened: Opened, index: number) {
  const report = opened.selection.reports[index]!;
  return {
    context: opened.value.context,
    derivative: {sha256: opened.value.derivative.sha256, byteCount: opened.value.derivative.byteCount,
      verification: opened.verification.derivative},
    sourceReference: {...opened.value.sourceReference, verification: 'UNVERIFIED' as const},
    provenanceVerification: 'operator-declaration' as const,
    reportIndex: index, reportCount: opened.selection.reports.length,
    reportDerivativeOffset: report.reportOffset, dataDerivativeOffset: report.dataOffset,
    eventType: report.eventType, kind: report.kind, addressType: report.addressType,
    addressWireHex: report.addressWireHex, addressDisplay: report.addressDisplay,
    dataLength: report.dataLength, rssiRaw: report.rssiRaw, rssiDbm: report.rssiDbm,
    adInterpretation: {status: report.advertising.status, elementCount: report.advertising.elements.length,
      issueCount: report.advertising.issues.length, paddingBytes: report.advertising.paddingBytes,
      unparsedByteCount: report.advertising.unparsedHex.length / 2},
  };
}
export interface HciReportComparisonRow {
  readonly dataByteOffset: number;
  readonly leftHex: string | null; readonly rightHex: string | null;
  readonly leftDerivativeOffset: number | null; readonly rightDerivativeOffset: number | null;
  readonly relation: 'equal' | 'different' | 'left-only' | 'right-only';
}
/** All primitive validation occurs before the first await. Both whole events must
 * pass verification before resolving either explicit report index. Hash adapters
 * receive isolated copies through the existing selected-document reader. */
export async function compareHciLegacyReportBytes(
  leftDocument: string, leftReportIndex: number, rightDocument: string, rightReportIndex: number,
  hash: (bytes: Uint8Array) => Promise<string>,
) {
  validateDocument(leftDocument); validateDocument(rightDocument);
  validateIndex(leftReportIndex); validateIndex(rightReportIndex);
  if (typeof hash !== 'function') throw new Error('Byte SHA-256 adapter required');
  const leftOpened = await readHciLegacyEventDocument(leftDocument, hash);
  const rightOpened = await readHciLegacyEventDocument(rightDocument, hash);
  const leftReport = leftOpened.selection.reports[leftReportIndex];
  const rightReport = rightOpened.selection.reports[rightReportIndex];
  if (!leftReport || !rightReport) throw new Error('Selected report does not exist');
  const left = selectedMetadata(leftOpened, leftReportIndex), right = selectedMetadata(rightOpened, rightReportIndex);
  const rows: HciReportComparisonRow[] = [];
  for (let offset = 0; offset < Math.max(left.dataLength, right.dataLength); offset++) {
    const leftHex = offset < left.dataLength ? leftReport.dataHex.slice(offset * 2, offset * 2 + 2) : null;
    const rightHex = offset < right.dataLength ? rightReport.dataHex.slice(offset * 2, offset * 2 + 2) : null;
    rows.push({dataByteOffset: offset, leftHex, rightHex,
      leftDerivativeOffset: leftHex === null ? null : left.dataDerivativeOffset + offset,
      rightDerivativeOffset: rightHex === null ? null : right.dataDerivativeOffset + offset,
      relation: leftHex === null ? 'right-only' : rightHex === null ? 'left-only' : leftHex === rightHex ? 'equal' : 'different'});
  }
  const differingOffsets = rows.filter(row => row.relation !== 'equal').map(row => row.dataByteOffset);
  return freeze({schemaVersion: 1 as const, analysis: 'offline-hci-selected-report-byte-comparison' as const,
    left, right,
    metadataEquality: {eventType: left.eventType === right.eventType, kind: left.kind === right.kind,
      addressType: left.addressType === right.addressType, addressWireHex: left.addressWireHex === right.addressWireHex},
    dataBytesEqual: differingOffsets.length === 0, differingOffsets, rows,
    warnings: [
      'Explicit selected-report byte comparison only. Different event types, addresses, address types and scan responses are allowed; inspect metadataEquality before interpreting rows. These booleans compare supplied fields, not sender or device identity.',
      'Offsets start at zero in the ENTIRE selected advertising data, including AD length/type headers and UUID bytes. Derivative offsets start at byte zero of the decoded single-record btsnoop derivative, not JSON or original capture coordinates. No alignment search, insertion/deletion inference, pooling or scan-response concatenation.',
      'Derivative SHA-256 and whole-event framing are verified using a trusted injected hash adapter. Original source references are UNVERIFIED; provenance, labels and timestamps are unverified declarations. No acquisition, authenticity, completeness, control or physical reception is established.',
      'Identical documents and empty data are allowed. Equality does not establish independent observations, statistical significance, sensor truth, decryption or command capability.',
      'AD interpretation status is separate from byte equality. Unknown, encrypted and malformed content remains opaque even when bytes differ. No service values or field meanings are inferred by this comparison.',
    ],
  });
}
export type HciReportComparisonResult = Awaited<ReturnType<typeof compareHciLegacyReportBytes>>;
export function serializeHciReportComparison(result: HciReportComparisonResult): string {
  const output = JSON.stringify(result, null, 2);
  if (new TextEncoder().encode(output + '\n').length > HCI_COMPARISON_OUTPUT_LIMIT) throw new Error('Comparison output limit');
  return output;
}
