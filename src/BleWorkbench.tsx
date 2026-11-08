import { AnalysisSourceGate } from './analysis-navigation.ts';
import { BleTrialStageGate } from './ble-trial-authoring-workbench.ts';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EvidenceRecord, EvidenceStore } from '../packages/core/evidence.ts';
import { MAX_IMPORT_CHARACTERS } from '../packages/core/ble-advertisements.ts';
import { bleWorkbenchReducer, bleReopenMessage, canSaveBle, initialBleWorkbench, reopenBleEvidence } from './ble-workbench.ts';
import type { BleWorkbenchAction } from './ble-workbench.ts';
import androidSource from './fixtures/ble-plx-android-source.json';
import iosSource from './fixtures/ble-plx-ios-source.json';
import type { BlePlxPreparation } from '../packages/core/ble-plx-observation.ts';
import demo from './fixtures/bthome-observation.json';
import type { BleObservation } from '../packages/core/ble-advertisements.ts';
import { explainBleFilter, formatBleFilterDiagnostic, BLE_FILTER_DIAGNOSTIC_LIMITS } from '../packages/core/ble-filter-diagnostic.ts';

function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
function FilterDiagnostic({ observation }: { observation: BleObservation | null }) {
  return <View style={styles.sourceSummary}>
    <Text style={styles.heading}>Offline filter diagnostic</Text>
    {['FCD2', 'FEAA'].map(uuid => <Text key={uuid} style={styles.text}>{formatBleFilterDiagnostic(explainBleFilter(observation, uuid))}</Text>)}
    <Text style={styles.text}>{BLE_FILTER_DIAGNOSTIC_LIMITS}</Text>
  </View>;
}
function SourceSummary({ source }: { source: BlePlxPreparation }) {
  return <View style={styles.sourceSummary}>
    <Text style={styles.heading}>{source.provenance.origin === 'synthetic-fixture' ? 'SYNTHETIC SELECTED SOURCE' : 'IMPORTED SELECTED SOURCE / UNVERIFIED'}</Text>
    <Text style={styles.text}>{source.platform} · {source.representation} · {source.status}</Text>
    <Text style={styles.text}>{source.retentionWarning}</Text>
    <Text style={styles.text}>Source label: {source.provenance.label}. Declared source time: {source.provenance.capturedAt ?? 'none (synthetic)'}. No reception or identity attestation.</Text>
  </View>;
}
export function BleWorkbench({ active, store, onSaved, selectedSource, onStageTrial }: { onStageTrial?: (document: string) => void; active: boolean; store: EvidenceStore; onSaved: () => Promise<void>; selectedSource?: { id: number; document: string } | null }) {
  const [state, setState] = useState(initialBleWorkbench);
  const current = useRef(state);
  const incomingSource = useRef(new AnalysisSourceGate()).current;
  const staging = useRef(new BleTrialStageGate()).current;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Synchronous ref transition also rejects double taps before React renders.
  function send(action: BleWorkbenchAction) {
    current.current = bleWorkbenchReducer(current.current, action);
    if (mounted.current) setState(current.current);
  }
  useEffect(() => {
    if (selectedSource && incomingSource.take(selectedSource)) send({ type: 'edit', mode: 'selected-source', document: selectedSource.document });
  }, [selectedSource]);
  async function save() {
    const snapshot = current.current;
    if (!canSaveBle(snapshot) || !snapshot.saveInput) return;
    send({ type: 'save-start' });
    try {
      await store.save(snapshot.saveInput);
    } catch (error) {
      send({ type: 'save-finish', revision: snapshot.revision, document: snapshot.document, error: String(error) }); return;
    }
    send({ type: 'save-finish', revision: snapshot.revision, document: snapshot.document });
    // A list-refresh failure must never invite a duplicate save of an already persisted record.
    await onSaved();
  }
  if (!active) return null;
  return <View style={styles.card}>
    <Text style={styles.heading}>Offline BLE / BTHome</Text>
    <Text style={styles.text}>Paste an Android scan-record or iOS normalized-fields JSON envelope. This does not scan, pair, decrypt or send data to a model. Recorded-import provenance is a source claim, not proof of reception or identity.</Text>
    <View style={styles.actions}>
      <Control title="Import offline BLE" disabled={state.pending !== null} onPress={() => send({ type: 'edit', mode: 'envelope', document: '' })} />
      <Control title="Load synthetic BTHome demo" disabled={state.pending !== null} onPress={() => send({ type: 'edit', mode: 'envelope', document: JSON.stringify(demo, null, 2) })} />
    </View>
    <View style={styles.actions}>
      <Control title="Import phone selected-source document" disabled={state.pending !== null} onPress={() => send({ type: 'edit', mode: 'selected-source', document: '' })} />
      <Control title="Load synthetic Android source" disabled={state.pending !== null} onPress={() => send({ type: 'edit', mode: 'selected-source', document: JSON.stringify(androidSource, null, 2) })} />
      <Control title="Load synthetic iOS source" disabled={state.pending !== null} onPress={() => send({ type: 'edit', mode: 'selected-source', document: JSON.stringify(iosSource, null, 2) })} />
    </View>
    <Text style={styles.heading}>{state.mode === 'selected-source' ? 'Phone selected-source document (offline)' : 'Offline envelope (projection only)'}</Text>
    <Text style={styles.text}>{state.mode === 'selected-source'
      ? 'Paste a BLE-PLX selected-source JSON document, not a Device object. Exact source text is retained only when you explicitly save. iOS rawScanRecord is opaque base64 JSON, never Android AD bytes. Complete selected fields are not a whole RF capture. Limit: 4096 characters.'
      : 'Legacy envelope saves retain only this projection, not the original SDK snapshot.'}</Text>
    <Text style={styles.text}>Editing never changes provenance automatically. Synthetic input must remain synthetic, including modified demo data. Envelope limit: 16384 characters; exact local journal document limit: 4096. Oversize input is rejected, never truncated.</Text>
    <TextInput accessibilityLabel="Offline BLE document" multiline value={state.document}
      onChangeText={document => send({ type: 'edit', document })} style={styles.input} autoCapitalize="none" autoCorrect={false} />
    <Text style={styles.text}>{state.document.length} / {state.mode === 'selected-source' ? 4096 : MAX_IMPORT_CHARACTERS} import characters</Text>
    <View style={styles.actions}>
      <Control title="Interpret offline BLE" disabled={state.pending !== null} onPress={() => send({ type: 'interpret' })} />
      {onStageTrial && <Control title="Stage selected BLE source for trial" disabled={!staging.available(state)} onPress={() => {
        const document = staging.take(current.current);
        if (document === null) return;
        onStageTrial(document);
      }} />}
      <Control title="Save BLE evidence locally" disabled={!canSaveBle(state)} onPress={() => void save()} />
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {state.source && <>
      <Text style={styles.text}>{state.savedDocument === state.document ? 'This exact document was saved locally.' : state.pending !== null ? 'Local save pending.' : 'Preview only. This document has not been saved by this workbench.'}</Text>
      <SourceSummary source={state.source} />
    </>}
    {(state.observation || state.source) && <FilterDiagnostic observation={state.observation} />}
    {state.observation && <>
      <Text style={styles.heading}>{state.observation.provenance.origin === 'synthetic-fixture' ? 'SYNTHETIC FIXTURE' : 'RECORDED IMPORT / UNVERIFIED'}</Text>
      <Text selectable style={styles.text}>{JSON.stringify(state.observation, null, 2)}</Text>
    </>}
  </View>;
}

export function BleEvidenceReopen({ record, store }: { record: EvidenceRecord; store: EvidenceStore }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof reopenBleEvidence>> | null>(null);
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
    locked.current = true; setBusy(true); setResult(null); setMessage('Verifying retained document…');
    const token = ++request.current;
    try {
      const next = await reopenBleEvidence(record, value => store.verify(value));
      if (token === request.current) { setResult(next); setMessage(bleReopenMessage(next.observation)); }
    } catch (error) { if (token === request.current) setMessage(String(error)); }
    finally { if (token === request.current) { locked.current = false; setBusy(false); } }
  }
  return <View style={styles.card}>
    <Control title={`Verify and reopen BLE ${record.id}`} disabled={busy} onPress={() => void open()} />
    {!!message && <Text style={styles.text}>{message}</Text>}
    {result && <>
      <FilterDiagnostic observation={result.observation} />
      {result.source && <SourceSummary source={result.source} />}
      {result.source && <Text selectable style={styles.text}>Exact retained selected-source document: {(result.record.payload as { document: string }).document}</Text>}
      <Text selectable style={styles.text}>{result.observation ? JSON.stringify(result.observation, null, 2) : 'No advertisement interpretation: Android raw scan bytes unavailable.'}</Text>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { minWidth: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: '#414c37', borderRadius: 6 },
  heading: { color: '#d8ff6b', fontSize: 17, fontWeight: '600' },
  text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 },
  input: { minHeight: 180, maxHeight: 300, padding: 12, backgroundColor: '#11170f', color: '#c9d5bc', textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sourceSummary: { minWidth: 0, alignSelf: 'stretch', gap: 8 },
  button: { padding: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 4 },
});
