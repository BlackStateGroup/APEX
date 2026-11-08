import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { BleTrialAuthoringWorkbench as Controller } from './ble-trial-authoring-workbench.ts';
import type { BleTrialSource } from '../packages/core/ble-trial-authoring.ts';
const PAGE = 4;
function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: .5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function BleTrialAuthoringWorkbench({ controller, onChanged, onUse }: { controller: Controller; onChanged: () => void; onUse: (document: string) => void }) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const currentFields = useRef(fields);
  const [pages, setPages] = useState({ sources: 0, trials: 0 });
  function run(action: () => void) {
    try { action(); } catch (error) { controller.message = `Authoring error: ${error instanceof Error ? error.message : String(error)}`; }
    onChanged();
  }
  function field(name: string, label: string) {
    return <View key={name}><Text style={styles.text}>{label}</Text><TextInput accessibilityLabel={label} value={fields[name] ?? ''} autoCapitalize="none" autoCorrect={false} style={styles.input}
      onChangeText={value => {
        controller.invalidate();
        if (value.length > 128) controller.message = 'Field edit rejected whole: 128 characters maximum. Built export cleared.';
        else { currentFields.current = { ...currentFields.current, [name]: value }; setFields(currentFields.current); controller.message = 'Form changed. Build again after applying entries.'; }
        onChanged();
      }} /></View>;
  }
  const get = (key: string) => currentFields.current[key] ?? '';
  const snapshot = controller.author?.snapshot();
  // Display metadata only. Never reconstruct the staged document for a trial.
  const staged = controller.staged === null ? null : JSON.parse(controller.staged);
  return <View style={styles.card}>
    <Text style={styles.heading}>Build BLE trial dataset</Text>
    <Text style={styles.text}>Memory only, lost on reload. For controlled authorized equipment. Ownership, conditions, aliases and receipt references are your declarations, not verified facts. No scanning, saving, identity inference or pooling. Staging never adds trials.</Text>
    {field('scope', 'Scope declaration (type owned-lab)')}{field('service', 'Selected service (FCD2 or FEAA)')}
    <Button title="Start new declared BLE draft" onPress={() => run(() => { controller.start(get('scope'), get('service')); setPages({ sources: 0, trials: 0 }); })} />
    <Text style={styles.text}>Starting replaces the entire in-memory authoring draft. Current service: {snapshot?.serviceUuid ?? 'not declared'}.</Text>
    <Text style={styles.text}>Staged exact document: {controller.staged === null ? 'none' : `${controller.staged.length} characters`}. Stage from the interpreted selected source in the BLE / BTHome inspector. Each Add/Replace trial uses this exact staged text without reconstruction.</Text>
    {staged && <Text selectable style={styles.text}>Staged declarations: platform {staged.platform}; origin {staged.provenance.origin}; snapshot ID {JSON.stringify(staged.snapshot.id)}. These do not establish identity or reception.</Text>}
    <Text style={styles.heading}>Explicit groups</Text>
    {field('groupId', 'Group ID')}{field('condition', 'Group condition')}
    <View style={styles.actions}>{[false, true].map(replace => <Button key={String(replace)} title={`${replace ? 'Replace' : 'Add'} declared group`} onPress={() => run(() => controller.edit('groups', { id: get('groupId'), condition: get('condition') }, replace))} />)}</View>
    {snapshot?.groups.map(group => <View key={group.id}><Text style={styles.text}>{JSON.stringify(group)}</Text><Button title={`Remove group ${group.id}`} onPress={() => run(() => controller.remove('groups', group.id))} /></View>)}
    <Text style={styles.heading}>Separate declared source aliases</Text>
    <Text style={styles.text}>Never infer identity from a snapshot ID. Android and iOS remain separate. Enter all declarations explicitly; snapshot mode must be null or string, including an empty string if intended.</Text>
    {field('sourceId', 'Source alias ID')}{field('platform', 'Declared platform (android or ios)')}{field('snapshotMode', 'Snapshot ID mode (null or string)')}{field('snapshotId', 'Declared snapshot ID string')}{field('origin', 'Declared origin (synthetic-fixture or recorded-import)')}
    <View style={styles.actions}>{[false, true].map(replace => <Button key={String(replace)} title={`${replace ? 'Replace' : 'Add'} declared source`} onPress={() => run(() => {
      controller.invalidate();
      if (!['null', 'string'].includes(get('snapshotMode'))) throw new Error('Declare snapshot mode null or string');
      controller.edit('sources', { id: get('sourceId'), platform: get('platform') as BleTrialSource['platform'], snapshotId: get('snapshotMode') === 'null' ? null : get('snapshotId'), origin: get('origin') as BleTrialSource['origin'] }, replace);
    })} />)}</View>
    <Text style={styles.heading}>Explicit trial and receipt references</Text>
    {field('trialId', 'Trial ID')}{field('trialGroup', 'Trial group ID')}{field('trialSource', 'Trial source alias ID')}{field('receipt', 'Trial receipt reference')}
    <View style={styles.actions}>{[false, true].map(replace => <Button key={String(replace)} title={`${replace ? 'Replace' : 'Add'} staged trial`} onPress={() => run(() => {
      controller.invalidate();
      if (controller.staged === null) throw new Error('Stage an interpreted selected-source document first');
      controller.edit('trials', { id: get('trialId'), groupId: get('trialGroup'), sourceId: get('trialSource'), receiptId: get('receipt'), document: controller.staged }, replace);
    })} />)}</View>
    {(['sources', 'trials'] as const).map(kind => {
      const rows = snapshot?.[kind] ?? [];
      const page = Math.min(pages[kind], Math.max(0, Math.ceil(rows.length / PAGE) - 1));
      return <View key={kind}><Text style={styles.text}>{kind}: {rows.length}; page {rows.length ? page + 1 : 0} of {Math.ceil(rows.length / PAGE)} (up to four rows).</Text>
        {rows.slice(page * PAGE, (page + 1) * PAGE).map(row => <View key={row.id}><Text selectable style={styles.text}>{JSON.stringify('document' in row ? { id: row.id, groupId: row.groupId, sourceId: row.sourceId, receiptId: row.receiptId, documentCharacters: row.document.length } : row)}</Text><Button title={`Remove ${kind} ${row.id}`} onPress={() => run(() => controller.remove(kind, row.id))} /></View>)}
        <View style={styles.actions}><Button title={`Previous authoring ${kind}`} disabled={page === 0} onPress={() => setPages({ ...pages, [kind]: page - 1 })} /><Button title={`Next authoring ${kind}`} disabled={(page + 1) * PAGE >= rows.length} onPress={() => setPages({ ...pages, [kind]: page + 1 })} /></View>
      </View>;
    })}
    <Text style={styles.text}>Replace requires an existing ID; add rejects duplicates. Referenced group/source removal is refused. Limits: 8 groups, 8 sources, 32 trials, 4096 characters per exact source, 196608 characters including JSON escaping. Build requires every source/group pair. Failed actions retain the draft and clear built output.</Text>
    <Button title="Build and validate BLE dataset" onPress={() => run(() => controller.build())} />
    <Button title="Use dataset in BLE comparison" disabled={!controller.built} onPress={() => run(() => { const document = controller.takeDocument(); if (document !== null) onUse(document); })} />
    {controller.built && <Text style={styles.text}>Validated in memory: {controller.built.report.trials.length} trials, {controller.built.report.sources.length} separate sources. Use replaces the comparison draft only; it does not Analyze. Declarations remain unverified. Byte differences do not establish identity, causality, sensor fields or chronology. Encrypted BTHome remains opaque.</Text>}
    <Text accessibilityLiveRegion="polite" style={styles.text}>{controller.message}</Text>
  </View>;
}
const styles = StyleSheet.create({ card: { gap: 12, padding: 18, borderWidth: 1, borderColor: '#414c37' }, heading: { color: '#d8ff6b', fontSize: 17 }, text: { color: '#b8c1af', flexShrink: 1 }, input: { color: '#c9d5bc', backgroundColor: '#11170f', padding: 10 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { padding: 12, borderWidth: 1, borderColor: '#414c37' } });
