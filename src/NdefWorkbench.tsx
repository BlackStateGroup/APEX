import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EvidenceRecord, EvidenceStore } from '../packages/core/evidence.ts';
import type { NdefObservation } from '../packages/core/ndef-offline.ts';
import { ndefWorkbenchReducer, canSaveNdef, initialNdefWorkbench, reopenNdefEvidence } from './ndef-workbench.ts';
import type { NdefWorkbenchAction } from './ndef-workbench.ts';
import textDemo from './fixtures/ndef-text.json';
import uriDemo from './fixtures/ndef-uri.json';

function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
/** JSON quoting makes controls visible. Values remain inert text, never links or markup. */
function Findings({ observation }: { observation: NdefObservation }) {
  return <View style={styles.card}>
    <Text style={styles.heading}>{observation.provenance.origin === 'synthetic-fixture' ? 'SYNTHETIC NDEF FIXTURE' : 'RECORDED NDEF IMPORT / UNVERIFIED'}</Text>
    <Text selectable style={styles.text}>Caller label: {JSON.stringify(observation.provenance.label)}</Text>
    <Text style={styles.text}>Reception, identity and authentication unverified. Status: {observation.decoded.status}. Parsed does not mean certified conformance or safe content.</Text>
    {observation.decoded.records.map((record, index) => <View key={record.offset}>
      <Text style={styles.heading}>Record {index + 1} · bytes {record.offset}–{record.endOffset} · TNF {record.tnf}</Text>
      <Text selectable style={styles.text}>{record.value.kind === 'text'
        ? `Text (${record.value.encoding}, language ${JSON.stringify(record.value.language)}): ${JSON.stringify(record.value.text)}`
        : record.value.kind === 'uri' ? `URI text (not actionable): ${JSON.stringify(record.value.uri)}`
        : record.value.kind === 'empty' ? 'Empty record' : `${record.value.kind}: ${record.value.reason}`}</Text>
      <Text selectable style={styles.text}>Retained raw record: {record.rawHex}</Text>
    </View>)}
    <Text selectable style={styles.text}>Issues: {JSON.stringify(observation.decoded.issues)}{ '\n' }Unparsed tail: {observation.decoded.unparsedHex || '(none)'}</Text>
    <Text style={styles.heading}>Retained bytes, fields and exact source</Text>
    <Text selectable style={styles.text}>{JSON.stringify(observation, null, 2)}</Text>
  </View>;
}
export function NdefWorkbench({ active, store, onSaved }: { active: boolean; store: EvidenceStore; onSaved: () => Promise<void> }) {
  const [state, setState] = useState(initialNdefWorkbench);
  const current = useRef(state);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function send(action: NdefWorkbenchAction) {
    current.current = ndefWorkbenchReducer(current.current, action);
    if (mounted.current) setState(current.current);
  }
  async function save() {
    const snapshot = current.current;
    if (!canSaveNdef(snapshot) || !snapshot.saveInput) return;
    send({ type: 'save-start' });
    try { await store.save(snapshot.saveInput); }
    catch (error) { send({ type: 'save-finish', revision: snapshot.revision, document: snapshot.document, error: String(error) }); return; }
    send({ type: 'save-finish', revision: snapshot.revision, document: snapshot.document });
    // Persistence already succeeded; a refresh failure must not unlock another save.
    if (mounted.current) await onSaved();
  }
  if (!active) return null;
  return <View style={styles.card}>
    <Text style={styles.heading}>Offline NDEF messages</Text>
    <Text style={styles.text}>Explicitly serialized NDEF message bytes only, not native tag dictionaries or tag-memory dumps. No tag reading, URL opening, credential emulation or model calls. Native NFC remains metadata-only.</Text>
    <View style={styles.actions}>
      <Control title="Import offline NDEF" disabled={state.pending !== null} onPress={() => send({ type: 'edit', document: '' })} />
      <Control title="Load synthetic NDEF Text" disabled={state.pending !== null} onPress={() => send({ type: 'edit', document: JSON.stringify(textDemo, null, 2) })} />
      <Control title="Load synthetic NDEF URI" disabled={state.pending !== null} onPress={() => send({ type: 'edit', document: JSON.stringify(uriDemo, null, 2) })} />
    </View>
    <Text style={styles.text}>Paste the strict JSON envelope (schemaVersion, inputKind, provenance, messageHex). Origin is a caller claim. Editing a synthetic fixture does not turn it into a recording. Import limit: 20000 characters / 8192 bytes; exact journal limit: 4096 characters. Oversized saves are rejected whole, never truncated.</Text>
    <TextInput accessibilityLabel="Offline NDEF document" multiline value={state.document}
      onChangeText={document => send({ type: 'edit', document })} style={styles.input} autoCapitalize="none" autoCorrect={false} />
    <Text style={styles.text}>{state.document.length} input characters. Loading and editing only preview the source; interpretation and saving are separate actions.</Text>
    <View style={styles.actions}>
      <Control title="Interpret offline NDEF" disabled={state.pending !== null} onPress={() => send({ type: 'interpret' })} />
      <Control title="Save NDEF evidence locally" disabled={!canSaveNdef(state)} onPress={() => void save()} />
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {state.observation && <>
      <Text style={styles.text}>{state.savedDocument === state.document ? 'This exact NDEF document was saved locally.' : state.pending !== null ? 'Local save pending.' : 'Preview only. NDEF document not saved.'}</Text>
      <Findings observation={state.observation} />
    </>}
  </View>;
}
export function NdefEvidenceReopen({ record, store }: { record: EvidenceRecord; store: EvidenceStore }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof reopenNdefEvidence>> | null>(null);
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
      const next = await reopenNdefEvidence(record, value => store.verify(value));
      if (token === request.current) { setResult(next); setMessage('Digest verified. NDEF reinterpreted locally; reception and identity still unverified.'); }
    } catch (error) { if (token === request.current) setMessage(String(error)); }
    finally { if (token === request.current) { locked.current = false; setBusy(false); } }
  }
  return <View style={styles.card}>
    <Control title={`Verify and reopen NDEF ${record.id}`} disabled={busy} onPress={() => void open()} />
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
