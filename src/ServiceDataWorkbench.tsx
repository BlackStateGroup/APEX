import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { startSelectedServiceDataObservation } from './platform/bluetooth';
import { createServiceDataWorkbench, initialServiceDataWorkbench } from './service-data-workbench.ts';
function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function ServiceDataWorkbench(props: {
  active: boolean; blocked: boolean; resetVersion: number; canStart(): boolean;
  onBusy(value: boolean): void; onUncertainty(value: boolean): void; onInspect(document: string): void;
}) {
  const [state, setState] = useState(initialServiceDataWorkbench);
  const latest = useRef(props); latest.current = props;
  const controller = useRef<ReturnType<typeof createServiceDataWorkbench> | null>(null);
  useEffect(() => {
    const current = createServiceDataWorkbench({ start: startSelectedServiceDataObservation,
      canStart: () => Platform.OS === 'android' && AppState.currentState === 'active' && latest.current.active && !latest.current.blocked && latest.current.canStart(),
      clock: () => new Date().toISOString(), changed: setState,
      busy: value => latest.current.onBusy(value), uncertainty: value => latest.current.onUncertainty(value) });
    controller.current = current; setState(current.state);
    const lifecycle = AppState.addEventListener('change', value => { if (value === 'background') current.stop('background'); });
    return () => { lifecycle.remove(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, []);
  useEffect(() => { if (!props.active) controller.current?.stop(); }, [props.active]);
  useEffect(() => { if (props.resetVersion) controller.current?.resetConfirmed(); }, [props.resetVersion]);
  if (!props.active) return null;
  const collecting = state.phase !== 'idle';
  const unavailable = Platform.OS !== 'android' || props.blocked || state.uncertain;
  return <View style={styles.card}>
    <Text style={styles.heading}>Experimental Android service-data observation</Text>
    <Text style={styles.text}>Use only with devices you own or are authorized to test. Separate from advertised-UUID observation: the SDK receives all nearby advertisements transiently, then JavaScript selects FCD2 or FEAA service-data matches. Matching selected sources can include unrelated fields.</Text>
    <Text style={styles.text}>Cooperative limits: 10 seconds including preparation, 100 total callbacks, 25 retained matches, 65536 serialized characters. These are not hard native cache or bridge queue bounds, and cannot guarantee wall-clock stopping during JavaScript suspension. No OS cache erasure or RF-passive guarantee. No connections, writes, automatic saves or provider submission.</Text>
    {Platform.OS !== 'android' && <Text style={styles.text}>{Platform.OS === 'ios' ? 'Unavailable on iOS: the pinned native bridge lacks destruction completion acknowledgement.' : 'Unavailable on web: this mode requires a native Android development build.'}</Text>}
    {props.blocked && <Text style={styles.text}>Stop other observation, NFC and accessory work and disconnect device sessions first.</Text>}
    <Text style={styles.heading}>Selected service-data: {state.service}</Text>
    <View style={styles.actions}>
      <Control title="Select service-data FCD2" disabled={collecting} onPress={() => controller.current?.select('FCD2')} />
      <Control title="Select service-data FEAA" disabled={collecting} onPress={() => controller.current?.select('FEAA')} />
      <Control title={state.optedIn ? 'Withdraw service-data session opt-in' : 'Opt in to broad SDK reception for one session'} disabled={collecting || unavailable} onPress={() => controller.current?.optIn()} />
      <Control title="Start service-data observation" disabled={collecting || unavailable || !state.optedIn} onPress={() => controller.current?.start()} />
      <Control title="Stop service-data observation" disabled={!collecting || state.phase === 'stopping'} onPress={() => controller.current?.stop()} />
      <Control title="Clear unsaved service-data sources" disabled={collecting || !state.items.length} onPress={() => controller.current?.clear()} />
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    <Text style={styles.text}>Completion reason: {state.reason}</Text>
    {state.metrics && <Text style={styles.text}>Total callbacks: {state.metrics.total} · Matches: {state.metrics.match} · Nonmatches: {state.metrics.noMatch} · Unavailable: {state.metrics.unavailable} · Malformed: {state.metrics.malformed} · SDK errors: {state.metrics.sdkErrors} · Retained: {state.metrics.retained} · Serialized characters: {state.metrics.characters}</Text>}
    <Text style={styles.text}>Receipt times are app callback times, not hardware transmission times. Repeated callbacks need not be distinct radio packets. No matches does not prove absence, identity, ownership or complete capture. No native phone validation has been performed.</Text>
    {state.items.slice(state.page * 4, state.page * 4 + 4).map(item => <View key={item.id} style={styles.item}>
      <Text style={styles.text}>Selected source {item.id} · {item.serviceUuid} · {item.rssiDbm ?? '?'} dBm · App receipt {item.callbackReceivedAt}</Text>
      <Control title={`Inspect service-data source ${item.id}`} disabled={collecting || state.uncertain} onPress={() => { const document = controller.current?.document(item.id); if (document) props.onInspect(document); }} />
    </View>)}
    {!!state.items.length && <><Text style={styles.text}>Page {state.page + 1} of {Math.ceil(state.items.length / 4)}. Inspect replaces the BLE Analysis input with this exact selected source. Interpret and save there explicitly.</Text><View style={styles.actions}>
      <Control title="Previous service-data page" disabled={state.page === 0} onPress={() => controller.current?.page(-1)} />
      <Control title="Next service-data page" disabled={(state.page + 1) * 4 >= state.items.length} onPress={() => controller.current?.page(1)} />
    </View></>}
  </View>;
}
const styles = StyleSheet.create({ card: { minWidth: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: '#414c37', borderRadius: 6 }, heading: { color: '#d8ff6b', fontSize: 17, fontWeight: '600' }, text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, item: { gap: 8, minWidth: 0 }, button: { padding: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 4 } });
