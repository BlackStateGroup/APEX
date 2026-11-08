import React, { useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { IrWorkbenchController, IR_RECORD_PAGE, irExcerpt, irVisibleRecords } from './ir-workbench.ts';
import type { IrWorkbenchState } from './ir-workbench.ts';
import { IrReceiverWorkbenchController } from './ir-receiver-workbench.ts';
import type { IrReceiverWorkbenchState } from './ir-receiver-workbench.ts';
// Existing platform-local UTF-8 hashing, no evidence store or provider calls.
import { bundleDigest } from './platform/bundle-digest';
function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function IrWorkbench({ active }: { active: boolean }) {
  const [controller] = useState(() => new IrWorkbenchController(active, bundleDigest));
  const [receiver] = useState(() => new IrReceiverWorkbenchController(active, bundleDigest));
  const [, refresh] = useState(0);
  const changed = () => refresh(n => n + 1);
  useLayoutEffect(() => {
    if (active) { controller.activate(); receiver.activate(); } else { controller.deactivate(); receiver.deactivate(); }
    changed();
    return () => { controller.deactivate(); receiver.deactivate(); };
  }, [active, controller, receiver]);
  const lease = controller.lease;
  const act = (action: () => void) => { if (controller.isActive(lease)) { action(); changed(); } };
  const receiverLease = receiver.lease;
  const receiverAct = (action: () => void) => { if (receiver.isActive(receiverLease)) { action(); changed(); } };
  if (!active) return null;
  return <><IrWorkbenchView state={controller.state}
    edit={draft => act(() => controller.edit(draft, lease))}
    declare={provenance => act(() => controller.declare(provenance, lease))}
    example={() => act(() => controller.example(lease))} clear={() => act(() => controller.clear(lease))}
    page={page => act(() => controller.page(page, lease))}
    inspect={() => act(() => { void controller.inspect(lease).then(() => { if (controller.isActive(lease)) changed(); }); })} />
    <IrReceiverWorkbenchView state={receiver.state}
      edit={draft => receiverAct(() => receiver.edit(draft, receiverLease))}
      declare={provenance => receiverAct(() => receiver.declare(provenance, receiverLease))}
      example={() => receiverAct(() => receiver.example(receiverLease))}
      clear={() => receiverAct(() => receiver.clear(receiverLease))}
      page={page => receiverAct(() => receiver.page(page, receiverLease))}
      inspect={() => receiverAct(() => { void receiver.inspect(receiverLease).then(() => { if (receiver.isActive(receiverLease)) changed(); }); })} />
  </>;
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
export interface IrReceiverWorkbenchViewProps {
  state: IrReceiverWorkbenchState; edit: (draft: string) => void;
  declare: (provenance: 'synthetic-fixture' | 'recorded-import') => void;
  example: () => void; clear: () => void; inspect: () => void; page: (page: number) => void;
}
/** Separate receiver report: unknown carrier is never coerced into a .ir frequency. */
export function IrReceiverWorkbenchView({ state, edit, declare, example, clear, inspect, page }: IrReceiverWorkbenchViewProps) {
  const report = state.report, pages = report ? Math.ceil(report.records.length / 4) : 0;
  return <View style={styles.card}>
    <Text style={styles.heading}>Offline IRremoteESP8266 receiver import</Text>
    <Text style={styles.text}>Paste the uint16_t rawData source-code block from IRrecvDumpV2, optionally followed by generated address, command and data declarations. Multiple blocks are accepted. Paste source-code excerpts only, not full serial logs, sketches or AC state arrays. No code is executed.</Text>
    <Text style={styles.text}>Memory only, no transmission, replay, device access, provider calls, save or export. Draft retained across tabs; leaving this inspector or Analysis clears results and fences pending hashing. Import here means offline pasted-text inspection, not receiver connection.</Text>
    <Text style={styles.text}>Limits: 262144 ASCII characters, 16384 per line, 32 captures, 1024 timings per capture, 8192 total timings, 1–65535 µs each. Zero separators used for split long durations are unsupported and rejected, never silently merged. Oversized or non-ASCII edits are rejected whole and block Inspect until an accepted replacement or Clear.</Text>
    <View style={styles.actions}>
      <Control title="Load synthetic receiver example" onPress={example} />
      <Control title="Declare synthetic receiver source" onPress={() => declare('synthetic-fixture')} />
      <Control title="Declare imported receiver source" onPress={() => declare('recorded-import')} />
    </View>
    <Text style={styles.text}>Receiver caller declaration: {state.provenance ?? 'not selected'}. A declaration does not verify capture origin; the example is manually authored, not a physical recording.</Text>
    <TextInput accessibilityLabel="IRremoteESP8266 receiver excerpt draft" multiline value={state.draft} onChangeText={edit} autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <Text style={styles.text}>{state.draft.length} accepted ASCII draft characters. Changes never inspect automatically.</Text>
    <View style={styles.actions}><Control title="Inspect receiver excerpt" disabled={state.pending || state.rejectedEdit} onPress={inspect} /><Control title="Clear receiver draft" onPress={clear} /></View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {report && <>
      <Text style={styles.heading}>Receiver inspection: {report.records.length} captures · {report.byteCount} accepted draft bytes</Text>
      <Text style={styles.text}>Accepted receiver draft SHA-256: {report.sha256}. This identifies exact ASCII text received by the app, not original file or clipboard bytes before paste or text-widget processing. Line-ending normalization before the app receives it is unverified. No authenticity, ownership, physical capture or device compatibility is established.</Text>
      <Text style={styles.text}>Carrier frequency and duty cycle are unknown, not measured or supplied in this source format. Receiver timing envelopes do not determine carrier. Capture completeness is unverified: excerpts can omit buffer-overflow warnings. Repeats are not inferred. Comments and generated fields are inert source claims, never treated as trusted decoding.</Text>
      <Text style={styles.text}>Source-format reference: IRremoteESP8266 {report.referencePin}. This reference does not identify the firmware that produced the pasted text. Whole-array standard NEC recognition is conditional on the source-format first-mark alternating convention; timings are not repaired or rescaled.</Text>
      <Text style={styles.text}>Receiver capture page {state.page + 1} of {pages}. Up to four summaries, no duration dump.</Text>
      <View style={styles.actions}><Control title="Previous receiver captures" disabled={state.page === 0} onPress={() => page(state.page - 1)} /><Control title="Next receiver captures" disabled={state.page + 1 >= pages} onPress={() => page(state.page + 1)} /></View>
      {report.records.slice(state.page * 4, (state.page + 1) * 4).map(record => <View key={record.ordinal} style={styles.record}>
        <Text style={styles.heading}>Receiver capture {record.ordinal}</Text>
        <Text style={styles.text}>Source lines {record.startLine}–{record.endLine}. Declared count {record.declaredCount}; {record.durationsUs.length} unchanged timings. Minimum {Math.min(...record.durationsUs)} µs, maximum {Math.max(...record.durationsUs)} µs, total {record.durationsUs.reduce((a, b) => a + b, 0)} µs.</Text>
        <Text style={styles.text}>Unverified declared fields: address {record.declaredFields.address ?? 'not supplied'}, command {record.declaredFields.command ?? 'not supplied'}, data {record.declaredFields.data ?? 'not supplied'}. These are not compared with recognition or used to infer device identity.</Text>
        <Text style={styles.text}>Whole-array NEC recognition: {record.recognition.status}.{record.recognition.status === 'recognized' ? ` Conditional decoded address ${record.recognition.decoded.address}, command ${record.recognition.decoded.command}.` : ' No supported complete standard NEC frame recognized; other valid protocols or repeat frames may be present.'}</Text>
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
