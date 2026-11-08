import type { EvidenceStore } from '../packages/core/evidence.ts';
import React, { useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { HciDocumentController } from './hci-document-workbench.ts';
import type { HciDocumentState } from './hci-document-workbench.ts';
import { LegacyReports } from './HciWorkbench.tsx';
import { hciDigest } from './platform/hci-digest';
function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
 return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function HciDocumentWorkbench({ active, selectedSource, store, onSaved, onStage }: { onStage?: (source: { document: string; index: number; side: 'left' | 'right' }) => void; store?: Pick<EvidenceStore, 'save'>; onSaved?: () => Promise<void>; active: boolean; selectedSource?: { id: number; document: string } | null }) {
 const [controller] = useState(() => new HciDocumentController(active, hciDigest));
 const [, refresh] = useState(0); const changed = () => refresh(n => n + 1);
 useLayoutEffect(() => { if (active) controller.activate(); else controller.deactivate(); changed(); return () => controller.deactivate(); }, [active, controller]);
 useLayoutEffect(() => { controller.receive(selectedSource); changed(); }, [controller, selectedSource]);
 const lease = controller.lease, state = controller.state;
 const act = (action: () => void) => { if (controller.isActive(lease) && state === controller.state) { action(); changed(); } };
 if (!active) return null;
 return <HciDocumentWorkbenchView key={lease} stage={onStage ? (index, side) => act(() => { const source = controller.stage(index, side, lease, state); if (source) onStage(source); }) : undefined} state={state} save={store ? () => act(() => { void controller.save(store, lease, state, onSaved).then(() => { if (controller.isActive(controller.lease)) changed(); }); }) : undefined} edit={s => act(() => controller.edit(s, lease, state))} clear={() => act(() => controller.clear(lease, state))}
 verify={() => act(() => { void controller.verify(lease, state).then(() => { if (controller.isActive(lease)) changed(); }); })} page={p => act(() => controller.page(p, lease, state))} />;
}
/** Presentation only. Keyed by exact draft below, and by activation lease at the owner. */
function ExactDocumentDisclosure({ draft }: { draft: string }) {
 const [expanded, setExpanded] = useState(false);
 return <ExactDocumentDisclosureView draft={draft} expanded={expanded} toggle={() => setExpanded(value => !value)} />;
}
export function ExactDocumentDisclosureView({ draft, expanded, toggle }: { draft: string; expanded: boolean; toggle: () => void }) {
 const title = expanded ? 'Hide exact HCI document JSON' : 'Show exact HCI document JSON';
 return <View><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }} onPress={toggle} style={styles.button}><Text style={styles.text}>{title}</Text></Pressable>
 {expanded && <Text selectable accessibilityLabel="Exact HCI document JSON" style={styles.text}>{draft}</Text>}</View>;
}
export interface HciDocumentViewProps { state: HciDocumentState; stage?: (index: number, side: 'left' | 'right') => void; readonly?: boolean; save?: () => void; edit: (s: string) => void; clear: () => void; verify: () => void; page: (p: number) => void }
export function HciDocumentWorkbenchView({ state, edit, clear, verify, page, save, stage, readonly = false }: HciDocumentViewProps) {
 const value = state.value;
 return <View style={styles.card}>
 <Text style={styles.heading}>HCI selected event document</Text>
 {!readonly && <><Text style={styles.text}>Exact prepared or pasted JSON is inert text, not automatically interpreted. Maximum 4096 UTF-16 code units, with whole-edit rejection and no trim, normalization or rewriting. Rejected edits retain the previous draft and block verification until valid replacement or Clear.</Text>
 <Text style={styles.text}>Explicit local save is available only after verification. Saving uses the exact verified snapshot; editing or leaving does not cancel a dispatched save. No automatic save, file import/export, download, share, clipboard write, radio or provider actions. Text is selectable for manual interaction. Leaving clears verification and reports, retaining the draft and rejected-edit fence. Pending work is fenced, not cancelled.</Text></>}
 <Text style={styles.text}>The whole selected event may contain multiple advertisers and sensitive vendor identifiers or arbitrary content. Only unrelated records are excluded. URI and text remain inert; no pooling, scan-response concatenation or reassembly.</Text>
 {!readonly && <Text style={styles.text}>Original-source references are UNVERIFIED on reopen. Declared provenance is not acquisition evidence. Neither digest establishes authentication, ownership, receiver identity, physical reception, device identity, completeness or truthful timing. Raw signed timestamps and cumulative drops remain producer claims; zero drops does not prove no loss.</Text>}
 {!readonly && <TextInput accessibilityLabel="HCI document JSON draft" multiline autoCapitalize="none" autoCorrect={false} value={state.draft} onChangeText={edit} style={styles.input} />}
 <Text style={styles.text}>{state.draft.length} retained UTF-16 code units. {readonly ? "Read-only exact saved snapshot." : "Loading and editing never verify automatically."}</Text>
 {readonly && <Text selectable accessibilityLabel="Exact HCI document JSON" style={styles.text}>{state.draft}</Text>}
 {!readonly && <><Control title="Verify/reopen HCI document" disabled={state.pending || state.rejectedEdit} onPress={verify} /><Control title="Clear HCI document" onPress={clear} /></>}
 {!readonly && <Control title="Save exact verified HCI document" disabled={!save || !value || state.pending || state.rejectedEdit || state.saving || state.savedDocument === state.draft} onPress={() => save?.()} />}<Text accessibilityLiveRegion="polite" style={styles.text}>{state.saveMessage}</Text>
 <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
 {readonly && <Text style={styles.text}>Original-source references are UNVERIFIED on reopen. Declared provenance is not acquisition evidence. Neither digest establishes authentication, ownership, receiver identity, physical reception, device identity, completeness or truthful timing. Raw signed timestamps and cumulative drops remain producer claims; zero drops does not prove no loss.</Text>}
 {!readonly && <ExactDocumentDisclosure key={state.draft} draft={state.draft} />}
 {value && <>
 <Text style={styles.heading}>Verified derivative binary SHA-256 and legacy structure</Text>
 <Text selectable style={styles.text}>Derivative SHA-256: {value.derivative.sha256}; decoded bytes: {value.derivative.byteCount}. Covers decoded file header plus selected record, NOT JSON, hex text or the original full capture. The injected hash adapter is trusted; shape does not establish honesty.</Text>
 <Text selectable style={styles.text}>UNVERIFIED original-source references: SHA-256 {value.sourceReference.sha256}; bytes {value.sourceReference.byteCount}; record index {value.sourceReference.recordIndex}; record offset {value.sourceReference.recordOffset}. Plausibility is not authentication or comparison against the original capture.</Text>
 <Text selectable style={styles.text}>Exact declared provenance: {JSON.stringify(value.context.provenance)}; exact declared label: {JSON.stringify(value.context.label)}. Operator declaration only.</Text>
 <Text style={styles.text}>All report/data offsets below are derivative-relative, recomputed in single-record coordinates, not original-source offsets. Host/controller bytes are not physical RF samples. Scan responses remain separate and resolved identity addresses need not be over-air addresses.</Text>
 <Text style={styles.heading}>Document reports: {state.reportCount}; page {state.page + 1} of {Math.max(1, Math.ceil(state.reportCount / 4))}</Text>
 <Control title="Previous document reports" disabled={state.page === 0} onPress={() => page(state.page - 1)} /><Control title="Next document reports" disabled={(state.page + 1) * 4 >= state.reportCount} onPress={() => page(state.page + 1)} />
 <LegacyReports reports={state.reports} />
 {!readonly && stage && state.reports.map(r => <View key={r.index}><Control title={`Stage report ${r.index} as left`} onPress={() => stage(r.index, 'left')} /><Control title={`Stage report ${r.index} as right`} onPress={() => stage(r.index, 'right')} /></View>)}
 </>}
 </View>;
}
const styles = StyleSheet.create({ card: { minWidth: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: '#414c37' }, heading: { color: '#d8ff6b', fontSize: 17 }, text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 }, input: { minHeight: 140, maxHeight: 300, padding: 12, backgroundColor: '#11170f', color: '#c9d5bc', textAlignVertical: 'top' }, button: { padding: 12, borderWidth: 1, borderColor: '#414c37' } });
