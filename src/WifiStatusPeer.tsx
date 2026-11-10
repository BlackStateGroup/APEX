import React, { useEffect, useRef, useState } from 'react';
import { AppState, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetch } from 'expo/fetch';
import { readWifiPeerStatus, WifiStatusError } from './wifi-status-peer.ts';
import type { WifiPeerStatus } from './wifi-status-peer.ts';

export function WifiStatusPeer() {
  const [address, setAddress] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WifiPeerStatus | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const pairedToken = useRef<string | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') disconnect();
    });
    return () => {
      subscription.remove();
      pairedToken.current = null;
      const pending = request.current;
      request.current = null;
      pending?.abort();
    };
  }, []);

  function disconnect() {
    pairedToken.current = null;
    const pending = request.current;
    request.current = null;
    pending?.abort();
    setToken('');
    setBusy(false);
    setResult(null);
    setError('');
  }

  async function checkStatus() {
    if (request.current || AppState.currentState !== 'active') return;
    const credential = pairedToken.current ?? token;
    const pending = new AbortController();
    request.current = pending;
    setBusy(true);
    setToken('');
    setResult(null);
    setError('');
    try {
      const status = await readWifiPeerStatus(address, credential, fetch, pending.signal);
      if (request.current !== pending || AppState.currentState !== 'active') return;
      pairedToken.current = credential;
      setResult(status);
    } catch (failure) {
      if (request.current !== pending || AppState.currentState !== 'active') return;
      pairedToken.current = null;
      setError(failure instanceof WifiStatusError ? failure.message : 'Could not read companion status.');
    } finally {
      if (request.current === pending) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  const paired = pairedToken.current !== null;
  return <View style={styles.panel}>
    <Text style={styles.title}>Live companion status</Text>
    <Text style={styles.text}>Use the APEX status companion on a Raspberry Pi or Pwnagotchi host.
      Enter the HTTPS address and pairing token from the companion setup.</Text>
    <TextInput accessibilityLabel="Companion HTTPS address" placeholder="https://peer.example.net:8443"
      placeholderTextColor="#aeb4ad" autoCapitalize="none" autoCorrect={false} autoComplete="off"
      editable={!busy && !paired} maxLength={270} value={address} onChangeText={setAddress} style={styles.input} />
    {!paired && <TextInput accessibilityLabel="Companion pairing token" placeholder="64-character pairing token"
      placeholderTextColor="#aeb4ad" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off"
      textContentType="none" importantForAutofill="no" editable={!busy} maxLength={66}
      value={token} onChangeText={setToken} style={styles.input} />}
    <Button title={paired ? 'Refresh companion status' : 'Connect and read status'}
      disabled={busy || !address.trim() || (!paired && !token.trim())} onPress={() => void checkStatus()} />
    {(busy || paired) && <Button title={busy ? 'Cancel status check' : 'Disconnect companion'} onPress={disconnect} />}
    {busy && <Text accessibilityLiveRegion="polite" style={styles.text}>Checking companion status…</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.text}>{error}</Text>}
    {result && <View accessibilityLiveRegion="polite">
      <Text style={styles.text}>Companion reachable</Text>
      <Text style={styles.text}>Host uptime: {result.uptimeSeconds === null ? 'Unavailable' : `${result.uptimeSeconds} seconds`}</Text>
      <Text style={styles.text}>Configured network security: {result.security}</Text>
      <Text style={styles.text}>{result.finding}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12, backgroundColor: '#181b18', borderRadius: 12 },
  title: { color: '#f1f4ee', fontSize: 18, fontWeight: '600' },
  text: { color: '#d4d7d2' },
  input: { padding: 12, color: '#f1f4ee', backgroundColor: '#101210' },
});
