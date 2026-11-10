import React, { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FLIPPER_STATUS_FIELDS } from '../packages/core/flipper-status.ts';
import { getFlipperStatusController, shareFlipperStatus } from './platform/flipper-status';

function Button({ label, onPress, disabled = false, secondary = false }: { label: string; onPress(): void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, secondary && s.secondary, (pressed || disabled) && s.dim]}>
    <Text style={[s.buttonText, secondary && s.white]}>{label}</Text>
  </Pressable>;
}
export default function FlipperStatusScreen() {
  const [controller] = useState(getFlipperStatusController);
  const [state, setState] = useState(() => controller.snapshot());
  const [owned, setOwned] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  useEffect(() => {
    const refresh = () => setState(controller.snapshot());
    const off = controller.observe(refresh);
    controller.setForeground(AppState.currentState === 'active'); refresh();
    const sub = AppState.addEventListener('change', next => { if (next !== 'active') setOwned(false); controller.setForeground(next === 'active'); });
    return () => { off(); sub.remove(); controller.setForeground(false); };
  }, [controller]);
  const run = (action: () => Promise<void>) => {
    if (AppState.currentState !== 'active') { controller.setForeground(false); return; }
    void action().catch(error => controller.showError(error));
  };
  const busy = state.held;
  return <View style={s.root}><StatusBar style="light" /><ScrollView contentContainerStyle={s.scroll}>
    <View style={s.shell}>
      <View style={s.top}><Text style={s.brand}>APEX</Text><Text style={s.badge}>IPHONE · ACCESSORIES</Text></View>
      <Text style={s.eyebrow}>FIRST CONNECTION</Text>
      <Text style={s.title}>Your Flipper.{'\n'}One clear read.</Text>
      <Text style={s.intro}>Connect your Flipper Zero to check its firmware, battery and charging state. Save the result through your iPhone’s share sheet.</Text>
      <View style={s.steps}>{['01  Find', '02  Select & pair', '03  Read & disconnect'].map(step => <Text key={step} style={s.step}>{step}</Text>)}</View>
      <View style={s.card}>
        <Text style={s.heading}>Prepare your Flipper</Text>
        <Text style={s.body}>Open Settings → Bluetooth on the Flipper and switch it on. Disconnect other companion apps. If iOS asks to pair, enter the code shown on your Flipper.</Text>
        <Text style={s.muted}>Stock firmware · Bluetooth connection · Foreground only</Text>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="I own this Flipper or have permission to inspect it" accessibilityState={{ checked: owned, disabled: busy }}
          disabled={busy} onPress={() => setOwned(value => !value)} style={s.checkRow}>
          <View style={[s.check, owned && s.checked]}><Text style={s.checkMark}>{owned ? '✓' : ''}</Text></View>
          <Text style={s.body}>I own this Flipper or have permission to inspect it.</Text>
        </Pressable>
        {state.unavailable && <Text style={s.warning}>{state.unavailable}</Text>}
        <Button label={state.phase === 'complete' ? 'Find Flipper again' : 'Find my Flipper'} disabled={!owned || busy || !!state.unavailable || !state.foreground || state.phase === 'blocked'} onPress={() => { setShareMessage(''); run(() => controller.scan()); }} />
        {busy && state.phase !== 'blocked' && <Button label="Cancel connection" secondary onPress={() => run(() => controller.cancel())} />}
      </View>
      <View style={s.status}><View style={[s.dot, state.phase === 'complete' && s.success]} /><Text accessibilityLiveRegion="polite" style={s.body}>{state.message}</Text></View>
      {state.candidates.length > 0 && <View style={s.card}><Text style={s.heading}>Nearby Flippers</Text><Text style={s.muted}>Names are advertised by devices. Select yours.</Text>
        {state.candidates.map((device, index) => <View key={device.id} style={s.device}>
          <View style={s.deviceCopy}><Text style={s.heading}>{device.name}</Text><Text style={s.muted}>{device.rssi === null ? 'Signal unavailable' : `${device.rssi} dBm`} · candidate {index + 1}</Text></View>
          <Button label={`Read ${device.name} (${index + 1})`} disabled={!owned || (!!state.held && state.phase !== 'scanning') || !state.foreground} secondary onPress={() => run(() => controller.inspect(device.id, owned))} />
        </View>)}
      </View>}
      {state.report && <View style={s.card}>
        <Text style={s.eyebrow}>STATUS CAPTURED · DISCONNECTED</Text><Text style={s.heading}>{state.report.deviceName}</Text>
        {FLIPPER_STATUS_FIELDS.map(field => <View style={s.valueRow} key={field.key}><Text style={s.muted}>{field.label}</Text><Text selectable style={s.value}>{String(state.report!.values[field.key])}{field.kind === 'battery' ? '%' : ''}</Text></View>)}
        <Text style={s.muted}>Device-reported values. Identity is not independently verified.</Text>
        <Text style={s.muted}>{state.report.capturedAt}</Text>
        <Button label="Share status report" disabled={sharing || !!state.unavailable} onPress={() => {
          if (sharing || AppState.currentState !== 'active') return;
          const report = state.report!; setSharing(true); setShareMessage('Opening the share sheet…');
          void shareFlipperStatus(JSON.stringify(report, null, 2), () => controller.snapshot().report === report).then(result => {
            setShareMessage(result === 'dismissed' ? 'Share dismissed.' : 'Share sheet returned. Check your chosen destination.');
          }).catch(() => setShareMessage('Sharing failed. The report has not been confirmed as saved.')).finally(() => setSharing(false));
        }} />
        <Text style={s.muted}>Includes device name, status values, capture time and APEX revision. Choose where to save or share it.</Text>
        <Button label="Clear status report" secondary onPress={() => { controller.clearReport(); setShareMessage(''); }} />
      </View>}
      {!!shareMessage && <Text accessibilityLiveRegion="polite" style={s.body}>{shareMessage}</Text>}
      <Text style={s.footer}>First accessory milestone · Software verification and physical iPhone testing are tracked separately.</Text>
    </View>
  </ScrollView></View>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d0c' }, scroll: { padding: 24, paddingTop: Platform.OS === 'ios' ? 64 : 36, paddingBottom: 48 },
  shell: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 22 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#e7f0dc', fontSize: 24, fontWeight: '800', letterSpacing: 4 }, badge: { color: '#949f90', fontSize: 10, letterSpacing: 1 },
  eyebrow: { color: '#c5f179', fontSize: 11, fontWeight: '600', letterSpacing: 2 }, title: { color: '#f4f6ef', fontSize: 42, fontWeight: '600', lineHeight: 47, letterSpacing: -1.5 },
  intro: { color: '#aeb7a8', fontSize: 16, lineHeight: 25 }, steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingVertical: 8 }, step: { color: '#c8d0c2', fontSize: 11 },
  card: { backgroundColor: '#141814', borderColor: '#30392d', borderWidth: 1, borderRadius: 18, padding: 20, gap: 16 },
  heading: { color: '#f0f4e9', fontSize: 18, fontWeight: '600' }, body: { color: '#c1cabb', fontSize: 14, lineHeight: 22, flexShrink: 1 }, muted: { color: '#9ba694', fontSize: 12, lineHeight: 19 },
  button: { borderRadius: 10, backgroundColor: '#c5f179', paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center', minHeight: 48 },
  secondary: { backgroundColor: '#20291c', borderWidth: 1, borderColor: '#3a4931' }, buttonText: { color: '#15200d', fontWeight: '600', fontSize: 14 }, white: { color: '#e1ebd6' }, dim: { opacity: 0.45 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }, check: { borderColor: '#67755b', borderWidth: 1, borderRadius: 6, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#c5f179' }, checkMark: { color: '#15200d' }, warning: { color: '#e5be79', fontSize: 13, lineHeight: 21 },
  status: { flexDirection: 'row', gap: 10, alignItems: 'center' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#708060' }, success: { backgroundColor: '#c5f179' },
  device: { borderTopWidth: 1, borderColor: '#30392d', paddingTop: 16, gap: 14 }, deviceCopy: { gap: 4 }, valueRow: { borderBottomWidth: 1, borderColor: '#30392d', paddingBottom: 12, gap: 4 },
  value: { color: '#e8f1df', fontSize: 15, lineHeight: 23 }, footer: { color: '#7f8979', fontSize: 11, lineHeight: 18 },
});
