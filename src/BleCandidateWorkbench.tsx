import React, { useReducer } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_FIELD_HYPOTHESIS_CHARACTERS } from '../packages/core/ble-field-hypothesis.ts';
import { bleCandidateReducer, bleCandidateSummary, exactCandidateValue, initialBleCandidateState } from './ble-candidate-workbench.ts';
import fixture from '../tests/fixtures/ble-field-hypothesis.json';
function Control({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
const quoted = (value: unknown) => JSON.stringify(value);
/** Kept mounted across tabs; memory only, never persisted. */
export function BleCandidateWorkbench({ active }: { active: boolean }) {
  const [state, send] = useReducer(bleCandidateReducer, initialBleCandidateState);
  if (!active) return null;
  const view = bleCandidateSummary(state);
  const report = state.report;
  return <View style={styles.card}>
    <Text style={styles.heading}>Offline BLE declared numeric candidate</Text>
    <Text style={styles.text}>Offline analysis for iPhone, Android and web. One operator-declared candidate, not automatic field discovery. No scanning, device commands, decryption, network or provider. Native phone execution and physical RF validation remain unverified. Draft survives tab navigation but is lost on reload; no automatic persistence.</Text>
    <View style={styles.actions}>
      <Control title="Start BLE candidate import" onPress={() => send({ type: 'edit', document: '' })} />
      <Control title="Load synthetic BLE candidate" onPress={() => send({ type: 'edit', document: JSON.stringify(fixture, null, 2) })} />
    </View>
    <Text style={styles.text}>Paste exact JSON: schemaVersion 1, dataset as an exact JSON string, one candidate (byteOffset, width, byteOrder, signed, divisor, valueOffset), canonical decimal-string tolerance, and assignments (trialId, subset, expected decimal string). Subset is discovery or held-out. Each selected source requires both. Fixture bytes are synthetic, not measurements. Loading and editing never analyze automatically. Limit: {MAX_FIELD_HYPOTHESIS_CHARACTERS} UTF-16 code units; oversized edits are rejected whole, never truncated.</Text>
    <TextInput accessibilityLabel="BLE candidate document" multiline value={state.document} onChangeText={document => send({ type: 'edit', document })}
      autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <Text style={styles.text}>{state.document.length} UTF-16 code units in exact candidate draft.</Text>
    <Control title="Analyze BLE candidate" onPress={() => send({ type: 'analyze' })} />
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {report && view && <>
      <Text style={styles.heading}>Declared BLE candidate result</Text>
      <Text selectable style={styles.text}>Candidate: {quoted(report.candidate)} · exact inclusive tolerance: {quoted(report.tolerance)}</Text>
      <Text style={styles.text}>{report.eligibility}</Text>
      <Text style={styles.text}>{report.caveat}</Text>
      <View style={styles.actions}>{report.sources.map((source, index) => <Control key={source.sourceId}
        title={`Select candidate source ${index + 1}: ${source.sourceId}`} onPress={() => send({ type: 'source', index })} />)}</View>
      <Text selectable style={styles.text}>Candidate source {quoted(view.source.id)} · declared platform {view.source.platform} · declared origin {view.source.origin} · declared snapshot {quoted(view.source.snapshotId)}</Text>
      <Text style={styles.text}>Sources are never pooled. Android uses raw AD service bytes; iOS uses normalized service fields. Source identity, origin and receipt references are unverified declarations.</Text>
      {view.subsets.map(subset => <Text key={subset.subset} style={styles.text}>Operator-designated {subset.subset}: {subset.count} rows · {subset.withinTolerance} within tolerance · {subset.outsideTolerance} outside tolerance · {subset.incomplete} incomplete. Counts are not independent observations.</Text>)}
      <Text selectable style={styles.text}>Unselected trials in this source (excluded from numeric counts): {quoted(view.unselectedTrialIds)}. Whole dataset: {report.unselectedTrialIds.length} unselected trials retained in memory, including any entirely unselected sources.</Text>
      <Text style={styles.text}>Candidate rows: {view.rowCount}. Page {state.page + 1} of {view.pageCount}; at most 4 rows displayed per source.</Text>
      <View style={styles.actions}>
        <Control title="Previous candidate rows" disabled={state.page === 0} onPress={() => send({ type: 'page', page: state.page - 1 })} />
        <Control title="Next candidate rows" disabled={state.page + 1 >= view.pageCount} onPress={() => send({ type: 'page', page: state.page + 1 })} />
      </View>
      {view.rows.map(row => <View key={row.trialId}>
        <Text selectable style={styles.text}>Candidate trial {quoted(row.trialId)} · group {quoted(row.groupId)} · receipt {quoted(row.receiptId)} · operator-designated {row.subset} · {row.status}</Text>
        <Text selectable style={styles.text}>Matched public format: {row.matchedFormat} · field hex: {quoted(row.fieldHex)} · raw integer: {quoted(row.rawInteger)} · declared expected: {quoted(row.expected)}</Text>
        <Text selectable style={styles.text}>Exact value: {exactCandidateValue(row.value)} · exact signed residual: {exactCandidateValue(row.residual)}</Text>
      </View>)}
      {report.limitations.map((limitation, index) => <Text key={index} style={styles.text}>{limitation}</Text>)}
      <Text style={styles.text}>Full exact draft and report remain in memory, not duplicated here. All imported labels are inert text; no links or actions are derived from content.</Text>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { minWidth: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: '#414c37', borderRadius: 6 },
  heading: { color: '#d8ff6b', fontSize: 17, fontWeight: '600' },
  text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 },
  input: { minHeight: 180, maxHeight: 300, padding: 12, backgroundColor: '#11170f', color: '#c9d5bc', textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { padding: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 4, maxWidth: '100%' },
});
