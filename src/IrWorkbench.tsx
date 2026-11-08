import React, { useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { IrWorkbenchController, IR_RECORD_PAGE, irExcerpt, irVisibleRecords } from './ir-workbench.ts';
import type { IrWorkbenchState } from './ir-workbench.ts';
// Existing platform-local UTF-8 hashing, no evidence store or provider calls.
import { bundleDigest } from './platform/bundle-digest';
function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function IrWorkbench({ active }: { active: boolean }) {
  const [controller] = useState(() => new IrWorkbenchController(active, bundleDigest));
  const [, refresh] = useState(0);
  const changed = () => refresh(n => n + 1);
  useLayoutEffect(() => {
    if (active) controller.activate(); else controller.deactivate();
    changed();
    return () => controller.deactivate();
  }, [active, controller]);
  const lease = controller.lease;
  const act = (action: () => void) => { if (controller.isActive(lease)) { action(); changed(); } };
  if (!active) return null;
  return <IrWorkbenchView state={controller.state}
    edit={draft => act(() => controller.edit(draft, lease))}
    declare={provenance => act(() => controller.declare(provenance, lease))}
    example={() => act(() => controller.example(lease))} clear={() => act(() => controller.clear(lease))}
    page={page => act(() => controller.page(page, lease))}
    inspect={() => act(() => { void controller.inspect(lease).then(() => { if (controller.isActive(lease)) changed(); }); })} />;
}
export interface IrWorkbenchViewProps {
  state: IrWorkbenchState; edit: (draft: string) => void;
  declare: (provenance: 'synthetic-fixture' | 'recorded-import') => void;
  example: () => void; clear: () => void; inspect: () => void; page: (page: number) => void;
}
/** Pure bounded projection. Exact accepted draft appears only in the editable input, never reconstructed. */
export function IrWorkbenchView({ state, edit, declare, example, clear, inspect, page }: IrWorkbenchViewProps) {
  const report = state.report;
  const pages = report ? Math.ceil(report.records.length / IR_RECORD_PAGE) : 0;
  return <View style={styles.card}>
    <Text style={styles.heading}>Offline ordinary .ir remote inspector</Text>
    <Text style={styles.text}>Memory only: draft and declaration retained across tabs, lost on reload. Leaving this inspector or Analysis clears inspection results. Pending hashing is fenced, not cancelled. No journal import, save, export, share, copy action, transmission, replay, device access or provider calls.</Text>
    <Text style={styles.text}>Paste an ordinary Flipper .ir remote: strict standard NEC parsed fields or raw subset only. Unsupported protocols are rejected by this narrow parser, not declared physically invalid IR. Maximum 262144 ASCII characters (accepted draft bytes), 128 records, 1024 timings per record and 8192 total timings. Non-ASCII or oversized edits are rejected whole, never truncated; the previous draft remains but Inspect is blocked until an accepted replacement or Clear. Control characters are checked during inspection.</Text>
    <View style={styles.actions}>
      <Control title="Load synthetic IR example" onPress={example} />
      <Control title="Declare synthetic IR source" onPress={() => declare('synthetic-fixture')} />
      <Control title="Declare imported IR source" onPress={() => declare('recorded-import')} />
    </View>
    <Text style={styles.text}>IR caller declaration: {state.provenance ?? 'not selected'}. Neither declaration proves origin. The example is manually authored, not imported upstream bytes or a physical recording.</Text>
    <TextInput accessibilityLabel="Ordinary IR remote draft" multiline value={state.draft} onChangeText={edit} autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <Text style={styles.text}>{state.draft.length} exact ASCII draft characters. Edits, examples and declaration changes never inspect automatically.</Text>
    <View style={styles.actions}><Control title="Inspect ordinary IR remote" disabled={state.pending || state.rejectedEdit} onPress={inspect} /><Control title="Clear IR draft" onPress={clear} /></View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {report && <>
      <Text style={styles.heading}>IR inspection: {report.records.length} records · {report.byteCount} accepted draft bytes</Text>
      <Text style={styles.text}>Accepted draft SHA-256: {report.sha256}. This hashes the exact ASCII text received by the app. It does not establish original file byte identity before paste, clipboard or text-widget processing. Line-ending normalization before the app receives the text is unverified. The digest does not establish authenticity, physical capture, ownership, device identity or compatibility. Strings and URLs remain inert text.</Text>
      <Text style={styles.text}>Parsed NEC integers are declared fields, not decoded airframes. Raw recognition considers the whole unchanged duration array under an assumed first-mark alternating convention; no repair, capture or authentication is established. Matching values do not prove shared device identity.</Text>
      <Text style={styles.text}>Frequency and duty are declared settings, sometimes firmware defaults, not measured carrier. Exact duty token and binary64-rounded numeric projection are distinct. Repeats are not represented in this format, not false.</Text>
      <Text style={styles.text}>IR record page {state.page + 1} of {pages}. Up to four summaries; durations are summarized numerically, not dumped.</Text>
      <View style={styles.actions}><Control title="Previous IR records" disabled={state.page === 0} onPress={() => page(state.page - 1)} /><Control title="Next IR records" disabled={state.page + 1 >= pages} onPress={() => page(state.page + 1)} /></View>
      {irVisibleRecords(state).map(record => <View key={record.ordinal} style={styles.record}>
        <Text style={styles.heading}>IR record {record.ordinal} · {record.type}</Text>
        <Text style={styles.text}>Name: {irExcerpt(record.name)}. Source lines {record.startLine}–{record.endLine}. Repeats: {record.repeats}.</Text>
        {record.type === 'parsed' ? <Text style={styles.text}>Declared standard NEC integers: address {record.address}, command {record.command}. Original address bytes {JSON.stringify(record.addressBytes)}, command bytes {JSON.stringify(record.commandBytes)}. Not a decoded airframe.</Text> : <>
          <Text style={styles.text}>Declared frequency {record.frequencyHz} Hz; exact duty token {irExcerpt(record.dutyCycleDecimal)}; binary64-rounded duty projection {String(record.dutyCycle)}.</Text>
          <Text style={styles.text}>Duration summary: {record.durationsUs.length} values, minimum {Math.min(...record.durationsUs)} µs, maximum {Math.max(...record.durationsUs)} µs, total {record.durationsUs.reduce((a, b) => a + b, 0)} µs. Convention: {record.timingConvention}.</Text>
          <Text style={styles.text}>Whole-array NEC recognition: {record.recognition.status}.{record.recognition.status === 'recognized' ? ` Conditional decoded address ${record.recognition.decoded.address}, command ${record.recognition.decoded.command}.` : ' No supported complete standard NEC frame recognized; file may still contain valid raw timings.'}</Text>
        </>}
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
