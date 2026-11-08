import { AnalysisSourceGate } from './analysis-navigation.ts';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EvidenceRecord, EvidenceStore } from '../packages/core/evidence.ts';
import type { PhoneNdefObservation } from '../packages/core/nfc-manager-ndef.ts';
import { phoneNdefWorkbenchReducer, canSavePhoneNdef, initialPhoneNdefWorkbench, reopenPhoneNdefEvidence } from './phone-ndef-workbench.ts';
import type { PhoneNdefWorkbenchAction } from './phone-ndef-workbench.ts';
import androidDemo from '../tests/fixtures/phone-ndef/android.json';
import iosDemo from '../tests/fixtures/phone-ndef/ios.json';

function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
/** JSON quoting makes controls visible. Values remain inert text, never links or markup. */
function Findings({ observation }: { observation: PhoneNdefObservation }) {
  return <View style={styles.card}>
    <Text style={styles.heading}>{observation.provenance.origin === 'synthetic-fixture' ? 'SYNTHETIC PHONE NDEF FIELDS' : 'RECORDED PHONE NDEF FIELDS / UNVERIFIED'}</Text>
    <Text selectable style={styles.text}>Caller label: {JSON.stringify(observation.provenance.label)}</Text>
    <Text style={styles.text}>OS-normalized selected fields, not original serialized NDEF wire. Source platform: {observation.source.platform}. Availability: {observation.availability}. Missing, null and empty-array are distinct; none certifies an empty wire message.</Text>
    <Text style={styles.text}>Source and provenance are caller claims. Reception, identity and authentication unverified. Original headers, offsets, chunk boundaries and source timestamp unavailable. Journal time is save time, not tag/RF capture time.</Text>
    <Text style={styles.heading}>Interpretation of normalized fields</Text>
    {observation.projection.map((record, index) => <View key={index}>
      <Text style={styles.heading}>Logical record {index + 1} · TNF {record.tnf}</Text>
      <Text selectable style={styles.text}>{record.value.kind === 'text'
        ? `Text (${record.value.encoding}, language ${JSON.stringify(record.value.language)}): ${JSON.stringify(record.value.text)}`
        : record.value.kind === 'uri' ? `URI text (not actionable): ${JSON.stringify(record.value.uri)}`
        : record.value.kind === 'empty' ? 'Empty record' : `${record.value.kind}: ${record.value.reason}`}</Text>
      <Text selectable style={styles.text}>Type hex: {JSON.stringify(record.typeHex)} · Record ID hex (not tag identity): {JSON.stringify(record.idHex)} · Payload hex: {JSON.stringify(record.payloadHex)}</Text>
    </View>)}
    <Text style={styles.heading}>Selected source fields (not wire bytes)</Text>
    <Text selectable style={styles.text}>{JSON.stringify(observation.snapshot, null, 2)}</Text>
    <Text style={styles.heading}>Exact retained source document</Text>
    <Text selectable style={styles.text}>{observation.sourceDocument}</Text>
  </View>;
}
export function PhoneNdefWorkbench({ active, store, onSaved, selectedSource }: { selectedSource?: { id: number; document: string; expectedPlatform: 'android' | 'ios'; receivedAt: string } | null; active: boolean; store: EvidenceStore; onSaved: () => Promise<void> }) {
  const [state, setState] = useState(initialPhoneNdefWorkbench);
  const current = useRef(state);
  const incomingSource = useRef(new AnalysisSourceGate()).current;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function send(action: PhoneNdefWorkbenchAction) {
    current.current = phoneNdefWorkbenchReducer(current.current, action);
    if (mounted.current) setState(current.current);
  }
  useEffect(() => {
    if (selectedSource && incomingSource.take(selectedSource)) send({ type: 'edit', document: selectedSource.document, expectedPlatform: selectedSource.expectedPlatform });
  }, [selectedSource]);
  async function save() {
    const snapshot = current.current;
    if (!canSavePhoneNdef(snapshot) || !snapshot.saveInput) return;
    send({ type: 'save-start' });
    try { await store.save(snapshot.saveInput); }
    catch (error) { send({ type: 'save-finish', revision: snapshot.revision, document: snapshot.document, error: String(error) }); return; }
    send({ type: 'save-finish', revision: snapshot.revision, document: snapshot.document });
    // Persistence already succeeded; a refresh failure must not unlock another save.
    if (mounted.current) await onSaved();
  }
  if (!active) return null;
  return <View style={styles.card}>
    <Text style={styles.heading}>Offline phone NDEF selected fields</Text>
    <Text style={styles.text}>Separate from the Serialized NDEF inspector. Import an exact react-native-nfc-manager 4.2.0 selected-field document. This card does not read tags. Devices can explicitly transfer a memory-only selected-field document here. No automatic display of interpretation or save. No model calls or URL actions. Native metadata reading is unchanged.</Text>
    <View style={styles.actions}>
      <Control title="Expect Android NDEF fields" disabled={state.pending !== null} onPress={() => send({ type: 'edit', document: state.document, expectedPlatform: 'android' })} />
      <Control title="Expect iOS NDEF fields" disabled={state.pending !== null} onPress={() => send({ type: 'edit', document: state.document, expectedPlatform: 'ios' })} />
      <Control title="Load synthetic Android NDEF fields" disabled={state.pending !== null} onPress={() => send({ type: 'edit', document: JSON.stringify(androidDemo, null, 2), expectedPlatform: 'android' })} />
      <Control title="Load synthetic iOS NDEF fields" disabled={state.pending !== null} onPress={() => send({ type: 'edit', document: JSON.stringify(iosDemo, null, 2), expectedPlatform: 'ios' })} />
    </View>
    <Text style={styles.text}>Expected platform: {state.expectedPlatform}. Android record IDs are hex strings; iOS record IDs are byte arrays. A source mismatch is rejected, never coerced. Unknown types remain opaque. Missing optional ID differs from a present empty ID.</Text>
    <Text style={styles.text}>Import limit: 40000 characters, 64 records, 8192 aggregate field bytes, 5 container levels. Exact journal document limit: 4096 characters, with existing journal total/depth limits unchanged. Oversized saves are rejected whole, never truncated.</Text>
    <TextInput accessibilityLabel="Phone NDEF selected-field document" multiline value={state.document}
      onChangeText={document => send({ type: 'edit', document })} style={styles.input} autoCapitalize="none" autoCorrect={false} />
    <Text style={styles.text}>{state.document.length} input characters. Draft survives tab changes. Loading and editing only preview the source; interpretation and saving are separate actions.</Text>
    <View style={styles.actions}>
      <Control title="Interpret phone NDEF fields" disabled={state.pending !== null} onPress={() => send({ type: 'interpret' })} />
      <Control title="Save phone NDEF source locally" disabled={!canSavePhoneNdef(state)} onPress={() => void save()} />
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {state.observation && <>
      <Text style={styles.text}>{state.savedDocument === state.document ? 'This exact NDEF document was saved locally.' : state.pending !== null ? 'Local save pending.' : 'Preview only. NDEF document not saved.'}</Text>
      <Findings observation={state.observation} />
    </>}
  </View>;
}
export function PhoneNdefEvidenceReopen({ record, store }: { record: EvidenceRecord; store: EvidenceStore }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof reopenPhoneNdefEvidence>> | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const locked = useRef(false);
  useEffect(() => {
    setResult(null); setMessage(''); setBusy(false); locked.current = false;
    return () => { request.current++; };
  }, [record]);
  async function open() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setResult(null); setMessage('Verifying retained NDEF document…');
    const token = ++request.current;
    try {
      const next = await reopenPhoneNdefEvidence(record, value => store.verify(value));
      if (token === request.current) { setResult(next); setMessage('Digest verified. Selected phone NDEF fields reinterpreted locally; original wire unavailable, reception and identity unverified.'); }
    } catch (error) { if (token === request.current) setMessage(String(error)); }
    finally { if (token === request.current) { locked.current = false; setBusy(false); } }
  }
  return <View style={styles.card}>
    <Control title={`Verify and reopen phone NDEF ${record.id}`} disabled={busy} onPress={() => void open()} />
    {!!message && <Text style={styles.text}>{message}</Text>}
    {result && <Findings observation={result.observation} />}
  </View>;
}
const styles = StyleSheet.create({
  card: { minWidth: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: '#414c37', borderRadius: 6 },
  heading: { color: '#d8ff6b', fontSize: 17, fontWeight: '600' },
  text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 },
  input: { minHeight: 180, maxHeight: 300, padding: 12, backgroundColor: '#11170f', color: '#c9d5bc', textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { padding: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 4 },
});
