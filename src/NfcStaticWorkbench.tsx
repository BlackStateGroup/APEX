import React, { useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NfcStaticWorkbenchController, staticExcerpt } from './nfc-static-workbench.ts';
import type { NfcStaticWorkbenchState, StaticMode, StaticProvenance } from './nfc-static-workbench.ts';
import type { StaticSpan } from '../packages/core/nfc-static-offline.ts';
// Existing adapter hashes exact local bytes; this alias does not invoke the HCI parser.
import { hciDigest as staticByteDigest } from './platform/hci-digest';
function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
 return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function NfcStaticWorkbench({ active }: { active: boolean }) {
 const [controller] = useState(() => new NfcStaticWorkbenchController(active, staticByteDigest));
 const [, refresh] = useState(0); const changed = () => refresh(n => n + 1);
 useLayoutEffect(() => { if (active) controller.activate(); else controller.deactivate(); changed(); return () => controller.deactivate(); }, [active, controller]);
 const lease = controller.lease, state = controller.state;
 const act = (action: () => void) => { if (controller.isActive(lease) && state === controller.state) { action(); changed(); } };
 if (!active) return null;
 return <NfcStaticWorkbenchView state={state} edit={s => act(() => controller.edit(s, lease))} mode={m => act(() => controller.mode(m, lease))} declare={p => act(() => controller.declare(p, lease))}
 example={m => act(() => controller.example(m, lease))} clear={() => act(() => controller.clear(lease))}
 inspect={() => act(() => { void controller.inspect(lease).then(() => { if (controller.isActive(lease)) changed(); }); })}
 page={(kind, n) => act(() => controller.page(kind, n, lease, state))} />;
}
export interface NfcStaticWorkbenchViewProps {
 state: NfcStaticWorkbenchState; edit: (s: string) => void; mode: (m: StaticMode) => void; declare: (p: StaticProvenance) => void;
 example: (m: StaticMode) => void; clear: () => void; inspect: () => void; page: (kind: 'tlvPage' | 'recordPage' | 'issuePage', n: number) => void;
}
const span = (s: StaticSpan) => `data [${s.offset}, ${s.endOffset}); source [${s.sourceOffset}, ${s.sourceEndOffset})`;
export function NfcStaticWorkbenchView({ state, edit, mode, declare, example, clear, inspect, page }: NfcStaticWorkbenchViewProps) {
 const r = state.report, d = r?.ndef.decoder;
 const pager = (kind: 'tlvPage' | 'recordPage' | 'issuePage', count: number, label: string) => <View style={styles.actions}>
  <Text style={styles.text}>{label} page {state[kind] + 1} of {Math.max(1, Math.ceil(count / 4))}; {count} total, up to four rows.</Text>
  <Control title={`Previous static ${label}`} disabled={state[kind] === 0} onPress={() => page(kind, state[kind] - 1)} />
  <Control title={`Next static ${label}`} disabled={(state[kind] + 1) * 4 >= count} onPress={() => page(kind, state[kind] + 1)} />
 </View>;
 return <View style={styles.card}>
 <Text style={styles.heading}>Offline static NFC inspector</Text>
 <Text style={styles.text}>Memory only; host/source-only evidence. No actual tag reads, writes, emulation or replay. Leaving this inspector clears reports, retaining draft, mode, provenance and rejected-edit fence. Pending hashing is fenced, not cancelled.</Text>
 <Text style={styles.text}>APEX profile apex-static-48-v1 only, not generic tag compatibility or current-spec conformance. No identity, licensing, security, ownership, access or unlocking determination. First 12 structure bytes are uninterpreted; UID and lock contents are not displayed in results.</Text>
 <Text style={styles.text}>Select static-data-48 (exactly 96 hex characters) or static-structure-64 (exactly 128). Mode is never inferred from length. Strict contiguous ASCII hex, maximum 128 characters; no whitespace, trimming or truncation. Odd-length drafts may be typed but Inspect refuses them. Invalid or oversized edits are rejected whole, retaining prior draft and blocking Inspect until accepted replacement or Clear.</Text>
 <Text style={styles.text}>Provenance is caller-declared. SHA-256 covers exact decoded supplied bytes, NOT hex text; it does not guarantee the original pre-paste file or capture, ownership, UID, locks or access. The exact input draft is visible below; results omit raw UID, lock, proprietary, trailing and unknown record bytes.</Text>
 <View style={styles.actions}><Control title="Select static-data-48" onPress={() => mode('static-data-48')} /><Control title="Select static-structure-64" onPress={() => mode('static-structure-64')} /></View>
 <View style={styles.actions}><Control title="Declare synthetic static source" onPress={() => declare('synthetic-fixture')} /><Control title="Declare imported static source" onPress={() => declare('recorded-import')} /></View>
 <View style={styles.actions}><Control title="Load synthetic empty data-area example" onPress={() => example('static-data-48')} /><Control title="Load synthetic Text structure example" onPress={() => example('static-structure-64')} /></View>
 <Text style={styles.text}>Selected mode: {state.mode ?? 'not selected'}; provenance: {state.provenance ?? 'not selected'}. Examples are manually authored synthetic bytes, never automatically inspected.</Text>
 <TextInput accessibilityLabel="Static NFC hex draft" multiline autoCapitalize="none" autoCorrect={false} value={state.draft} onChangeText={edit} style={styles.input} />
 <Text style={styles.text}>{state.draft.length} accepted hex characters. Input draft only; no raw byte projection in results.</Text>
 <View style={styles.actions}><Control title="Inspect static NFC" disabled={state.pending || state.rejectedEdit} onPress={inspect} /><Control title="Clear static NFC draft" onPress={clear} /></View>
 <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
 {r && <>
 <Text style={styles.heading}>Static result: {r.profile}; mode {r.source.mode}</Text>
 <Text style={styles.text}>Source: {r.source.byteCount} decoded supplied bytes; SHA-256 {r.source.sha256}; declared provenance {r.source.provenance}. Data area {span(r.dataArea)}. All spans are half-open byte offsets.</Text>
 <Text style={styles.text}>TLV status: {r.tlvStatus}. TLV acceptance is not NDEF success.</Text>
 {r.diagnostic && <Text style={styles.text}>Diagnostic {staticExcerpt(r.diagnostic.code)}; source offset {r.diagnostic.sourceOffset}; data offset {r.diagnostic.offset ?? 'not applicable'}.</Text>}
 {pager('tlvPage', r.elements.length, 'TLVs')}
 {r.elements.slice(state.tlvPage * 4, state.tlvPage * 4 + 4).map((t, i) => <Text key={i} style={styles.text}>TLV {state.tlvPage * 4 + i}: {t.kind}; {span(t)}; value {t.value ? span(t.value) : 'none'}. {t.kind === 'proprietary' ? 'Opaque span only.' : ''}</Text>)}
 <Text style={styles.text}>Trailing: {r.trailing ? `${span(r.trailing)}; opaque span only, not assumed padding` : 'none'}.</Text>
 <Text style={styles.heading}>NDEF handoff: {r.ndef.status === 'decoded' ? 'decoded-handoff' : r.ndef.status}; {r.ndef.count} NDEF TLVs</Text>
 <Text style={styles.text}>Multiple NDEF TLVs are ambiguous for this viewer, not declared invalid Type 2. An empty NDEF TLV contains no message. {r.ndef.value ? `Contained value: ${span(r.ndef.value)}.` : ''}</Text>
 {d && <>
 <Text style={styles.text}>NDEF decoder status: {d.status}; {d.issues.length} issues. Relative NDEF offsets begin at the contained value, not the source. Interpreted Text and URI are quoted inert text only, never links or actions. Unknown record contents remain omitted.</Text>
 {pager('recordPage', d.records.length, 'NDEF records')}
 {d.records.slice(state.recordPage * 4, state.recordPage * 4 + 4).map((v, i) => <View key={i} style={styles.record}>
 <Text style={styles.text}>NDEF record {state.recordPage * 4 + i}: relative NDEF [{v.offset}, {v.endOffset}); data [{v.dataOffset}, {v.dataEndOffset}); source [{v.sourceOffset}, {v.sourceEndOffset}); kind {v.value.kind}.</Text>
 {v.value.kind === 'text' && <Text style={styles.text}>Text {staticExcerpt(v.value.text)}; language {staticExcerpt(v.value.language)}; encoding {v.value.encoding}.</Text>}
 {v.value.kind === 'uri' && <Text style={styles.text}>URI {staticExcerpt(v.value.uri)}; prefix code {v.value.prefixCode}; inert only.</Text>}
 {(v.value.kind === 'opaque' || v.value.kind === 'invalid') && <Text style={styles.text}>Reason {staticExcerpt(v.value.reason)}; contents omitted.</Text>}
 </View>)}
 {pager('issuePage', d.issues.length, 'NDEF issues')}
 {d.issues.slice(state.issuePage * 4, state.issuePage * 4 + 4).map((v, i) => <Text key={i} style={styles.text}>NDEF issue {staticExcerpt(v.code)}; relative NDEF offset {v.offset}; data offset {v.dataOffset}; source offset {v.sourceOffset}.</Text>)}
 </>}
 </>}
 </View>;
}
const styles = StyleSheet.create({
 card: { minWidth: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: '#414c37', borderRadius: 6 },
 record: { minWidth: 0, gap: 8 }, heading: { color: '#d8ff6b', fontSize: 17, fontWeight: '600' },
 text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 },
 input: { minHeight: 100, maxHeight: 200, padding: 12, backgroundColor: '#11170f', color: '#c9d5bc', textAlignVertical: 'top' },
 actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, button: { padding: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 4, maxWidth: '100%' },
});
