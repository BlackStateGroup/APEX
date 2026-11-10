import React, { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SignedReadLabController } from './signed-read-lab-controller.ts';
import { signedLabDependencies } from './platform/signed-read-lab';
import type { AccessoryReadOperation } from '../packages/core/accessory-trust.ts';

const operations: readonly AccessoryReadOperation[] = ['system.info', 'system.capabilities', 'system.ping'];
export function SignedReadLabScreen() {
  const [controller] = useState(() => new SignedReadLabController(signedLabDependencies()));
  const [, refresh] = useState(0);
  const [key, setKey] = useState(''), [confirmed, setConfirmed] = useState('');
  const [owned, setOwned] = useState(false), [compared, setCompared] = useState(false);
  const [grants, setGrants] = useState<AccessoryReadOperation[]>([]), [ping, setPing] = useState('');
  useEffect(() => {
    const off = controller.observe(() => refresh(n => n + 1));
    controller.setForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => {
      // Permission sheets may be inactive briefly. Background always revokes trust.
      if (state === 'background') { setOwned(false); setCompared(false); setGrants([]); setConfirmed(''); }
      if (state !== 'inactive') controller.setForeground(state === 'active');
    });
    return () => { off(); subscription.remove(); controller.dispose(); };
  }, [controller]);
  const s = controller.snapshot();
  const act = (fn: () => void | Promise<void>) => { try { void Promise.resolve(fn()).catch(e => controller.report(e)); } catch (e) { controller.report(e); } };
  const button = (label: string, fn: () => void | Promise<void>, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={() => act(fn)} style={{ padding: 14, borderWidth: 1, borderColor: '#738f43', marginVertical: 5, opacity: disabled ? 0.4 : 1 }}><Text style={{ color: '#d8ff6b' }}>{label}</Text></Pressable>;
  const check = (label: string, selected: boolean, fn: () => void, disabled: boolean) => <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={fn} style={{ paddingVertical: 12 }}><Text style={{ color: '#ddd' }}>{selected ? '☑' : '☐'} {label}</Text></Pressable>;
  const input = { color: '#eee', backgroundColor: '#151a1c', padding: 12, marginVertical: 6, borderWidth: 1, borderColor: '#56605c' };
  const frozen = !s.enabled || !!s.pairing || s.busy || s.held;
  return <ScrollView style={{ flex: 1, backgroundColor: '#090c0e' }} contentContainerStyle={{ padding: 24, paddingTop: 60, maxWidth: 740, width: '100%', alignSelf: 'center' }}>
    <Text style={{ color: '#d8ff6b', fontSize: 28, fontWeight: '700' }}>APEX / SIGNED-READ LAB</Text>
    <Text style={{ color: '#ccc', marginVertical: 14 }}>Experimental USB-only reads for an owned or authorised laboratory accessory. Nothing connects automatically. No write, unlock or radio commands.</Text>
    {!s.supported && <Text accessibilityRole="alert" style={{ color: '#ffbf81' }}>Native Ed25519 is unavailable. Use a rebuilt development app; Android requires version 13 or later.</Text>}
    {s.usbUnavailable && <Text style={{ color: '#ffbf81' }}>{s.usbUnavailable}</Text>}
    {button('Enable signed-read laboratory', () => controller.enable(), !s.supported || !s.foreground || s.enabled || s.held)}
    <Text style={{ color: '#ddd', marginTop: 16 }}>Full public key from the protected provisioning record, 64 lowercase hex characters. Device names and USB IDs do not establish trust.</Text>
    <TextInput accessibilityLabel="Provisioned public key" value={key} onChangeText={value => { setKey(value); setCompared(false); }} editable={!frozen} maxLength={256} autoCapitalize="none" autoCorrect={false} style={input} />
    <Text style={{ color: '#ddd' }}>Re-enter the full key after comparing it through your independent trusted channel.</Text>
    <TextInput accessibilityLabel="Confirm full public key" value={confirmed} onChangeText={value => { setConfirmed(value); setCompared(false); }} editable={!frozen} maxLength={256} autoCapitalize="none" autoCorrect={false} style={input} />
    {check('I own or am authorised to use this lab accessory', owned, () => setOwned(v => !v), frozen)}
    {check('I independently compared the entire public key', compared, () => setCompared(v => !v), frozen)}
    <Text style={{ color: '#ddd', marginTop: 12 }}>Explicitly allow each read:</Text>
    {operations.map(op => <View key={op}>{check(op, grants.includes(op), () => setGrants(v => v.includes(op) ? v.filter(x => x !== op) : [...v, op]), frozen)}</View>)}
    {button('Confirm key and read grants', () => controller.confirm({ label: 'Confirmed lab accessory', publicKeyHex: key, confirmedPublicKeyHex: confirmed,
      keyVerification: 'out-of-band', authorization: 'owned-or-authorized-lab', allowedOperations: grants }), frozen || !owned || !compared || !/^[0-9a-f]{64}$/.test(key) || key !== confirmed || grants.length === 0)}
    {s.pairing && <Text selectable style={{ color: '#d8ff6b', marginVertical: 10 }}>Confirmed key: {s.pairing.publicKeyHex}</Text>}
    {button('Refresh attached USB devices', () => controller.refresh(), !s.enabled || !!s.usbUnavailable || s.busy || s.held)}
    {s.devices.map(d => <View key={d.id}><Text style={{ color: '#ccc' }}>USB {d.vendorId.toString(16)}:{d.productId.toString(16)} / {d.name}</Text>{button(`Connect lab USB ${d.id}`, () => controller.connect(d.id), !s.pairing || s.busy || s.held || !s.enabled)}</View>)}
    <TextInput accessibilityLabel="Ping text" value={ping} onChangeText={setPing} editable={!s.busy} placeholder="Optional ping text, at most 128 UTF-8 bytes" placeholderTextColor="#89918a" maxLength={128} style={input} />
    {operations.map(op => <View key={op}>{button(`Read ${op}`, () => controller.read(op, ping), s.connection !== 'open' || s.busy || !s.pairing?.allowedOperations.includes(op))}</View>)}
    {button('Cancel or disconnect USB', () => controller.stop(), !s.held || s.connection === 'closing' || s.connection === 'cleanup-failed')}
    {button('Revoke pairing and disable lab', () => { setOwned(false); setCompared(false); setGrants([]); setConfirmed(''); return controller.revoke(); }, !s.enabled && !s.pairing)}
    <Text accessibilityRole="status" style={{ color: '#ddd', marginTop: 14 }}>Connection: {s.connection}. {s.message}</Text>
    {s.result !== null && <Text selectable style={{ color: '#d8ff6b', marginTop: 14 }}>{s.result}</Text>}
    <Text style={{ color: '#aaa', marginVertical: 20 }}>Trust is memory-only and revoked when the app backgrounds. Connections expire after 30 seconds. A valid signature proves possession of the confirmed key for this response; it does not prove physical identity, proximity, firmware integrity or truthful metadata. Physical phone/accessory acceptance remains outstanding.</Text>
  </ScrollView>;
}
