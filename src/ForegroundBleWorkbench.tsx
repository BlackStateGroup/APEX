import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { startForegroundObservation } from './platform/bluetooth';
import { createForegroundBleWorkbench, initialForegroundBle } from './foreground-ble-workbench.ts';

function Control({ title, disabled = false, onPress }: { title: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function ForegroundBleWorkbench(props: {
  active: boolean; blocked: boolean; resetVersion: number; canStart(): boolean; onBusy(value: boolean): void; onUncertainty(value: boolean): void; onInspect(document: string): void;
}) {
  const [state, setState] = useState(initialForegroundBle);
  const latest = useRef(props); latest.current = props;
  const controller = useRef<ReturnType<typeof createForegroundBleWorkbench> | null>(null);
  // Construct inside the effect so React's development effect replay creates a fresh controller.
  useEffect(() => {
    const current = createForegroundBleWorkbench({ start: startForegroundObservation,
      canStart: () => Platform.OS !== 'web' && latest.current.active && !latest.current.blocked && latest.current.canStart(),
      clock: () => new Date().toISOString(), changed: setState, busy: value => latest.current.onBusy(value), uncertainty: value => latest.current.onUncertainty(value) });
    controller.current = current; setState(current.state);
    return () => { current.dispose(); if (controller.current === current) controller.current = null; };
  }, []);
  useEffect(() => { if (!props.active) controller.current?.stop(); }, [props.active]);
  useEffect(() => { if (props.resetVersion) controller.current?.resetConfirmed(); }, [props.resetVersion]);
  if (!props.active) return null;
  const collecting = state.phase !== 'idle';
  const unavailable = props.blocked || state.uncertain || Platform.OS === 'web';
  return <View style={styles.card}>
    <Text style={styles.heading}>Experimental advertised-UUID observation</Text>
    <Text style={styles.text}>Use only with devices you own or are authorized to test. This filters the OS-advertised service UUID list, not all service-data fields. BTHome service-data-only broadcasts can be missed; this is not yet a general BTHome collector. Nearby matching broadcasts can still appear; device names and identifiers are not proof of ownership.</Text>
    <Text style={styles.text}>10-second foreground window including permission preparation, at most 25 callbacks and 65536 serialized characters. No pairing, connections, writes or automatic saves. Leaving Devices or backgrounding stops collection. No native phone validation has been performed for this build.</Text>
    <Text style={styles.text}>Stop ends local collection and requests SDK scan stop. iOS provides no native stop completion acknowledgment. Native radio behavior remains unverified.</Text>
    {Platform.OS === 'web' && <Text style={styles.text}>Observation is unavailable in this web console. Use a native development build; offline interpretation remains available in Analysis.</Text>}
    {props.blocked && <Text style={styles.text}>Stop other device work, including accessory discovery and NFC, and disconnect the active device session before observing.</Text>}
    <Text style={styles.heading}>Selected advertised UUID: {state.serviceUuid === 'FCD2' ? 'BTHome / FCD2' : 'Eddystone / FEAA'}</Text>
    <View style={styles.actions}>
      <Control title="Select BTHome FCD2" disabled={collecting} onPress={() => controller.current?.select('FCD2')} />
      <Control title="Select Eddystone FEAA" disabled={collecting} onPress={() => controller.current?.select('FEAA')} />
      <Control title="Start advertised-UUID BLE observation" disabled={unavailable || collecting} onPress={() => controller.current?.start()} />
      <Control title="Stop advertised-UUID BLE observation" disabled={!collecting || state.phase === 'stopping'} onPress={() => controller.current?.stop()} />
      <Control title="Clear unsaved BLE observations" disabled={collecting || !state.items.length} onPress={() => controller.current?.clear()} />
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    <Text style={styles.text}>Callback times use the phone app's receipt clock, not hardware transmission time. Repeated callbacks are not necessarily distinct radio packets. Android can filter some beacons; zero results do not prove absence. Selected SDK fields are not complete RF captures or authenticated identities.</Text>
    {state.items.map(item => <View key={item.id} style={styles.item}>
      <Text style={styles.text}>Callback {item.id} · {item.platform} · {item.serviceUuid} · {item.rssiDbm ?? '?'} dBm</Text>
      <Text selectable style={styles.text}>App receipt: {item.callbackReceivedAt}</Text>
      <Control title={`Inspect BLE callback ${item.id}`} disabled={collecting || state.uncertain} onPress={() => {
        const document = controller.current?.document(item.id); if (document) props.onInspect(document);
      }} />
    </View>)}
    {!!state.items.length && <Text style={styles.text}>Opening a callback replaces the current BLE workbench input. Interpret it there, then explicitly save if needed. Unsaved observations are lost when this app closes.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  card: { minWidth: 0, padding: 18, gap: 14, borderWidth: 1, borderColor: '#414c37', borderRadius: 6 },
  heading: { color: '#d8ff6b', fontSize: 17, fontWeight: '600' },
  text: { minWidth: 0, flexShrink: 1, color: '#b8c1af', fontSize: 13, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { gap: 8, minWidth: 0, borderTopWidth: 1, borderColor: '#414c37', paddingTop: 12 },
  button: { padding: 12, borderWidth: 1, borderColor: '#414c37', borderRadius: 4 },
});
