import React, { useState } from 'react';
import { Button, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { inspectWifiReport, WIFI_REPORT_LIMIT } from './wifi-security-report.ts';
import { WifiStatusPeer } from './WifiStatusPeer.tsx';

const example = JSON.stringify({
  version: 1, source: 'example', deviceStatus: 'unknown', security: 'transition',
}, null, 2);

export function WifiSecurityWorkbench() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ReturnType<typeof inspectWifiReport> | null>(null);
  const [error, setError] = useState('');
  function edit(value: string) {
    setInput(value);
    setResult(null);
    setError('');
  }
  function inspect() {
    try {
      setResult(inspectWifiReport(input));
      setError('');
    } catch {
      setResult(null);
      setError('Invalid report. Load the example to see the accepted format.');
    }
  }
  return <>
    {(Platform.OS === 'ios' || Platform.OS === 'android') && <WifiStatusPeer />}
    <View style={styles.panel}>
      <Text style={styles.title}>Wi-Fi security report</Text>
      <Text style={styles.text}>Paste a configuration summary or load an example. Summaries are supplied manually and their device status is self-reported.</Text>
      <TextInput accessibilityLabel="Wi-Fi configuration summary" autoCapitalize="none" autoCorrect={false}
        multiline value={input} onChangeText={edit} style={styles.input} />
      <Button title="Load example" onPress={() => edit(example)} />
      <Button title="Inspect Wi-Fi report" onPress={inspect} disabled={!input.trim() || input.length > WIFI_REPORT_LIMIT} />
      <Button title="Clear report" onPress={() => edit('')} disabled={!input} />
      {input.length > WIFI_REPORT_LIMIT && <Text accessibilityRole="alert" style={styles.text}>Report exceeds the input limit.</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.text}>{error}</Text>}
      {result && <View accessibilityLiveRegion="polite">
        <Text style={styles.text}>Declared source: {result.source}</Text>
        <Text style={styles.text}>Reported device status: {result.deviceStatus}</Text>
        <Text style={styles.text}>Reported security mode: {result.security}</Text>
        <Text style={styles.text}>{result.finding}</Text>
      </View>}
    </View>
  </>;
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12, backgroundColor: '#181b18', borderRadius: 12 },
  title: { color: '#f1f4ee', fontSize: 18, fontWeight: '600' },
  text: { color: '#d4d7d2' },
  input: { minHeight: 132, padding: 12, color: '#f1f4ee', backgroundColor: '#101210', textAlignVertical: 'top' },
});
