import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { RESEARCH_FUNCTIONS } from '../packages/core/research-jobs.ts';
import type { ResearchJob, ResearchResult, ResearchTarget, ResearchRequest } from '../packages/core/research-jobs.ts';
import { ResearchClient, saveResearchCase } from './research-client.ts';
import { hciDigest } from './platform/hci-digest';
import { caseStore } from './platform/cases';

function Button({ title, onPress, disabled = false }: { title: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: 0.4 }]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
export function ResearchWorker({ active }: { active: boolean }) {
  const [endpoint, setEndpoint] = useState(''), [token, setToken] = useState('');
  const [targets, setTargets] = useState<ResearchTarget[]>([]), [target, setTarget] = useState<ResearchTarget | null>(null);
  const [jobs, setJobs] = useState<ResearchJob[]>([]), [selected, setSelected] = useState<ResearchJob | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null), [message, setMessage] = useState('No worker connected.');
  const [connected, setConnected] = useState(false), [blocked, setBlocked] = useState(false), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const client = useRef<ResearchClient | null>(null), epoch = useRef(0), mounted = useRef(true), held = useRef(false);
  const pending = useRef<ResearchRequest | null>(null);
  function disconnect() {
    epoch.current++; client.current?.disconnect(); client.current = null; pending.current = null;
    if (!mounted.current) return;
    setToken(''); setConnected(false); setTargets([]); setTarget(null); setJobs([]); setSelected(null); setResult(null); setSaved(false); setBusy(false);
    setMessage('Disconnected. Submitted jobs remain on the worker. Reconnect to inspect or cancel them.');
  }
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') disconnect(); });
    return () => { mounted.current = false; epoch.current++; client.current?.disconnect(); listener.remove(); };
  }, []);
  useEffect(() => { if (!active) disconnect(); }, [active]);
  function run(action: (valid: () => boolean) => Promise<void>) {
    if (!active || held.current || AppState.currentState !== 'active') return;
    held.current = true; setBusy(true); const at = epoch.current;
    const valid = () => mounted.current && at === epoch.current;
    void action(valid).catch(error => { if (valid()) setMessage(error instanceof Error ? error.message : 'Research operation failed.'); })
      .finally(() => { held.current = false; if (valid()) setBusy(false); });
  }
  async function submit(symbol: string | null, valid: () => boolean) {
    const request: ResearchRequest = { requestId: Crypto.randomUUID(), targetSha256: target!.sha256, operation: symbol ? 'ghidra-function' : 'elf-notes', symbol };
    // Reuse an uncertain submission's ID; never create a duplicate because a response was lost.
    if (pending.current && (pending.current.targetSha256 !== request.targetSha256 || pending.current.symbol !== symbol)) throw new Error('Retry the uncertain submission or disconnect and inspect worker jobs first.');
    pending.current ??= request;
    setMessage('Submitting. If the response is lost, retrying this operation uses the same job ID.');
    const job = await client.current!.submit(pending.current);
    if (!valid()) return;
    pending.current = null; setSelected(job); setJobs(old => [job, ...old.filter(j => j.id !== job.id)]); setResult(null); setSaved(false);
    setMessage('Job accepted and stored on the worker. Refresh jobs to check progress.');
  }
  if (!active) return null;
  return <View style={s.card}>
    <Text style={s.eyebrow}>REA / RESEARCH WORKER</Text><Text style={s.title}>Run analysis. Keep the evidence.</Text>
    <Text style={s.body}>Connect to your analysis host, choose a registered firmware file and run REA. Firmware stays on the worker. Results can be saved into Cases.</Text>
    <TextInput accessibilityLabel="Research worker HTTPS address" placeholder="https://your-analysis-host:8443" placeholderTextColor="#858f82" value={endpoint} editable={!connected && !busy} onChangeText={setEndpoint} autoCapitalize="none" autoCorrect={false} style={s.input} />
    <TextInput accessibilityLabel="Research worker access token" placeholder="Worker access token" placeholderTextColor="#858f82" value={token} editable={!connected && !busy} onChangeText={setToken} secureTextEntry autoCapitalize="none" autoCorrect={false} style={s.input} />
    <Text style={s.muted}>The token stays in memory and is cleared when you leave this view. Connecting shares requests with the address above. No connection happens automatically.</Text>
    <View style={s.actions}>
      <Button title="Connect research worker" disabled={connected || busy || !endpoint || !token} onPress={() => run(async valid => {
        const next = new ResearchClient(endpoint, token, hciDigest); client.current = next;
        try {
          const catalogue = await next.catalogue(), history = await next.jobs();
          if (!valid()) return;
          setTargets(catalogue.targets); setTarget(catalogue.targets[0]!); setJobs(history); setBlocked(catalogue.blocked); setConnected(true); setToken('');
          setMessage(catalogue.blocked ? 'Worker paused: earlier process cleanup is unverified. Existing results remain available.' : 'Worker connected. Select an operation to start analysis.');
        } catch (error) { next.disconnect(); if (valid()) client.current = null; throw error; }
      })} />
      <Button title="Disconnect research worker" disabled={!client.current} onPress={disconnect} />
    </View>
    {connected && <>
      <Text style={s.heading}>Registered firmware</Text>
      {targets.map(t => <View key={t.sha256}><Button title={`Select ${t.label}`} disabled={busy || !!pending.current} onPress={() => setTarget(t)} /><Text selectable style={s.muted}>{t.bytes} bytes · {t.sha256}</Text></View>)}
      {target && <View style={s.actions}><Text style={s.body}>Selected: {target.label}</Text>
        <Button title="Inspect ELF notes" disabled={busy || blocked} onPress={() => run(valid => submit(null, valid))} />
        {RESEARCH_FUNCTIONS.map(name => <Button key={name} title={`Decompile ${name}`} disabled={busy || blocked} onPress={() => run(valid => submit(name, valid))} />)}
      </View>}
      <Text style={s.muted}>Decompilation requires the worker's configured Ghidra engine. Targets are read, never executed. Host analysis does not establish real-device behaviour.</Text>
      <Button title="Refresh research jobs" disabled={busy} onPress={() => run(async valid => {
        const history = await client.current!.jobs(), catalogue = await client.current!.catalogue();
        if (!valid()) return;
        setJobs(history); setBlocked(catalogue.blocked);
        if (selected) setSelected(history.find(j => j.id === selected.id) ?? null);
        setMessage('Worker job states refreshed.');
      })} />
      {jobs.map(job => <Button key={job.id} title={`Open ${job.request.operation} ${job.id}`} disabled={busy} onPress={() => { setSelected(job); setResult(null); setSaved(false); }} />)}
      {selected && <View style={s.result}>
        <Text accessibilityLabel="Research job state" style={s.heading}>{selected.state}</Text><Text selectable style={s.muted}>{selected.id}{selected.error ? ` · ${selected.error}` : ''}</Text>
        <View style={s.actions}>
          <Button title="Cancel research job" disabled={busy || !['queued', 'running', 'cancelling'].includes(selected.state)} onPress={() => run(async valid => {
            const next = await client.current!.cancel(selected); if (!valid()) return;
            setSelected(next); setJobs(old => old.map(j => j.id === next.id ? next : j)); setResult(null);
            setMessage(next.state === 'cancelled' ? 'Cancellation completed.' : 'Cancellation requested. Refresh to verify the final state.');
          })} />
          <Button title="Fetch and verify research result" disabled={busy || selected.state !== 'succeeded'} onPress={() => run(async valid => {
            const output = await client.current!.result(selected); if (!valid()) return;
            setResult(output); setSaved(false); setMessage('Result matches this job and its output digest. The analysis host is still the source of these claims.');
          })} />
        </View>
      </View>}
      {result && <>
        <TextInput accessibilityLabel="Verified research output" multiline editable={false} value={result.output} style={[s.input, s.document]} />
        <Button title="Save research result as a new case" disabled={busy || saved} onPress={() => run(async valid => {
          const sourceEndpoint = client.current!.endpoint;
          const c = await saveResearchCase(caseStore, sourceEndpoint, result);
          if (valid()) { setSaved(true); setMessage(`Saved ${c.title}. Open Cases to review or export the source reference and linked result.`); }
        })} />
      </>}
    </>}
    <Text accessibilityLiveRegion="polite" style={s.notice}>{message}</Text>
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: '#151a14', borderWidth: 1, borderColor: '#303a29', borderRadius: 14, padding: 18, gap: 14, marginVertical: 14 },
  eyebrow: { color: '#c5f179', fontSize: 11, letterSpacing: 1.5 }, title: { color: '#eef3e9', fontSize: 26, fontWeight: '600' },
  heading: { color: '#e7eddf', fontSize: 18, fontWeight: '600' }, body: { color: '#b8c1af', fontSize: 14, lineHeight: 22 }, muted: { color: '#9eab93', fontSize: 12, lineHeight: 19 },
  input: { backgroundColor: '#0c110b', borderColor: '#3a4532', borderWidth: 1, borderRadius: 8, padding: 12, color: '#e6eddf', fontSize: 13, minHeight: 48 },
  document: { minHeight: 180, maxHeight: 320, textAlignVertical: 'top', fontFamily: 'monospace' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { backgroundColor: '#23301b', borderWidth: 1, borderColor: '#465738', borderRadius: 8, padding: 13, minHeight: 46 }, buttonText: { color: '#d8ff9e', fontSize: 13 }, result: { gap: 12 }, notice: { color: '#d8ff9e', fontSize: 14, lineHeight: 22 },
});
