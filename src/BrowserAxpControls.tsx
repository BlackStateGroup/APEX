import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { WebAxpApplicationSnapshot } from './experimental/web-axp-application.ts';
interface Props {
  snapshot: WebAxpApplicationSnapshot; support: string | null; devicesTab: boolean; eligible: boolean;
  onChoose(): void; onConnect(): void; onCancel(): void; onRetry(): void;
}
export function BrowserAxpControls({ snapshot: s, support, devicesTab, eligible, onChoose, onConnect, onCancel, onRetry }: Props) {
  const button = (title: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={{ padding: 12, marginVertical: 4, borderWidth: 1, borderColor: '#626b58', opacity: disabled ? 0.45 : 1 }}><Text style={{ color: '#d8ff6b' }}>{title}</Text></Pressable>;
  return <View style={{ padding: 16, borderWidth: 1, borderColor: '#626b58', marginBottom: 16 }}>
    <Text style={{ color: '#d8ff6b', fontWeight: 'bold' }}>Experimental browser AXP accessory</Text>
    <Text style={{ color: '#d4d7d2', marginVertical: 8 }}>Owned or authorized custom AXP service only. Not general scanning or RF capture. A secure supported Chrome platform is required; standard Safari/iOS is unavailable. Physical compatibility is unvalidated. Identity and READY are device reports, not authentication.</Text>
    {support && <Text style={{ color: '#efba79' }}>{support}</Text>}
    <Text style={{ color: '#d4d7d2' }}>Browser state: {s.manager.state}{s.opening ? ' · negotiating actual READY and identity' : ''}{s.cleaning ? ' · local cleanup pending' : ''}. Raw operations pending: {s.manager.rawPending}.</Text>
    {s.manager.candidate && <Text style={{ color: '#d4d7d2' }}>Device claim: {s.manager.candidate.name}. RSSI unavailable.</Text>}
    {(s.error || s.manager.error) && <Text accessibilityRole="alert" style={{ color: '#efba79' }}>{s.error || s.manager.error}</Text>}
    {devicesTab && <>{button('Choose browser AXP accessory', onChoose, !!support || !eligible || s.held || s.cleaning)}{button('Connect selected browser accessory', onConnect, !!support || !eligible || s.manager.state !== 'selected' || s.opening || s.cleaning)}</>}
    {s.held && button(s.manager.state === 'selected' || s.manager.state === 'picking' || s.opening ? 'Cancel browser AXP locally' : 'Disconnect browser AXP locally', onCancel, s.cleaning || s.cleanupFailed)}
    {s.cleanupFailed && button('Retry browser AXP cleanup', onRetry, s.cleaning)}
    {s.held && <Text style={{ color: '#d4d7d2' }}>Browser ownership blocks replacement and simulator sessions until local release is confirmed. Cancel cannot dismiss the browser chooser or revoke its permission grant. Pending or failed cleanup remains reserved, even after navigation.</Text>}
  </View>;
}
