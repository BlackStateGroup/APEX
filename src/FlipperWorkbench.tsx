import React, { useReducer } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { flipperWorkbenchReducer, initialFlipperWorkbench, flipperVisibleFrames, flipperVisibleFields, flipperSelectedFields, FLIPPER_FRAME_PAGE, FLIPPER_FIELD_PAGE } from './flipper-workbench.ts';

import type { FlipperWorkbenchState, FlipperWorkbenchAction } from './flipper-workbench.ts';

function Control({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
/** Mounted across tabs; memory only. All decoded values are inert JSON-quoted text. */
export function FlipperWorkbench({ active }: { active: boolean }) {
  const [state, send] = useReducer(flipperWorkbenchReducer, initialFlipperWorkbench);
  if (!active) return null;
  return <FlipperWorkbenchView state={state} send={send} />;
}
/** Pure projection of the controller's frozen observations; owns no lifecycle or state. */
export function FlipperWorkbenchView({ state, send }: { state: FlipperWorkbenchState; send: React.Dispatch<FlipperWorkbenchAction> }) {
  const report = state.report;
  return <View style={styles.card}>
    <Text style={styles.heading}>Offline Flipper responses</Text>
    <Text style={styles.text}>Response bytes only. No live device connection, commands, authentication, stream assembly or identity verification. Memory only: retained across tabs, cleared on reload. No save, export or URL opening.</Text>
    <Text style={styles.text}>Paste complete even hex pairs. Only ASCII space, tab, LF, VT, FF and CR separators are accepted between pairs. Maximum 196608 text characters including separators and 65536 decoded bytes. Invalid or oversized edits are rejected whole, never truncated; the prior draft remains and results clear.</Text>
    <View style={styles.actions}>
      <Control title="Load synthetic Flipper response" onPress={() => send({ type: 'fixture' })} />
      <Control title="Declare synthetic Flipper bytes" onPress={() => send({ type: 'provenance', provenance: 'synthetic' })} />
      <Control title="Declare imported Flipper bytes" onPress={() => send({ type: 'provenance', provenance: 'imported' })} />
    </View>
    <Text style={styles.text}>Caller-declared provenance: {state.provenance ?? 'not selected'}. Neither declaration proves origin or physical reception.</Text>
    <TextInput accessibilityLabel="Offline Flipper hex draft" value={state.draft} onChangeText={draft => send({ type: 'edit', draft })} multiline autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <Text style={styles.text}>{state.draft.length} exact draft characters. Loading, editing and declaring provenance do not inspect.</Text>
    <Control title="Inspect offline Flipper responses" onPress={() => send({ type: 'inspect' })} />
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {report && <>
      <Text style={styles.heading}>Flipper inspection: {report.frames.length} frames · {report.byteLength} bytes · {report.provenance}</Text>
      <Text style={styles.text}>Incomplete tail: {report.tail ? `${report.tail.kind} at byte ${report.tail.offset}; expected payload bytes ${report.tail.expectedPayloadBytes ?? 'unknown'}` : 'none observed (not proof of completion)'}</Text>
      {report.diagnostics.map((value, i) => <Text key={i} style={styles.text}>{value}</Text>)}
      <Text style={styles.text}>Frame page {state.framePage + 1} of {Math.max(1, Math.ceil(report.frames.length / FLIPPER_FRAME_PAGE))}</Text>
      <View style={styles.actions}>
        <Control title="Previous Flipper frames" disabled={state.framePage === 0} onPress={() => send({ type: 'frame-page', page: state.framePage - 1 })} />
        <Control title="Next Flipper frames" disabled={(state.framePage + 1) * FLIPPER_FRAME_PAGE >= report.frames.length} onPress={() => send({ type: 'frame-page', page: state.framePage + 1 })} />
      </View>
      {flipperVisibleFrames(state).map((frame, local) => {
        const index = state.framePage * FLIPPER_FRAME_PAGE + local;
        return <View key={frame.offset} style={styles.card}>
          <Text style={styles.heading}>Response frame {index + 1} · bytes {frame.offset}–{frame.end}</Text>
          <Text style={styles.text}>ID: present {String(frame.commandId.present)}, effective {frame.commandId.effective}. Status: present {String(frame.status.present)}, effective {frame.status.effective} ({frame.status.observation}). has_next: present {String(frame.hasNext.present)}, effective {String(frame.hasNext.effective)}.</Text>
          <Text style={styles.text}>Content kind: {frame.content.kind}. Unknown envelope fields: {frame.unknownFields.length}; unknown content fields: {frame.content.unknownFields.length}.</Text>
          {(['key', 'value', 'major', 'minor'] as const).map(name => {
            const value = frame.content[name];
            return value ? <Text selectable key={name} style={styles.text}>{name}: present {String(value.present)}, effective {JSON.stringify(value.effective)}</Text> : null;
          })}
          {frame.diagnostics.map((value, i) => <Text key={i} style={styles.text}>{value}</Text>)}
          <Control title={`Select Flipper frame ${index + 1} fields`} onPress={() => send({ type: 'select-frame', index })} />
        </View>;
      })}
      {!!report.frames.length && <>
        <Text style={styles.heading}>Frame {state.selectedFrame + 1} field metadata</Text>
        <Text style={styles.text}>Field page {state.fieldPage + 1} of {Math.max(1, Math.ceil(flipperSelectedFields(state).length / FLIPPER_FIELD_PAGE))}. Offsets only, no byte dump.</Text>
        {flipperVisibleFields(state).map(field => <Text key={`${field.scope}-${field.offset}`} style={styles.text}>{field.scope}: tag {field.tag}, wire {field.wire}, bytes {field.offset}–{field.end}, value bytes {field.valueOffset}–{field.valueEnd}</Text>)}
        <View style={styles.actions}>
          <Control title="Previous Flipper fields" disabled={state.fieldPage === 0} onPress={() => send({ type: 'field-page', page: state.fieldPage - 1 })} />
          <Control title="Next Flipper fields" disabled={(state.fieldPage + 1) * FLIPPER_FIELD_PAGE >= flipperSelectedFields(state).length} onPress={() => send({ type: 'field-page', page: state.fieldPage + 1 })} />
        </View>
      </>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { minWidth: 0, padding: 18, gap: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 6 },
  heading: { color: '#d8ff6b', fontSize: 17, fontWeight: '600' },
  text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 },
  input: { minHeight: 120, maxHeight: 260, padding: 12, backgroundColor: '#11170f', color: '#c9d5bc', textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { padding: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 4 },
});
