import { BleTrialAuthoringWorkbench } from './BleTrialAuthoringWorkbench.tsx';
import type { BleTrialAuthoringWorkbench as AuthorController } from './ble-trial-authoring-workbench.ts';
import type { BleTrialAction } from './ble-trial-workbench.ts';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_DIFFERENTIAL_CHARACTERS } from '../packages/core/ble-differential.ts';
import { bleTrialReducer, bleTrialSummary, initialBleTrialState } from './ble-trial-workbench.ts';
import fixture from '../tests/fixtures/ble-differential.json';

function Control({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
const quoted = (value: unknown) => JSON.stringify(value);
/** Kept mounted by App when inactive so drafts survive tab navigation, not reloads. */
export function BleTrialWorkbench({ active, authoring, onAuthoringChanged }: { active: boolean; authoring?: AuthorController; onAuthoringChanged?: () => void }) {
  const [state, setState] = useState(initialBleTrialState);
  const current = useRef(state);
  function send(action: BleTrialAction) { current.current = bleTrialReducer(current.current, action); setState(current.current); }
  const summary = bleTrialSummary(state);
  return <View style={[styles.card, !active && { display: 'none' }]}>
    {authoring && <BleTrialAuthoringWorkbench controller={authoring} onChanged={onAuthoringChanged ?? (() => {})} onUse={document => send({ type: 'edit', document })} />}
    <Text style={styles.heading}>Offline BLE trial comparison</Text>
    <Text style={styles.text}>Owned/lab declaration only. Paste the exact strict FCD2/FEAA grouped dataset with selected-source document strings. No scanning, device control, field mapping, decryption or automatic persistence. Draft is not persisted and is lost on reload.</Text>
    <Control title="Load synthetic BLE trials" onPress={() => send({ type: 'edit', document: JSON.stringify(fixture, null, 2) })} />
    <Text style={styles.text}>Synthetic fixture bytes are fabricated, not measurements. Loading or editing never analyzes automatically. Limit: {MAX_DIFFERENTIAL_CHARACTERS} UTF-16 code units; oversized edits are rejected whole, never truncated.</Text>
    <TextInput accessibilityLabel="BLE trial dataset" multiline value={state.document} onChangeText={document => send({ type: 'edit', document })}
      autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <Text style={styles.text}>{state.document.length} UTF-16 code units in exact draft.</Text>
    <Control title="Analyze BLE trials" onPress={() => send({ type: 'analyze' })} />
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {summary && <>
      <Text style={styles.heading}>BLE trial result · {summary.serviceUuid}</Text>
      <Text style={styles.text}>{summary.sourceCount} separate declared sources; {summary.trialCount} listed trials. Groups, conditions, platform, origin, snapshot IDs and receipt references are declarations, not verified ownership, identity, reception, independence or experimental control.</Text>
      {summary.groups.map(group => <Text key={group.id} selectable style={styles.text}>Declared group {quoted(group.id)}: {quoted(group.condition)}</Text>)}
      <View style={styles.actions}>{state.report!.sources.map((source, index) => <Control key={source.id}
        title={`Select trial source ${index + 1}: ${source.id}`} onPress={() => send({ type: 'source', index })} />)}</View>
      <Text selectable style={styles.text}>Selected source {quoted(summary.source.id)} · declared platform {summary.source.platform} · declared origin {summary.source.origin} · declared snapshot {quoted(summary.source.snapshotId)}</Text>
      <Text style={styles.text}>Android compares raw AD service bytes only; iOS compares normalized service fields only. Different sources are never pooled. Receipt references below are opaque declarations, not verified journal receipts. Source timestamps are unverified and do not determine order.</Text>
      {summary.trials.map(trial => <Text key={trial.id} selectable style={styles.text}>Trial {quoted(trial.id)} · group {quoted(trial.groupId)} · receipt {quoted(trial.receiptId)} · {trial.bytes} payload bytes · {trial.representation} · AD offset {quoted(trial.adOffset)} · {trial.interpretation}</Text>)}
      <Text style={styles.text}>Computed for this source: {summary.width} payload offsets; {summary.changedCount} changed offsets. Page {summary.pageCount ? state.page + 1 : 0} of {summary.pageCount}. Only up to 16 offset buttons and one offset detail are displayed. * marks changed bytes, including within-group or presence/absence changes.</Text>
      <View style={styles.actions}>
        <Control title="Previous trial offsets" disabled={state.page === 0} onPress={() => send({ type: 'page', page: state.page - 1 })} />
        <Control title="Next trial offsets" disabled={state.page + 1 >= summary.pageCount} onPress={() => send({ type: 'page', page: state.page + 1 })} />
        {summary.offsets.map(row => <Control key={row.offset} title={`Payload offset ${row.offset}${row.changed ? ' *' : ''}`}
          onPress={() => send({ type: 'offset', offset: row.offset })} />)}
      </View>
      {summary.detail ? <>
        <Text style={styles.heading}>Selected payload offset {summary.detail.offset}</Text>
        <Text style={styles.text}>Changed: {String(summary.detail.changed)}. Stable within each group: {String(summary.detail.stableWithinEachGroup)}. Neither establishes causality.</Text>
        {summary.detail.cells.map(cell => <Text key={cell.groupId} selectable style={styles.text}>Group {quoted(cell.groupId)} · hex values in listed group trial order: {quoted(cell.values)} · byte-value counts: {quoted(cell.counts)} · listed-order runs: {cell.runCount}</Text>)}
      </> : <Text style={styles.text}>No payload bytes to compare.</Text>}
      <Text style={styles.text}>Offsets are zero-based service payload bytes, excluding UUID and AD headers. Null means absent, never 00. Positions are not sequence-aligned. Listed order is not chronology. Counts and runs are descriptive, not statistical significance or sensor mappings. Encrypted BTHome is opaque; other payloads are byte-comparison-only, not certified plaintext. The complete report and exact draft stay in memory; raw source strings are not duplicated in this view. No links or actions are derived from data.</Text>
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
