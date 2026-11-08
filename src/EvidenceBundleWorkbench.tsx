import { hciDigest } from './platform/hci-digest';
import React, { useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_BUNDLE_CHARACTERS, MAX_BUNDLE_RECORDS, MAX_BUNDLE_RECORD_CHARACTERS } from '../packages/core/evidence-bundle.ts';
import { BUNDLE_PAGE_SIZE, EvidenceBundleWorkbench as Controller } from './evidence-bundle-workbench.ts';
import type { BundleState } from './evidence-bundle-workbench.ts';
import { bundleDigest } from './platform/bundle-digest';
function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function EvidenceBundleWorkbench({ active }: { active: boolean }) {
  const [controller] = useState(() => new Controller(active));
  const [, refresh] = useState(0);
  const changed = () => refresh(value => value + 1);
  useLayoutEffect(() => {
    if (active) controller.activate(); else controller.deactivate();
    changed();
    return () => { controller.deactivate(); };
  }, [active, controller]);
  const lease = controller.lease;
  const act = (action: () => void) => { if (controller.isActive(lease)) { action(); changed(); } };
  if (!active) return null;
  return <EvidenceBundleWorkbenchView state={controller.state} edit={text => act(() => controller.edit(text))}
    clear={() => act(() => controller.clear())} page={page => act(() => controller.page(page))}
    inspect={() => act(() => { void controller.inspect(bundleDigest, hciDigest).then(() => { if (controller.isActive(lease)) changed(); }); })} />;
}
/** Display-only excerpt; never rewrite the retained timestamp or exact record document. */
function recordTime(value: string) {
  const excerpt = JSON.stringify(value.slice(0, 120));
  return value.length > 120 ? `${excerpt} [truncated display: first 120 of ${value.length} UTF-16 code units]` : excerpt;
}
export function EvidenceBundleWorkbenchView({ state, edit, clear, inspect, page }: {
  state: BundleState; edit: (text: string) => void; clear: () => void; inspect: () => void; page: (page: number) => void;
}) {
  const report = state.report;
  const pages = report ? Math.ceil(report.records.length / BUNDLE_PAGE_SIZE) : 0;
  return <View style={styles.card}>
    <Text style={styles.heading}>Offline selected-record bundle preview</Text>
    <Text style={styles.text}>Separate from the local journal. Paste an existing apex.selected-evidence bundle. Memory only: draft retained across tabs, lost on reload. Leaving Evidence clears inspection results. No restore, import, save, export, share, copy action, URL opening or device access.</Text>
    <Text style={styles.text}>Limit: {MAX_BUNDLE_CHARACTERS} UTF-16 code units; 1–{MAX_BUNDLE_RECORDS} records; {MAX_BUNDLE_RECORD_CHARACTERS} code units per exact record string. Oversized edits are rejected whole, never truncated; Inspect stays blocked until an accepted replacement edit or Clear. Editing clears results; inspection is explicit.</Text>
    <TextInput accessibilityLabel="Selected evidence bundle draft" multiline value={state.document} onChangeText={edit} autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <Text style={styles.text}>{state.document.length} UTF-16 code units in exact draft.</Text>
    <View style={styles.actions}><Control title="Inspect evidence bundle" disabled={state.pending || state.rejectedEdit} onPress={inspect} /><Control title="Clear bundle preview" onPress={clear} /></View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {report && <>
      <Text style={styles.heading}>Verified bundle summary</Text>
      <Text style={styles.text}>{report.records.length} selected records · declared export time {JSON.stringify(report.exportedAt)}</Text>
      <Text style={styles.text}>Whole-bundle SHA-256: {report.sha256}</Text>
      <Text style={styles.text}>The whole-bundle digest covers the canonical envelope, listed order and exact stored record strings, not outer JSON formatting. Every record content digest was also checked using its existing canonical v1 content rules, not the raw record text.</Text>
      <Text style={styles.text}>Digests are not signatures: author, source, timestamps, ownership, hardware reception and authenticity remain unauthenticated. This selection does not establish a complete journal, chronology or an independent observation. Payloads and URLs are inert data, never commands or links.</Text>
      <Text style={styles.text}>Record page {state.page + 1} of {pages}. Up to {BUNDLE_PAGE_SIZE} metadata summaries shown; exact record strings remain in memory, not reconstructed or duplicated here. Payload details are not displayed.</Text>
      <View style={styles.actions}><Control title="Previous bundle records" disabled={state.page === 0} onPress={() => page(state.page - 1)} /><Control title="Next bundle records" disabled={state.page + 1 >= pages} onPress={() => page(state.page + 1)} /></View>
      {report.records.slice(state.page * BUNDLE_PAGE_SIZE, (state.page + 1) * BUNDLE_PAGE_SIZE).map((record, index) => <View key={record.id} style={styles.record}>
        <Text style={styles.heading}>Listed record {state.page * BUNDLE_PAGE_SIZE + index + 1} · {JSON.stringify(record.id)}</Text>
        <Text style={styles.text}>Kind {record.kind} · declared source {record.source} · declared record time {recordTime(record.observedAt)}</Text>
        <Text style={styles.text}>Individual canonical content SHA-256 verified: {record.sha256}</Text>
        {record.kind === 'analysis.hci-event' && <Text style={styles.text}>HCI canonical envelope verified separately from binary derivative SHA-256 and whole legacy structure. Original capture hash, size, index and offset remain UNVERIFIED. Journal time is declared save time, not authenticated capture time.</Text>}
        <Text style={styles.text}>Exact stored text: {report.recordDocuments[state.page * BUNDLE_PAGE_SIZE + index]!.length} UTF-16 code units.</Text>
      </View>)}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { minWidth: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: '#414c37', borderRadius: 6 },
  record: { minWidth: 0, gap: 8 },
  heading: { color: '#d8ff6b', fontSize: 17, fontWeight: '600' },
  text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 },
  input: { minHeight: 180, maxHeight: 300, padding: 12, backgroundColor: '#11170f', color: '#c9d5bc', textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { padding: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 4, maxWidth: '100%' },
});
