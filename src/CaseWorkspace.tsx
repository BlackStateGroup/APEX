import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { caseStore } from './platform/cases';
import { evidenceStore } from './platform/evidence';
import { EvidenceShare } from './platform/evidence-share';
import { CaseFileInput } from './platform/case-file-input';
import type { CaseArtifact, CaseDocument } from '../packages/core/case-store.ts';
import { applyPairedProfile, learnPairedProfile, readPairedDataset, readPairedProfile, replayPairedObservations } from '../packages/core/paired-observations.ts';
import { pairedExample } from './fixtures/paired-example.ts';

function Button({ title, onPress, disabled = false }: { title: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: 0.4 }]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
export function CaseWorkspace({ active }: { active: boolean }) {
  const [cases, setCases] = useState<CaseDocument[]>([]), [selected, setSelected] = useState<CaseDocument | null>(null);
  const [title, setTitle] = useState(''), [sourceName, setSourceName] = useState('Observation dataset'), [draft, setDraft] = useState('');
  const [selection, setSelection] = useState<string | null>(null), [profileId, setProfileId] = useState<string | null>(null);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [exported, setExported] = useState<string | null>(null);
  const [restore, setRestore] = useState(''), [deleteTitle, setDeleteTitle] = useState('');
  const [journal, setJournal] = useState<string[]>([]);
  const mounted = useRef(true), running = useRef(false), visible = useRef(active), generation = useRef(0);
  visible.current = active;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function current(epoch: number) { return mounted.current && visible.current && generation.current === epoch; }
  async function refresh() {
    const result = await caseStore.list(); setCases(result.cases);
    if (result.rejected) setMessage(`${result.rejected} damaged case(s) retained in storage and excluded from verified results.`);
  }
  useEffect(() => {
    const epoch = ++generation.current;
    if (active) void caseStore.list().then(result => {
      if (!current(epoch)) return;
      setCases(result.cases); if (result.rejected) setMessage(`${result.rejected} damaged case(s) retained in storage.`);
    }).catch(error => { if (current(epoch)) setMessage(String(error.message)); });
  }, [active]);
  function run(action: () => Promise<string | void>) {
    if (running.current || !active || AppState.currentState !== 'active') return;
    running.current = true; setBusy(true); setMessage('Working locally…'); setExported(null);
    void action().then(async notice => { await refresh(); if (mounted.current) setMessage(notice ?? 'Saved and verified locally.'); })
      .catch(error => { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Case operation failed.'); })
      .finally(() => { running.current = false; if (mounted.current) setBusy(false); });
  }
  function choose(c: CaseDocument) { setSelected(c); setSelection(null); setProfileId(null); setExported(null); setDeleteTitle(''); }
  async function append(input: Parameters<typeof caseStore.append>[2], base = selected!) {
    const result = await caseStore.append(base.id, base.revision, input); setSelected(result.case); setSelection(result.case.artifacts.at(-1)?.id ?? null); return result;
  }
  const item = selected?.artifacts.find(a => a.id === selection);
  const profile = selected?.artifacts.find(a => a.id === profileId);
  function pairedSource(a: CaseArtifact | undefined) {
    if (!a || a.kind !== 'source') return false;
    try { return readPairedDataset(a.content).origin === a.origin; } catch { return false; }
  }
  async function learn() {
    const source = item!;
    const result = learnPairedProfile(source.content, source.contentSha256);
    const analysis = await append({ name: 'Paired learning validation', kind: 'analysis', origin: 'derived', content: JSON.stringify(result), parents: [source.id] });
    if (!result.profile) return `Abstained: ${result.failures.join('; ')}`;
    const analysisId = analysis.case.artifacts.find(a => a.content === JSON.stringify(result) && a.parents.includes(source.id))!.id;
    await append({ name: 'Paired observation profile', kind: 'profile', origin: 'derived', content: JSON.stringify(result.profile), parents: [source.id, analysisId] }, analysis.case);
    return 'Profile saved for this declared dataset. Physical validation remains unverified.';
  }
  if (!active) return null;
  return <View style={s.root}>
    <Text style={s.eyebrow}>CASES / OBSERVATIONS / LEARNING</Text><Text style={s.title}>Keep the whole investigation.</Text>
    <Text style={s.body}>Retain original inputs, replay paired observations and save reusable research profiles. Cases stay on this device until you export them.</Text>
    <View style={s.card}><Text style={s.heading}>Your cases</Text>
      <TextInput accessibilityLabel="New case title" placeholder="Name this investigation" placeholderTextColor="#858f82" value={title} maxLength={120} editable={!busy} onChangeText={setTitle} style={s.input} />
      <View style={s.actions}><Button title="Create case" disabled={busy || !title.trim()} onPress={() => run(async () => { choose(await caseStore.create(title)); setTitle(''); })} />
        <Button title="Reload cases" disabled={busy} onPress={() => run(async () => { if (selected) setSelected(await caseStore.open(selected.id)); })} /></View>
      {!cases.length && <Text style={s.body}>No saved cases yet.</Text>}
      {cases.map(c => <Button key={c.id} title={`Open ${c.title}`} disabled={busy} onPress={() => run(async () => { choose(await caseStore.open(c.id)); })} />)}
    </View>
    {selected && <View style={s.card}>
      <Text style={s.eyebrow}>LOCAL CASE · REVISION {selected.revision}</Text><Text style={s.heading}>{selected.title}</Text>
      <Text style={s.muted}>{selected.artifacts.length} retained items · Digests checked when opened. Storage is not encrypted by APEX.</Text>
      <TextInput accessibilityLabel="Source name" value={sourceName} editable={!busy} maxLength={120} onChangeText={setSourceName} style={s.input} />
      <TextInput accessibilityLabel="Case source input" multiline value={draft} editable={!busy} maxLength={65536} onChangeText={setDraft} style={[s.input, s.document]} autoCapitalize="none" autoCorrect={false} />
      <CaseFileInput disabled={busy} maxBytes={65536} onDocument={text => { setDraft(text); setMessage('Selected text loaded. Save original source to retain it.'); }} />
      <View style={s.actions}><Button title="Load synthetic paired example" disabled={busy} onPress={() => { setDraft(pairedExample()); setSourceName('Synthetic paired observations'); }} />
        <Button title="Save original source" disabled={busy || !draft || !sourceName.trim()} onPress={() => run(async () => {
          let origin: 'synthetic' | 'operator-import' = 'operator-import';
          try { origin = readPairedDataset(draft).origin; } catch { /* Generic retained input; paired analysis is unavailable. */ }
          const result = await append({ name: sourceName, kind: 'source', origin, content: draft });
          setDraft(''); return result.duplicate ? 'Identical source already retained; no duplicate added.' : 'Original source retained exactly.';
        })} /></View>
      <Text style={s.muted}>Paired input accepts up to 128 BLE/ranging rows with session splits, controls, missing values and an independent clock estimate. The example is synthetic.</Text>
      <Button title="Load saved evidence journal" disabled={busy} onPress={() => run(async () => { setJournal(await evidenceStore.listDocuments(30)); return 'Select a journal record to retain its original envelope.'; })} />
      {journal.map((document, n) => <Button key={n} title={`Attach journal record ${n + 1}`} disabled={busy} onPress={() => run(async () => {
        const r = JSON.parse(document); if (!await evidenceStore.verify(r)) throw new Error('Journal digest mismatch');
        await append({ name: `${r.kind} / ${n + 1}`, kind: 'source', origin: r.source === 'offline-fixture' ? 'synthetic' : 'operator-import', content: document });
      })} />)}
      <Text style={s.heading}>Sources and results</Text>
      {selected.artifacts.map(a => <View style={s.item} key={a.id}>
        <Text style={s.muted}>{a.kind.toUpperCase()} · {a.origin} · {a.parents.length} parent(s)</Text>
        <Button title={`View ${a.name}`} disabled={busy} onPress={() => setSelection(a.id)} />
        {a.kind === 'profile' && <Button title={`Use ${a.name}`} disabled={busy} onPress={() => { setProfileId(a.id); setMessage('Profile selected. Select an unseen paired source, then Apply selected profile.'); }} />}
      </View>)}
      {item && <View style={s.result}>
        <Text style={s.heading}>{item.name}</Text><Text selectable style={s.muted}>SHA-256 {item.contentSha256}</Text>
        <TextInput accessibilityLabel="Retained item content" multiline editable={false} value={item.content} style={[s.input, s.document, s.code]} />
        {pairedSource(item) && <View style={s.actions}>
          <Button title="Replay paired observations" disabled={busy} onPress={() => run(async () => { await append({ name: 'Paired observation replay', kind: 'analysis', origin: 'derived', content: JSON.stringify(replayPairedObservations(item.content)), parents: [item.id] }); })} />
          <Button title="Learn and validate profile" disabled={busy} onPress={() => run(learn)} />
          <Button title="Apply selected profile" disabled={busy || !profile} onPress={() => run(async () => {
            const p = readPairedProfile(profile!.content);
            const source = selected.artifacts.find(a => a.contentSha256 === p.sourceSha256 && profile!.parents.includes(a.id));
            if (!source || JSON.stringify(learnPairedProfile(source.content, source.contentSha256).profile) !== JSON.stringify(p)) throw new Error('Profile cannot be reproduced from its retained source');
            await append({ name: 'Profile application', kind: 'analysis', origin: 'derived', content: JSON.stringify(applyPairedProfile(profile!.content, item.content)), parents: [profile!.id, item.id] });
          })} />
        </View>}
      </View>}
      <Button title="Prepare case export" disabled={busy} onPress={() => run(async () => { setExported(await caseStore.export(selected.id)); return 'Verified case export prepared with all retained originals and results.'; })} />
      {exported && <View style={s.result}><Text style={s.muted}>Contains original inputs and identifiers. Keep a copy before deleting local data.</Text><TextInput accessibilityLabel="Verified case export" multiline editable={false} value={exported} style={[s.input, s.document]} />
        <EvidenceShare document={exported} preparationId={selected.revision} sourceCurrent={() => visible.current && !running.current} />
      </View>}
      <Text style={s.muted}>Delete removes this case and all its retained items from this device. Exported copies remain wherever you saved them.</Text>
      <TextInput accessibilityLabel="Case title to confirm deletion" placeholder="Type the case title to delete" placeholderTextColor="#858f82" editable={!busy} value={deleteTitle} onChangeText={setDeleteTitle} style={s.input} />
      <Button title="Delete this local case" disabled={busy || deleteTitle !== selected.title} onPress={() => run(async () => { await caseStore.remove(selected.id, selected.revision); setSelected(null); setSelection(null); setDeleteTitle(''); return 'Local case deleted.'; })} />
    </View>}
    <View style={s.card}><Text style={s.heading}>Restore a case</Text><Text style={s.body}>Digest and lineage checks run before saving. An existing case cannot be overwritten by an import.</Text>
      <TextInput accessibilityLabel="Case restore input" multiline editable={!busy} value={restore} onChangeText={setRestore} maxLength={1048576} style={[s.input, s.document]} autoCapitalize="none" autoCorrect={false} />
      <CaseFileInput disabled={busy} maxBytes={1048576} onDocument={setRestore} />
      <Button title="Verify and restore case" disabled={busy || !restore} onPress={() => run(async () => { const result = await caseStore.restore(restore); choose(result.case); setRestore(''); return result.duplicate ? 'This exact case already exists.' : 'Case restored and verified.'; })} />
    </View>
    <Text accessibilityLiveRegion="polite" style={s.notice}>{message}</Text>
  </View>;
}
const s = StyleSheet.create({
  root: { gap: 18 }, eyebrow: { color: '#c5f179', fontSize: 11, letterSpacing: 1.5 }, title: { color: '#eef3e9', fontSize: 30, fontWeight: '600' },
  heading: { color: '#e7eddf', fontSize: 18, fontWeight: '600' }, body: { color: '#b8c1af', fontSize: 14, lineHeight: 22 }, muted: { color: '#9eab93', fontSize: 12, lineHeight: 19 },
  card: { backgroundColor: '#151a14', borderWidth: 1, borderColor: '#303a29', borderRadius: 14, padding: 18, gap: 14 }, input: { backgroundColor: '#0c110b', borderColor: '#3a4532', borderWidth: 1, borderRadius: 8, padding: 12, color: '#e6eddf', fontSize: 13, minHeight: 48 },
  document: { minHeight: 130, maxHeight: 240, textAlignVertical: 'top' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, button: { backgroundColor: '#23301b', borderWidth: 1, borderColor: '#465738', borderRadius: 8, padding: 13, minHeight: 46 }, buttonText: { color: '#d8ff9e', fontSize: 13 },
  item: { gap: 8, paddingVertical: 10, borderTopWidth: 1, borderColor: '#303a29' }, result: { gap: 12 }, code: { color: '#b9c7ac', fontFamily: 'monospace', fontSize: 11, lineHeight: 18 }, notice: { color: '#d8ff9e', fontSize: 14, lineHeight: 22 },
});
