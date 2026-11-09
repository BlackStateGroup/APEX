import React, { useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { HciWorkbenchController, hciExcerpt } from './hci-workbench.ts';
import type { HciWorkbenchState, ExtendedSummary } from './hci-workbench.ts';
import { hciDigest } from './platform/hci-digest';
import { HciInput } from './platform/hci-input';
function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
 return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function HciWorkbench({ active, onDocument }: { active: boolean; onDocument?: (document: string) => void }) {
 const [controller] = useState(() => new HciWorkbenchController(active, hciDigest));
 const [, refresh] = useState(0); const changed = () => refresh(n => n + 1);
 useLayoutEffect(() => { if (active) controller.activate(); else controller.deactivate(); changed(); return () => controller.deactivate(); }, [active, controller]);
 const lease = controller.lease, state = controller.state;
 const act = (action: () => void) => { if (controller.isActive(lease) && state === controller.state) { action(); changed(); } };
 if (!active) return null;
 return <HciWorkbenchView state={state}
 fileInput={<HciInput resetKey={state.inputRevision} sourceCurrent={() => controller.isActive(lease) && state === controller.state}
 onBytes={bytes => act(() => { controller.stageFileBytes(bytes,lease,state); })} />}
 prepareDocument={() => act(() => { void controller.prepareDocument(lease, state).then(() => { if (controller.isActive(lease)) changed(); }); })}
 openDocument={onDocument ? () => act(() => { const document = controller.takeDocument(lease, state); if (document !== null) onDocument(document); }) : undefined} edit={s => act(() => controller.edit(s, lease))} declare={p => act(() => controller.declare(p, lease))}
 example={() => act(() => controller.example(lease))} clear={() => act(() => controller.clear(lease))}
 inspect={() => act(() => { void controller.inspect(lease).then(() => { if (controller.isActive(lease)) changed(); }); })}
 page={n => act(() => controller.page(n, lease, state))} select={n => act(() => controller.select(n, lease, state))} selectExtended={n => act(() => controller.selectExtended(n, lease, state))} extendedPage={n => act(() => controller.extendedPage(n, lease, state))} reportPage={n => act(() => controller.reportPage(n, lease, state))} />;
}
export interface HciWorkbenchViewProps {
 fileInput?: React.ReactNode;
 prepareDocument?: () => void; openDocument?: () => void;
 selectExtended?: (n: number) => void; extendedPage?: (n: number) => void;
 state: HciWorkbenchState; edit: (s: string) => void; declare: (p: 'synthetic-fixture' | 'recorded-import') => void;
 example: () => void; clear: () => void; inspect: () => void; page: (n: number) => void; select: (n: number) => void; reportPage: (n: number) => void;
}
export function HciWorkbenchView({ state, edit, declare, example, clear, inspect, page, select, reportPage, selectExtended, extendedPage, prepareDocument, openDocument, fileInput }: HciWorkbenchViewProps) {
 const metadata = state.metadata;
 return <View style={styles.card}>
 <Text style={styles.heading}>Offline HCI byte inspector</Text>
 <Text style={styles.text}>Memory only. Leaving this inspector or Analysis clears reports but retains draft, declaration and rejected-edit fence. Pending hashing is fenced, not cancelled. Optional native file controls load supplied bytes only after an explicit foreground action. No automatic inspection, persistence, journal save, export, share or device activity.</Text>
 <Text style={styles.text}>Paste strict contiguous ASCII hex for btsnoop v1/H4 bytes: maximum 65536 hex characters / 32768 decoded bytes. No whitespace or normalization. Invalid or oversized edits are rejected whole, retaining the prior draft and blocking Inspect until an accepted replacement or Clear. Odd-length hex may remain while typing, but inspection requires nonempty even-length hex.</Text>
 <Text style={styles.text}>Offline host/controller bytes, not physical RF samples. Provenance is caller-declared, not verified. SHA-256 hashes the exact decoded supplied byte sequence, NOT hex text. It does not guarantee original capture bytes before paste or file selection. Digest equality is byte equality, not authenticated source, truthful capture history, ownership, receiver identity, physical reception or device identity.</Text>
 <Text style={styles.text}>Raw signed timestamps are producer-declared claims, not verified wall-clock time. Zero cumulative drops does not establish no loss. Resolved identity addresses are not necessarily over-air addresses. Scan responses stay separate from advertisements; no address pooling. Unsupported packets and extended advertising data remain opaque; no fragment pooling or reassembly. Extended header metadata requires separate explicit selection.</Text>
 <View style={styles.actions}><Control title="Load synthetic HCI example" onPress={example} /><Control title="Declare synthetic HCI source" onPress={() => declare('synthetic-fixture')} /><Control title="Declare imported HCI source" onPress={() => declare('recorded-import')} /></View>
 <Text style={styles.text}>Declared provenance: {state.provenance ?? 'not selected'}. Example bytes are manually authored, loaded without automatic inspection.</Text>
 {fileInput}
 <TextInput accessibilityLabel="HCI hex draft" multiline autoCapitalize="none" autoCorrect={false} value={state.draft} onChangeText={edit} style={styles.input} />
 <Text style={styles.text}>{state.draft.length} accepted hex characters. Edits and declarations never inspect automatically.</Text>
 <View style={styles.actions}><Control title="Inspect HCI metadata" disabled={state.pending || state.rejectedEdit} onPress={inspect} /><Control title="Clear HCI draft" onPress={clear} /></View>
 <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
 {metadata && <>
 <Text style={styles.heading}>HCI metadata: {metadata.recordCount} records · {metadata.source.byteCount} decoded bytes</Text>
 <Text style={styles.text}>Supplied decoded bytes SHA-256: {metadata.source.sha256}. Declared provenance: {metadata.source.provenance}.</Text>
 <Text style={styles.text}>Metadata page {Math.floor(metadata.start / 4) + 1} of {Math.max(1, Math.ceil(metadata.recordCount / 4))}. Up to four whole record summaries. Candidate classification is not validation. Metadata results do not expose packet addresses or data before explicit selection; the exact supplied draft remains visible in the input.</Text>
 <View style={styles.actions}><Control title="Previous HCI records" disabled={metadata.start === 0} onPress={() => page(metadata.start - 4)} /><Control title="Next HCI records" disabled={metadata.nextStart === null} onPress={() => page(metadata.nextStart!)} /></View>
 {metadata.records.map(r => <View key={r.index} style={styles.record}>
 <Text style={styles.heading}>HCI record {r.index}: {hciExcerpt(r.classification)}</Text>
 <Text style={styles.text}>Record offset {r.offset}; payload offset {r.payloadOffset}; original length {r.originalLength}; included length {r.includedLength}; capture truncated {String(r.captureTruncated)}. Flags {r.flags}: {hciExcerpt(r.flagStatus)}. Declared cumulative drops {r.cumulativeDrops}; raw timestamp {hciExcerpt(r.timestampRaw)}.</Text>
 {r.classification === 'extended-advertising-uninspected' && <Control title={`Select extended HCI metadata ${r.index}`} disabled={!selectExtended} onPress={() => selectExtended?.(r.index)} />}
 {r.classification === 'legacy-advertising-candidate' && <Control title={`Select legacy HCI event ${r.index}`} onPress={() => select(r.index)} />}
 </View>)}
 </>}
 {state.extendedIndex !== null && <>
 <Text style={styles.heading}>Selected extended event {state.extendedIndex}: {state.extendedCount} header reports</Text>
 <Text style={styles.text}>Extended report page {state.extendedPage + 1} of {Math.ceil(state.extendedCount / 4)}. Four reports per page. Header metadata and data spans only: no payload bytes, AD parsing, fragment pooling or reassembly. Terminal complete may be the last fragment only, not a whole advertisement. Structural acceptance is not exhaustive semantic legality. Host-feature and scanner configuration context is unknown. Raw flags describe the original advertisement, including on scan responses. No authentication, physical RF measurement or device identity established.</Text>
 <View style={styles.actions}><Control title="Previous extended reports" disabled={!extendedPage || state.extendedPage === 0} onPress={() => extendedPage?.(state.extendedPage - 1)} /><Control title="Next extended reports" disabled={!extendedPage || (state.extendedPage + 1) * 4 >= state.extendedCount} onPress={() => extendedPage?.(state.extendedPage + 1)} /></View>
 {state.extendedReports.slice(0, 4).map(r => <ExtendedReport key={r.index} report={r} />)}
 </>}
 {state.selectedIndex !== null && <>
 <Text style={styles.text}>Preparing includes the whole event, potentially multiple advertisers and sensitive vendor content. Unrelated records are excluded. No automatic preparation or export.</Text>
 <Control title="Prepare selected event document" disabled={!prepareDocument || state.preparingDocument} onPress={() => prepareDocument?.()} />
 {state.preparedDocument !== null && <Control title="Open prepared HCI document" disabled={!openDocument} onPress={() => openDocument?.()} />}
 <Text style={styles.heading}>Selected legacy event {state.selectedIndex}: {state.reportCount} reports</Text>
 <Text style={styles.text}>Legacy report page {state.reportPage + 1} of {Math.ceil(state.reportCount / 4)}. Four reports per page, separate from metadata pages. AD framing and service interpretation statuses are summarized separately; transport acceptance does not mean payload decoding succeeded.</Text>
 <View style={styles.actions}><Control title="Previous legacy reports" disabled={state.reportPage === 0} onPress={() => reportPage(state.reportPage - 1)} /><Control title="Next legacy reports" disabled={(state.reportPage + 1) * 4 >= state.reportCount} onPress={() => reportPage(state.reportPage + 1)} /></View>
 <LegacyReports reports={state.reports} />
 </>}
 </View>;
}
export function LegacyReports({ reports }: { reports: readonly import('./hci-workbench.ts').LegacySummary[] }) { return <>{/* Bounded, inert summary shared with document reopen. */}{reports.slice(0, 4).map(r => <View key={r.index} style={styles.record}><Text style={styles.heading}>Legacy report {r.index}: {hciExcerpt(r.kind)}</Text>
 <Text style={styles.text}>Report offset {r.reportOffset}; event type {r.eventType}; address type {r.addressType}; wire address {hciExcerpt(r.addressWireHex)}; display address {hciExcerpt(r.addressDisplay)}. RSSI {r.rssiDbm === null ? 'unavailable' : `${r.rssiDbm} dBm`}.</Text>
 <Text style={styles.text}>Data offset {r.dataOffset}; {r.dataLength} bytes; hex {hciExcerpt(r.dataHex)}. AD elements {r.adElements}; service readings {r.serviceReadings}. Strings remain inert text.</Text>
 <Text style={styles.text}>AD framing status {hciExcerpt(r.adStatus)}; issues {r.adIssues}; unparsed bytes {r.adUnparsedBytes}. Service interpretation: format-match {r.serviceMatched}, opaque {r.serviceOpaque}, invalid {r.serviceInvalid}; incomplete or opaque detailed parses {r.serviceIncomplete}. BTHome parse statuses: complete {r.bthomeComplete}, unsupported-object {r.bthomeUnsupported}, malformed {r.bthomeMalformed}, limit-exceeded {r.bthomeLimit}, opaque {r.bthomeOpaque}. A format match is not authentication or verified sensor truth. Unknown/encrypted payloads can remain opaque.</Text></View>)}</>; }
// Exact enum/meaning excerpts, bounded independently of caller input. Current core meanings fit in 192 characters.
const extendedExcerpt = (text: string) => JSON.stringify(text.slice(0, 192)) + (text.length > 192 ? ` [first 192 of ${text.length} characters]` : '');
function HeaderField({ label, field }: { label: string; field: { offset: number; length: number; raw: number; state: string; meaning: string | undefined; value?: number } }) {
 return <Text style={styles.text}>{label}: offset {field.offset}; length {field.length}; raw {field.raw}; state {hciExcerpt(field.state)}; meaning {extendedExcerpt(field.meaning ?? 'Unknown meaning')}{field.value === undefined ? '' : `; value ${field.value}`}.</Text>;
}
function AddressSpan({ label, span }: { label: string; span: { offset: number; length: number; wireHex?: string; display?: string } }) {
 return <Text style={styles.text}>{label}: offset {span.offset}; length {span.length}; {span.display === undefined ? 'no address interpretation' : `wire ${hciExcerpt(span.wireHex!)}; display ${hciExcerpt(span.display)}`}.</Text>;
}
function ExtendedReport({ report: r }: { report: ExtendedSummary }) {
 return <View style={styles.record}>
 <Text style={styles.heading}>Extended report {r.index}: report offset {r.reportOffset}; length {r.reportLength}</Text>
 <HeaderField label="Event type" field={r.eventType} />
 <Text style={styles.text}>Reserved event bits {r.eventType.reservedBits}; connectable {String(r.eventType.connectable)}; scannable {String(r.eventType.scannable)}; directed {String(r.eventType.directed)}; scan response {String(r.eventType.scanResponse)}; legacy {String(r.eventType.legacy)}.</Text>
 <HeaderField label="Data status" field={r.dataStatus} />
 <Text style={styles.text}>Status extraction mask {r.dataStatus.mask}; shift {r.dataStatus.shift}. Data offset {r.dataOffset}; length {r.dataLength}; data-length field offset {r.dataLengthOffset}. Data is not returned or interpreted.</Text>
 <HeaderField label="Advertiser type" field={r.advertiserType} /><AddressSpan label="Advertiser address span" span={r.advertiserAddress} />
 <HeaderField label="Primary PHY" field={r.primaryPhy} /><HeaderField label="Secondary PHY" field={r.secondaryPhy} />
 <HeaderField label="SID" field={r.sid} /><HeaderField label="Tx power" field={r.txPower} /><HeaderField label="RSSI" field={r.rssi} /><HeaderField label="Periodic interval" field={r.periodicInterval} />
 <HeaderField label="Direct address type" field={r.directType} /><AddressSpan label="Direct address span" span={r.directAddress} />
 <Text style={styles.text}>Diagnostics: {r.diagnostics.length}. No diagnostic does not establish full semantic legality.</Text>
 {r.diagnostics.slice(0, 4).map((d, i) => <Text key={i} style={styles.text}>Diagnostic offset {d.offset}; state {hciExcerpt(d.state)}; meaning {extendedExcerpt(d.meaning)}.</Text>)}
 </View>;
}
const styles = StyleSheet.create({
 card: { minWidth: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: '#414c37', borderRadius: 6 },
 record: { minWidth: 0, gap: 8 }, heading: { color: '#d8ff6b', fontSize: 17, fontWeight: '600' },
 text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 },
 input: { minHeight: 140, maxHeight: 300, padding: 12, backgroundColor: '#11170f', color: '#c9d5bc', textAlignVertical: 'top' },
 actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, button: { padding: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 4, maxWidth: '100%' },
});
