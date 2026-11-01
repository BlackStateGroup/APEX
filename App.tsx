import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DeviceSession } from './packages/core/session.ts';
import { SimulatorTransport } from './packages/core/simulator.ts';
import { CAN_FIXTURE, decodeNec, necFixture, parseCanLog } from './packages/core/analysis.ts';
import type { ByteTransport } from './packages/core/transport.ts';
import { text, utf8 } from './packages/protocol/index.ts';
import { nativeDevice } from './modules/apex-device/index.ts';
import type { NativeStatus, UsbDevice } from './modules/apex-device/index.ts';
import { AndroidUsbTransport } from './modules/apex-device/usb-transport.ts';
import { catalogue } from './src/catalogue.ts';

import { NfcReader } from './packages/core/nfc.ts';
import type { NfcObservation } from './packages/core/nfc.ts';
import { nfcBackend } from './src/platform/nfc';
import { BleTransport } from './packages/core/ble-transport.ts';
import type { BleCandidate } from './packages/core/ble-transport.ts';
import { bleDriver, scanAccessories, shutdownBluetooth, stopAccessoryDiscovery } from './src/platform/bluetooth';
import { evidenceStore } from './src/platform/evidence';
import type { EvidenceRecord } from './packages/core/evidence.ts';
import { sourceAtlas } from './src/source-atlas.ts';

type Tab = 'Console' | 'Devices' | 'Analysis' | 'Evidence' | 'Research';
function Button({ title, onPress, disabled = false, quiet = false }: { title: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, quiet && styles.quietButton, (disabled || pressed) && { opacity: 0.5 }]}>
    <Text style={[styles.buttonText, quiet && { color: '#d4d7d2' }]}>{title}</Text>
  </Pressable>;
}
function Label({ children }: { children: React.ReactNode }) { return <Text style={styles.label}>{children}</Text>; }

export default function App() {
  const [tab, setTab] = useState<Tab>('Console');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const session = useRef<DeviceSession | null>(null);
  const disconnectListener = useRef<(() => void) | null>(null);
  const [identity, setIdentity] = useState('No device connected');
  const [source, setSource] = useState('Disconnected');
  const [caps, setCaps] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>(['Ready. Select a simulator or an attached USB accessory.']);
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [nativeStatus, setNativeStatus] = useState<NativeStatus | null>(null);
  const [nfcActive, setNfcActive] = useState(false);
  const [tag, setTag] = useState<NfcObservation | null>(null);
  const [bleDevices, setBleDevices] = useState<BleCandidate[]>([]);
  const [scanning, setScanning] = useState(false);
  const stopScan = useRef<(() => Promise<void>) | null>(null);
  const reader = useRef<NfcReader | null>(null);
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [lastAnalysis, setLastAnalysis] = useState<{ kind: 'analysis.nec' | 'analysis.can'; source: 'offline-fixture' | 'offline-import'; payload: unknown } | null>(null);
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState<'NEC' | 'CAN'>('NEC');
  const [input, setInput] = useState(JSON.stringify(necFixture()));
  const [fixture, setFixture] = useState(true);
  const [analysis, setAnalysis] = useState('Load a fixture or paste a local recording, then analyse.');
  const append = (message: string) => setEvents(previous => [...previous.slice(-19), message]);
  const clearSession = () => { setIdentity('No device connected'); setSource('Disconnected'); setCaps([]); };

  useEffect(() => {
    const load = () => evidenceStore.list().then(setRecords).catch(error => setNotice(String(error)));
    void load();
    const nfc = new NfcReader(nfcBackend, {
      onState: state => setNfcActive(state !== 'idle'),
      onError: error => setNotice(error.message),
      onTag: observation => {
        setTag(observation);
        if (observation.platform === 'web') return;
        void evidenceStore.save({ kind: 'nfc.metadata', source: observation.platform === 'ios' ? 'native-ios' : 'native-android', payload: observation, observedAt: observation.observedAt })
          .then(load).catch(error => setNotice(`NFC observed; saving failed: ${String(error)}`));
      },
    });
    reader.current = nfc;
    const lifecycle = AppState.addEventListener('change', state => {
      if (state !== 'active') { void nfc.stop().catch(error => setNotice(String(error))); void stopAccessoryDiscovery().catch(error => setNotice(String(error))); }
    });
    return () => {
      lifecycle.remove(); disconnectListener.current?.();
      void session.current?.close().catch(() => {});
      void nfc.stop().catch(() => {}); void shutdownBluetooth().catch(() => {});
    };
  }, []);

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice(null);
    try { await action(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message); append(`Error: ${message}`);
    }
    finally { lock.current = false; setBusy(false); }
  }
  async function connect(transport: ByteTransport) {
    disconnectListener.current?.(); disconnectListener.current = null;
    await session.current?.close(); session.current = null; clearSession();
    const next = new DeviceSession(transport); session.current = next;
    disconnectListener.current = transport.onDisconnect(error => { clearSession(); setNotice(error.message); append(error.message); });
    try {
      await next.open();
      setIdentity(`${next.info!.id} / ${next.info!.firmware}`);
      setSource(next.source === 'simulator' ? 'Simulator · software only' : next.source === 'ble' ? 'Bluetooth accessory · device report' : 'USB accessory · device report');
      setCaps(next.capabilities); append(`Connected: ${next.info!.id}. ${next.capabilities.length} operations.`);
    } catch (error) { disconnectListener.current?.(); disconnectListener.current = null; session.current = null; throw error; }
  }
  async function disconnect() {
    disconnectListener.current?.(); disconnectListener.current = null;
    await session.current?.close(); session.current = null; clearSession(); append('Session closed.');
  }
  async function refreshDevices() {
    if (!nativeDevice) throw new Error('USB host access requires an Android development build.');
    const [status, list] = await Promise.all([nativeDevice.getStatus(), nativeDevice.listUsbDevices()]);
    setNativeStatus(status); setDevices(list); append(`USB inventory: ${list.length} attached device(s).`);
  }
  function loadFixture(next: 'NEC' | 'CAN') {
    setLastAnalysis(null); setFormat(next); setInput(next === 'NEC' ? JSON.stringify(necFixture()) : CAN_FIXTURE); setFixture(true);
    setAnalysis('Fixture loaded. Ready to analyse.');
  }
  function analyse() {
    setLastAnalysis(null);
    try {
      if (input.length > 262144) throw new Error('Input exceeds analysis limit');
      let result: unknown;
      if (format === 'NEC') {
        const value: unknown = JSON.parse(input);
        if (!Array.isArray(value) || value.some(x => typeof x !== 'number')) throw new Error('Expected a JSON array of pulse durations');
        result = decodeNec(value);
      } else { const frames = parseCanLog(input); result = { frames: frames.length, identifiers: [...new Set(frames.map(f => f.id.toString(16)))], firstFrame: frames[0] ?? null }; }
      setLastAnalysis({ kind: format === 'NEC' ? 'analysis.nec' : 'analysis.can', source: fixture ? 'offline-fixture' : 'offline-import', payload: { format, result } });
      setAnalysis(JSON.stringify({ source: fixture ? 'synthetic fixture' : 'user-supplied offline data', format, result }, null, 2));
    } catch (error) { setAnalysis(`Analysis error: ${error instanceof Error ? error.message : String(error)}`); }
  }

  return <View style={styles.root}>
    <StatusBar style="light" />
    <View style={styles.shell}>
      <View style={styles.header}>
        <View><Text style={styles.brand}>APEX<Text style={styles.brandDot}>.</Text></Text><Text style={styles.strap}>UNIVERSAL MASTER KEY</Text></View>
        <View style={styles.version}><Text style={styles.versionText}>FOUNDATION 0.1</Text><Text style={styles.platform}>{Platform.OS.toUpperCase()} / LOCAL</Text></View>
      </View>
      <View style={styles.tabs}>{(['Console', 'Devices', 'Analysis', 'Evidence', 'Research'] as Tab[]).map(name =>
        <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)} style={[styles.tab, tab === name && styles.activeTab]}>
          <Text style={[styles.tabText, tab === name && { color: '#d8ff6b' }]}>{name}</Text>
        </Pressable>)}</View>
      <ScrollView contentContainerStyle={styles.body}>
        {notice && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>}
        {tab === 'Console' && <>
          <Label>01 / OPERATOR CONSOLE</Label>
          <Text style={styles.heading}>One platform.<Text style={styles.accent}> Many interfaces.</Text></Text>
          <Text style={styles.description}>Connect supported equipment. Inspect what is known. Build the next verified capability.</Text>
          <View style={styles.card}>
            <View style={styles.row}><Label>ACTIVE SESSION</Label><Text style={styles.pill}>{source}</Text></View>
            <Text style={styles.identity}>{identity}</Text>
            <Text style={styles.description}>{caps.length ? caps.join('  ·  ') : 'Identity and capabilities appear after negotiation.'}</Text>
            <View style={styles.actions}>
              <Button title="Connect simulator" disabled={busy} onPress={() => void run(() => connect(new SimulatorTransport()))} />
              <Button title="Ping device" quiet disabled={busy || !caps.includes('system.ping')} onPress={() => void run(async () => {
                const active = session.current;
                if (!active) throw new Error('No active session');
                const reply = await active.request('system.ping', utf8('APEX round trip'));
                append(`Ping received: ${text(reply)} [${active.source}]`);
              })} />
              <Button title="Disconnect" quiet disabled={busy || !caps.length} onPress={() => void run(disconnect)} />
            </View>
          </View>
          <Label>SESSION JOURNAL / IN MEMORY</Label>
          <View style={styles.terminal}>{events.map((event, i) => <Text key={`${i}-${event}`} style={styles.log}><Text style={styles.accent}>{String(i + 1).padStart(2, '0')} </Text>{event}</Text>)}</View>
          <Text style={styles.footnote}>Simulator traffic is software only. Physical device compatibility requires separate hardware evidence.</Text>
        </>}
        {tab === 'Devices' && <>
          <Label>02 / EQUIPMENT</Label><Text style={styles.heading}>Know the interface.</Text>
          <Text style={styles.description}>{nativeDevice ? 'Select an attached CDC accessory. Android will request USB permission when needed.' : 'iPhone and Android use native NFC and Bluetooth integrations. USB host access uses the Android development build. Web supports the simulator and offline analysis.'}</Text>
          <Button title="Refresh USB inventory" disabled={busy || !nativeDevice} onPress={() => void run(refreshDevices)} />
          {nativeStatus && <Text style={styles.description}>USB host: {String(nativeStatus.usbHost)} · NFC: {nativeStatus.nfcAvailable ? nativeStatus.nfcEnabled ? 'enabled' : 'disabled' : 'unavailable'}</Text>}
          {devices.map(device => <View key={device.id} style={styles.card}><Text style={styles.identity}>USB {device.vendorId.toString(16)}:{device.productId.toString(16)}</Text>
            <Text style={styles.description}>{device.name} · permission {device.hasPermission ? 'granted' : 'required'}</Text>
            <Button title={`Connect USB ${device.id}`} disabled={busy} onPress={() => void run(() => connect(new AndroidUsbTransport(nativeDevice!, device.id)))} />
          </View>)}
          <View style={styles.card}><Label>AXP BLUETOOTH ACCESSORIES</Label>
            <Text style={styles.description}>Foreground discovery of the custom AXP service only. Requires an AXP BLE peer; existing third-party firmware is not automatically compatible.</Text>
            <Button title={scanning ? 'Stop accessory discovery' : 'Find Bluetooth accessories'} disabled={busy || Platform.OS === 'web'} onPress={() => void run(async () => {
              if (scanning) { await stopScan.current?.(); return; }
              setBleDevices([]); setScanning(true);
              try { stopScan.current = await scanAccessories(device => setBleDevices(items => [...items.filter(x => x.id !== device.id), device].slice(-64)), error => { setScanning(false); if (error) setNotice(error.message); }); }
              catch (error) { setScanning(false); throw error; }
            })} />
            {bleDevices.map(device => <View key={device.id}><Text style={styles.description}>{device.name} · {device.rssi ?? '?'} dBm</Text><Button title={`Connect Bluetooth ${device.id}`} disabled={busy} onPress={() => void run(() => connect(new BleTransport(bleDriver, device.id)))} /></View>)}
          </View>
          <View style={styles.card}><Label>FOREGROUND NFC METADATA</Label><Text style={styles.description}>Tag identifier, supported technologies and cached NDEF record summaries.</Text>
            <Button title={nfcActive ? 'Stop NFC reader' : 'Start NFC reader'} disabled={busy || Platform.OS === 'web'} onPress={() => void run(async () => {
              if (nfcActive) await reader.current!.stop(); else await reader.current!.start();
            })} />{tag && <Text selectable style={styles.log}>{JSON.stringify(tag, null, 2)}</Text>}
          </View>
        </>}
        {tab === 'Analysis' && <>
          <Label>03 / LOCAL WORKBENCH</Label><Text style={styles.heading}>Evidence before inference.</Text>
          <Text style={styles.description}>Deterministic offline analysis. No AI provider is connected. NEC uses microsecond pulse durations; CAN accepts compact classic candump data frames.</Text>
          <View style={styles.actions}><Button title="Load NEC fixture" quiet onPress={() => loadFixture('NEC')} /><Button title="Load CAN fixture" quiet onPress={() => loadFixture('CAN')} /></View>
          <Text style={styles.pill}>{format} / {fixture ? 'SYNTHETIC FIXTURE' : 'OFFLINE INPUT'}</Text>
          <TextInput accessibilityLabel="Recording input" multiline value={input} maxLength={262144} onChangeText={value => { setInput(value); setFixture(false); setLastAnalysis(null); }} style={styles.input} autoCapitalize="none" autoCorrect={false} />
          <View style={styles.actions}><Button title="Analyse recording" onPress={analyse} /><Button title="Save analysis evidence" quiet disabled={busy || !lastAnalysis} onPress={() => void run(async () => {
            if (!lastAnalysis) return; await evidenceStore.save(lastAnalysis); setRecords(await evidenceStore.list()); setNotice('Analysis saved to local evidence.');
          })} /></View><View style={styles.terminal}><Text selectable style={styles.log}>{analysis}</Text></View>
        </>}
        {tab === 'Evidence' && <>
          <Label>04 / LOCAL EVIDENCE</Label><Text style={styles.heading}>Keep what you learn.</Text>
          <Text style={styles.description}>Saved NFC metadata and offline analysis summaries. SHA-256 detects changes; it does not prove authenticity. Native storage uses the app sandbox. Web storage belongs to this browser.</Text>
          <Button title="Refresh evidence" quiet onPress={() => void run(async () => setRecords(await evidenceStore.list()))} />
          {!records.length && <Text style={styles.description}>No saved observations yet. Analyse a fixture or inspect an authorised NFC tag.</Text>}
          {records.map(record => <View key={record.id} style={styles.card}><Text style={styles.identity}>{record.kind}</Text><Text style={styles.pill}>{record.source}</Text><Text style={styles.description}>{record.observedAt}</Text><Text selectable style={styles.log}>{JSON.stringify(record.payload, null, 2)}</Text><Text selectable style={styles.log}>SHA-256 {record.sha256}</Text><Button title={`Verify ${record.id}`} quiet onPress={() => void run(async () => setNotice(await evidenceStore.verify(record) ? 'Evidence digest verified.' : 'Evidence digest mismatch.'))} /></View>)}
        </>}
        {tab === 'Research'  && <>
          <Label>04 / CAPABILITY ATLAS</Label><Text style={styles.heading}>Ambition, with evidence.</Text>
          <Text style={styles.description}>30 upstream projects copied and pinned. Each capability retains its implementation status and hardware dependencies.</Text>
          {catalogue.map(item => <View key={item.domain} style={styles.catalogue}><View style={styles.row}><Text style={styles.catalogueTitle}>{item.domain}</Text><Text style={styles.pill}>{item.status}</Text></View><Text style={styles.description}>{item.detail}</Text></View>)}
          <TextInput accessibilityLabel="Search source projects" value={search} onChangeText={setSearch} placeholder="Search copied projects" placeholderTextColor="#99a38f" style={[styles.input, { minHeight: 48 }]} />
          {sourceAtlas.filter(item => `${item.id} ${item.repository}`.toLowerCase().includes(search.toLowerCase())).map(item => <View key={item.id} style={styles.catalogue}><Text style={styles.catalogueTitle}>{item.id} / {item.repository}</Text><Text style={styles.pill}>{item.use}</Text><Text selectable style={styles.log}>{item.commit}</Text></View>)}
          <Button title="Open research register" quiet onPress={() => void Linking.openURL('https://github.com/BlackStateGroup/APEX/blob/feat/research-blueprint/docs/RESEARCH_REGISTER.md').catch(error => append(String(error)))} />
        </>}
        <View style={styles.footer}><Text style={styles.footerText}>BLACK STATE GROUP</Text><Text style={styles.footerText}>APEX / RESEARCH FOUNDATION</Text></View>
      </ScrollView>
    </View>
  </View>;
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#090c0a' }, shell: { flex: 1, width: '100%', maxWidth: 1080, alignSelf: 'center' },
  header: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 42, fontWeight: '900', color: '#f1f4ee', letterSpacing: 3 }, brandDot: { color: '#d8ff6b' }, strap: { fontFamily: mono, fontSize: 10, letterSpacing: 2, color: '#9aa493' },
  version: { alignItems: 'flex-end', gap: 7 }, versionText: { color: '#d8ff6b', fontFamily: mono, fontSize: 10 }, platform: { fontFamily: mono, color: '#818b7c', fontSize: 10 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#283026', paddingHorizontal: 14 },
  tab: { flex: 1, paddingVertical: 17, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: '#d8ff6b' }, tabText: { color: '#a3aca0', fontSize: 13 },
  body: { padding: 24, gap: 20 }, label: { fontFamily: mono, color: '#a3b594', letterSpacing: 1.5, fontSize: 10, lineHeight: 17 },
  heading: { color: '#f1f4ee', fontSize: 36, lineHeight: 43, fontWeight: '600', maxWidth: 700, letterSpacing: -1 }, accent: { color: '#d8ff6b' },
  description: { color: '#a7b0a1', fontSize: 14, lineHeight: 23 }, card: { padding: 22, gap: 18, backgroundColor: '#141a12', borderWidth: 1, borderColor: '#313c29', borderRadius: 6 },
  notice: { padding: 15, borderWidth: 1, borderColor: '#a97638', backgroundColor: '#2b2114', borderRadius: 4 }, noticeText: { color: '#f2d29f', fontSize: 13, lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }, pill: { color: '#c8dcab', fontFamily: mono, fontSize: 10, lineHeight: 16 },
  identity: { color: '#f1f4ee', fontSize: 19, fontWeight: '500' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { alignSelf: 'flex-start', paddingHorizontal: 17, paddingVertical: 13, borderRadius: 4, backgroundColor: '#d8ff6b', borderWidth: 1, borderColor: '#d8ff6b' },
  quietButton: { backgroundColor: '#151a13', borderColor: '#414c37' }, buttonText: { color: '#13190b', fontSize: 12, fontWeight: '700' },
  terminal: { padding: 19, backgroundColor: '#0e120d', borderWidth: 1, borderColor: '#293124', borderRadius: 4, gap: 10 }, log: { color: '#b8c1af', fontFamily: mono, fontSize: 12, lineHeight: 21 },
  footnote: { color: '#99a38f', fontSize: 12, lineHeight: 20 }, input: { minHeight: 170, maxHeight: 300, color: '#c9d5bc', backgroundColor: '#11170f', padding: 15, borderWidth: 1, borderColor: '#414c37', fontFamily: mono, fontSize: 12, lineHeight: 20, textAlignVertical: 'top' },
  catalogue: { borderBottomWidth: 1, borderColor: '#293124', paddingVertical: 16, gap: 10 }, catalogueTitle: { color: '#f1f4ee', fontSize: 16 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderColor: '#293124', paddingTop: 24, marginTop: 20, paddingBottom: 20 }, footerText: { fontFamily: mono, fontSize: 9, color: '#8d987e', letterSpacing: 1 },
});
