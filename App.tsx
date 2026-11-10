import { BrowserAxpControls } from './src/BrowserAxpControls.tsx';
import { getBrowserAxpApplication, browserAxpSupport, browserAxpForeground, observeBrowserAxpLifecycle } from './src/platform/web-axp';
import { IqWorkbench } from './src/IqWorkbench.tsx';
import { HciComparisonWorkbench } from './src/HciComparisonWorkbench.tsx';
import type { ComparisonSource } from './src/hci-comparison-workbench.ts';
import { HciEvidenceReopen } from './src/HciEvidenceReopen.tsx';
import { HciDocumentWorkbench } from './src/HciDocumentWorkbench.tsx';
import { NfcStaticWorkbench } from './src/NfcStaticWorkbench.tsx';
import { HciWorkbench } from "./src/HciWorkbench.tsx";
import { IrWorkbench } from './src/IrWorkbench.tsx';
import { EvidenceBundleWorkbench } from './src/EvidenceBundleWorkbench.tsx';
import { EvidenceExportWorkbench } from './src/EvidenceExportWorkbench.tsx';
import { FlipperWorkbench } from './src/FlipperWorkbench.tsx';
import { DevicePassportWorkbench } from './src/DevicePassportWorkbench.tsx';
import { BleTrialAuthoringWorkbench } from './src/ble-trial-authoring-workbench.ts';
import { BleCandidateWorkbench } from './src/BleCandidateWorkbench.tsx';
import { BleTrialWorkbench } from './src/BleTrialWorkbench.tsx';
import { PhoneNdefWorkbench, PhoneNdefEvidenceReopen } from './src/PhoneNdefWorkbench.tsx';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DeviceSession } from './packages/core/session.ts';
import { SimulatorTransport } from './packages/core/simulator.ts';
import { RecordingWorkbench } from './src/recording-workbench.ts';
import type { ByteTransport } from './packages/core/transport.ts';
import { text, utf8 } from './packages/protocol/index.ts';
import { nativeDevice } from './modules/apex-device/index.ts';
import type { NativeStatus, UsbDevice } from './modules/apex-device/index.ts';
import { AndroidUsbTransport } from './modules/apex-device/usb-transport.ts';
import { catalogue } from './src/catalogue.ts';

import { updatePhoneNdefLifecycle } from './src/phone-ndef-lifecycle.ts';
import { PhoneNdefCapture } from './packages/core/phone-ndef-capture.ts';
import type { PhoneNdefCaptureState, PhoneNdefCaptureDocument } from './packages/core/phone-ndef-capture.ts';
import { NfcReader } from './packages/core/nfc.ts';
import { runNfcReaderAction } from './src/nfc-reader-action.ts';
import { runAccessoryDiscoveryAction, runForegroundDeviceAction } from './src/foreground-device-action.ts';
import { recoverBluetooth } from './src/bluetooth-recovery.ts';
import { clearReleasedSession, sessionControls } from './src/session-controls.ts';
import type { NfcObservation } from './packages/core/nfc.ts';
import { nfcBackend } from './src/platform/nfc';
import { BleTransport } from './packages/core/ble-transport.ts';
import type { BleCandidate } from './packages/core/ble-transport.ts';
import { bleDriver, scanAccessories, shutdownBluetooth, stopAccessoryDiscovery } from './src/platform/bluetooth';
import { evidenceStore } from './src/platform/evidence';
import type { EvidenceRecord } from './packages/core/evidence.ts';
import reaSample from './src/fixtures/rea-elf-notes.json';
import { NdefWorkbench, NdefEvidenceReopen } from './src/NdefWorkbench.tsx';
import { BleWorkbench, BleEvidenceReopen } from './src/BleWorkbench.tsx';
import { ServiceDataWorkbench } from './src/ServiceDataWorkbench.tsx';
import { ForegroundBleWorkbench } from './src/ForegroundBleWorkbench.tsx';
import { sourceAtlas } from './src/source-atlas.ts';

import { ANALYSIS_INSPECTORS, ANALYSIS_ROUTES, DEFAULT_ANALYSIS_INSPECTOR, nextAnalysisSource } from './src/analysis-navigation.ts';
import type { AnalysisInspector, Tab } from './src/analysis-navigation.ts';
function Button({ title, onPress, disabled = false, quiet = false }: { title: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, quiet && styles.quietButton, (disabled || pressed) && { opacity: 0.5 }]}>
    <Text style={[styles.buttonText, quiet && { color: '#d4d7d2' }]}>{title}</Text>
  </Pressable>;
}
function Label({ children }: { children: React.ReactNode }) { return <Text style={styles.label}>{children}</Text>; }

type NativeAcquisition = {
  current: () => boolean;
  target: DeviceSession | null;
  cancelled: boolean;
  cleanup: Promise<void> | null;
};

export default function App() {
  const trialAuthoring = useRef(new BleTrialAuthoringWorkbench()).current;
  const [, refreshTrialAuthoring] = useState(0);
  const authoringChanged = () => refreshTrialAuthoring(value => value + 1);
  const [tab, setTab] = useState<Tab>('Console');
  const [inspector, setInspector] = useState<AnalysisInspector>(DEFAULT_ANALYSIS_INSPECTOR);
  const [selectedHciComparison, setSelectedHciComparison] = useState<ComparisonSource | null>(null);
  const [selectedHciDocument, setSelectedHciDocument] = useState<{ id: number; document: string } | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const scroll = useRef<Pick<React.ComponentRef<typeof ScrollView>, 'scrollTo'> | null>(null);
  function selectInspector(next: AnalysisInspector) {
    setInspector(next); setChooserOpen(false); activeTab.current = 'Analysis'; setTab('Analysis');
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  const inspectorLabel = ANALYSIS_INSPECTORS.find(item => item.id === inspector)!.label;
  const [operationBusy, setBusy] = useState(false);
  const [nativeBackgroundPending, setNativeBackgroundPending] = useState(false);
  const nativeBackground = useRef<{ target: DeviceSession; pending: Promise<void> | null } | null>(null);
  const busy = operationBusy || nativeBackgroundPending;
  const [notice, setNotice] = useState<string | null>(null);
  const browserAxp = Platform.OS === 'web' ? getBrowserAxpApplication() : null;
  const localLock = useRef(false);
  const localSession = useRef<DeviceSession | null>(null);
  const lock = browserAxp?.lock ?? localLock;
  const session = browserAxp?.session ?? localSession;
  const [, refreshBrowserAxp] = useState(0);
  const activeTab = useRef(tab); activeTab.current = tab;
  const attached = useRef(true);
  const mountEpoch = useRef(0);
  const localOperation = useRef<object | null>(null);
  const operation = browserAxp?.operation ?? localOperation;
  const acquisition = useRef<NativeAcquisition | null>(null);
  const [, refreshAcquisition] = useState(0);
  const [acquisitionView, setAcquisitionView] = useState<NativeAcquisition | null>(null);
  const disconnectListener = useRef<(() => void) | null>(null);
  const [identity, setIdentity] = useState('No active APEX session');
  const [source, setSource] = useState('No active session');
  const [caps, setCaps] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>(['Ready. Select a simulator or an attached USB accessory.']);
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [nativeStatus, setNativeStatus] = useState<NativeStatus | null>(null);
  const [nfcActive, setNfcActive] = useState(false);
  const captureReader = useRef<PhoneNdefCapture | null>(null);
  const captureBusy = useRef(false);
  const foreground = useRef(AppState.currentState === 'active');
  const [captureState, setCaptureState] = useState<PhoneNdefCaptureState>({ phase: 'idle', message: 'Ready for an explicit one-tag read.', capture: null });
  const [selectedPhoneSource, setSelectedPhoneSource] = useState<(PhoneNdefCaptureDocument & { id: number }) | null>(null);
  const [tag, setTag] = useState<NfcObservation | null>(null);
  const [bleDevices, setBleDevices] = useState<BleCandidate[]>([]);
  const [scanning, setScanning] = useState(false);
  const [observing, setObserving] = useState(false);
  const observationBusy = useRef(false);
  const observationUncertain = useRef(false);
  const [observationFenced, setObservationFenced] = useState(false);
  const serviceDataBusy = useRef(false);
  const serviceDataUncertain = useRef(false);
  const [serviceDataObserving, setServiceDataObserving] = useState(false);
  const [serviceDataFenced, setServiceDataFenced] = useState(false);
  const [bluetoothResetVersion, setBluetoothResetVersion] = useState(0);
  const accessoryScanning = useRef(false);
  const [selectedBleSource, setSelectedBleSource] = useState<{ id: number; document: string } | null>(null);
  const stopScan = useRef<(() => Promise<void>) | null>(null);
  const reader = useRef<NfcReader | null>(null);
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const recording = useRef(new RecordingWorkbench()).current;
  const [, recordingRender] = useState(0);
  const recordingChanged = () => recordingRender(value => value + 1);
  const { format, input, fixture, analysis } = recording;
  const [search, setSearch] = useState('');
  const append = (message: string) => setEvents(previous => [...previous.slice(-19), message]);
  const clearSession = () => { setIdentity('No active APEX session'); setSource('No active session'); setCaps([]); };
  const sessionView = sessionControls(session.current);
  const browserSnapshot = browserAxp?.snapshot();
  const browserGate = () => ({
    foreground: attached.current && foreground.current && AppState.currentState === 'active' && browserAxpForeground(),
    devicesTab: activeTab.current === 'Devices', busy: lock.current,
    scanning: accessoryScanning.current,
    observing: observationBusy.current || serviceDataBusy.current || observationUncertain.current || serviceDataUncertain.current,
    capturing: captureBusy.current, nfc: reader.current?.state !== 'idle',
  });
  const syncBrowserSession = () => {
    if (!attached.current || !browserAxp) return;
    refreshBrowserAxp(value => value + 1);
    const current = session.current;
    if (browserAxp.owns(current)) {
      if (current?.state === 'open' && current.info) {
        setIdentity(`${current.info.id} / ${current.info.firmware}`);
        setSource('Browser AXP accessory · device report'); setCaps(current.capabilities);
      } else { clearSession(); }
    } else if (!current) clearSession();
  };
  const browserAction = (action: () => Promise<void>, success?: string) => {
    if (!attached.current) return;
    const epoch = mountEpoch.current;
    // Invoke synchronously; Choose must retain the originating gesture stack.
    try {
      const pending = action(); const revision = browserAxp?.snapshot().revision;
      void pending.then(() => {
      if (attached.current && mountEpoch.current === epoch && browserAxp?.snapshot().revision === revision && success) append(success);
    }, error => { if (attached.current && mountEpoch.current === epoch) setNotice(error instanceof Error ? error.message : String(error)); }); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  useEffect(() => {
    attached.current = true; ++mountEpoch.current;
    if (!browserAxp) return () => { attached.current = false; ++mountEpoch.current; };
    const off = browserAxp.observe(syncBrowserSession);
    const lifecycle = observeBrowserAxpLifecycle(browserAxp, syncBrowserSession);
    syncBrowserSession();
    return () => { attached.current = false; ++mountEpoch.current; off(); lifecycle(); browserAxp.suspend(); };
  }, [browserAxp]);

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
    let mounted = true;
    const capture = new PhoneNdefCapture(nfcBackend, state => { captureBusy.current = state.phase !== 'idle'; if (mounted) setCaptureState(state); });
    captureReader.current = capture;
    const lifecycle = AppState.addEventListener('change', state => {
      foreground.current = updatePhoneNdefLifecycle(state, capture);
      if (state === 'background') browserAxp?.suspend();
      if (state === 'background') suspendNativeSession();
      if (browserAxp) syncBrowserSession();
      // iOS permission sheets can be temporarily inactive without backgrounding.
      if (state === 'background') { void nfc.stop().catch(error => setNotice(String(error))); void stopAccessoryDiscovery().catch(error => setNotice(String(error))); }
    });
    return () => {
      mounted = false; void capture.cancel();
      lifecycle.remove(); disconnectListener.current?.();
      if (!browserAxp?.owns(session.current)) {
        const closing = session.current;
        void closing?.close().then(() => { if (browserAxp) { clearReleasedSession(session, closing); browserAxp.refresh(); } }).catch(() => {});
      }
      void nfc.stop().catch(() => {}); void shutdownBluetooth().catch(() => {});
    };
  }, []);

  async function run(action: () => Promise<void>, recovery = false) {
    if (lock.current || nativeBackground.current?.pending || !attached.current) return;
    const epoch = mountEpoch.current;
    if (captureBusy.current) { setNotice('Stop the phone NDEF read and wait for native release first.'); return; }
    if (serviceDataBusy.current || (!recovery && serviceDataUncertain.current)) { setNotice('Wait for service-data observation to settle; use Android Reset if native state is uncertain.'); return; }
    if (observationBusy.current || (!recovery && observationUncertain.current)) { setNotice('Wait for advertised-UUID observation to settle; use Android Reset if controller reuse is uncertain.'); return; }
    const token = {}; operation.current = token;
    lock.current = true; setBusy(true); setNotice(null);
    try { await action(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backgroundInterrupted = nativeBackground.current?.pending && error instanceof Error && error.message === 'Session closed';
      if (!backgroundInterrupted && attached.current && mountEpoch.current === epoch && operation.current === token) { setNotice(message); append(`Error: ${message}`); }
    }
    finally {
      if (operation.current === token) {
        operation.current = null; lock.current = false;
        if (attached.current && mountEpoch.current === epoch) setBusy(false);
        browserAxp?.refresh();
      }
    }
  }
  const runForeground = (action: () => Promise<void>) => runForegroundDeviceAction(async () => {
    if (browserAxp?.held) throw new Error('Release browser AXP ownership first.');
    await action();
  }, run,
    () => foreground.current && AppState.currentState === 'active');
  async function connect(transport: ByteTransport) {
    if (browserAxp?.held) throw new Error('Release browser AXP ownership before starting another session.');
    if (!attached.current || nativeBackground.current?.pending) return;
    if (!browserAxp && (!foreground.current || AppState.currentState !== 'active'))
      throw new Error('Device acquisition requires an active foreground app.');
    const epoch = mountEpoch.current;
    const token = operation.current;
    const current = () => attached.current && mountEpoch.current === epoch && operation.current === token;
    // This is a cancellation handle for this connect, not another operation lock.
    // Browser-owned work continues to use BrowserAxpControls.
    const attempt: NativeAcquisition | null = browserAxp ? null : {
      current, target: session.current, cancelled: false, cleanup: null,
    };
    if (attempt) { acquisition.current = attempt; setAcquisitionView(attempt); }
    try {
      if (!current() || attempt?.cancelled || (attempt && session.current !== attempt.target)) return;
      disconnectListener.current?.(); disconnectListener.current = null;
      const previous = session.current;
      await previous?.close();
      // Cancellation while waiting for prior release must not create a new session.
      if (!current() || attempt?.cancelled) return;
      if (!clearReleasedSession(session, previous)) return;
      clearSession();
      if (!current() || attempt?.cancelled || session.current !== null) return;
      const next = new DeviceSession(transport); session.current = next;
      if (attempt) attempt.target = next;
      disconnectListener.current = transport.onDisconnect(error => {
        if (session.current !== next || !attached.current || mountEpoch.current !== epoch) return;
        clearSession(); setNotice(`${error.message}. Close the disconnected session before starting another observation.`); append(error.message);
      });
      try {
        if (!current() || attempt?.cancelled || session.current !== next) return;
        await next.open();
        if (session.current !== next || !current() || attempt?.cancelled) return;
        setIdentity(`${next.info!.id} / ${next.info!.firmware}`);
        setSource(next.source === 'simulator' ? 'Simulator · software only' : next.source === 'ble' ? 'Bluetooth accessory · device report' : 'USB accessory · device report');
        setCaps(next.capabilities); append(`Connected: ${next.info!.id}. ${next.capabilities.length} operations.`);
      } catch (error) {
        if (session.current === next && current() && !attempt?.cancelled) {
          disconnectListener.current?.(); disconnectListener.current = null;
          clearReleasedSession(session, next);
          clearSession();
        }
        throw error;
      }
    } catch (error) {
      if (!attempt?.cancelled) throw error;
    } finally {
      // run(connect) owns the lock until both open and cancellation cleanup settle.
      // A failed close is observed, never silently retried by this cancellation.
      // Do not yield on a null cleanup: that would leave a completed handle
      // accepting cancellation after this finally captured nothing to await.
      if (attempt?.cleanup) await attempt.cleanup;
      if (attempt && acquisition.current === attempt) {
        acquisition.current = null;
        if (current()) {
          setAcquisitionView(null);
          if (attempt.cancelled && session.current === attempt.target) {
            disconnectListener.current?.(); disconnectListener.current = null;
            const released = clearReleasedSession(session, attempt.target);
            clearSession();
            setNotice(released
              ? 'Connection attempt cancelled. Local cleanup completed. Start another connection explicitly.'
              : 'Connection attempt cancelled. Transport release is still unconfirmed. Use Disconnect to retry cleanup; Bluetooth may require explicit Android recovery.');
          }
        }
      }
    }
  }
  function cancelAcquisition(attempt: NativeAcquisition | null, automatic = false) {
    // The rendered handler captures one attempt; stale presses cannot cancel its successor.
    if (!attempt || browserAxp || acquisition.current !== attempt || !attempt.current() ||
        attempt.cancelled || session.current !== attempt.target) return;
    attempt.cancelled = true;
    refreshAcquisition(value => value + 1);
    setNotice(automatic
      ? 'App backgrounded. Connection cancellation requested; outstanding work and permission prompts may remain pending.'
      : 'Cancellation requested. Waiting for outstanding work and cleanup; permission prompts may remain open.');
    // close marks protocol state immediately and forwards the existing BLE abort.
    // It does not dismiss OS permission UI or prove physical release.
    // A background event must not retry a prior failed close. The original
    // connect still owns its outstanding open/close and awaits it before unlock.
    attempt.cleanup = automatic && attempt.target?.state === 'closed'
      ? Promise.resolve() : attempt.target?.close().catch(() => {}) ?? Promise.resolve();
  }

  function suspendNativeSession() {
    if (browserAxp || !attached.current) return;
    const attempt = acquisition.current;
    if (attempt) { cancelAcquisition(attempt, true); return; }
    const target = session.current;
    // One automatic release attempt per selected session. Repeated background
    // events and failed/closed sessions require an explicit Disconnect retry.
    if (!target || target.state === 'closed' || nativeBackground.current?.target === target) return;
    const epoch = mountEpoch.current;
    const owner = { target, pending: Promise.resolve() as Promise<void> | null };
    nativeBackground.current = owner;
    const current = () => attached.current && mountEpoch.current === epoch && nativeBackground.current === owner;
    setNativeBackgroundPending(true);
    try { disconnectListener.current?.(); } catch { /* Cleanup must still reach the transport. */ }
    disconnectListener.current = null;
    clearSession();
    setNotice('App backgrounded. Releasing the native session; outstanding work may remain pending.');
    owner.pending = target.close().then(() => {
      if (!current() || session.current !== target) return;
      if (clearReleasedSession(session, target)) {
        setNotice('Native session released after backgrounding. Connect again explicitly when the app is active.');
      }
    }, () => {
      if (!current() || session.current !== target) return;
      setNotice('Native session closed locally after backgrounding, but transport release is unconfirmed. Choose Disconnect to retry cleanup; no automatic reconnect occurred.');
    }).finally(() => {
      owner.pending = null;
      if (current() && (session.current === target || session.current === null)) setNativeBackgroundPending(false);
    });
  }

  async function disconnect() {
    if (browserAxp?.owns(session.current)) { await browserAxp.cancel(); return; }
    disconnectListener.current?.(); disconnectListener.current = null;
    const active = session.current;
    await active?.close();
    if (!clearReleasedSession(session, active)) return;
    clearSession(); append('Local session released.');
  }
  async function resetBluetooth() {
    if (browserAxp?.held) throw new Error('Use browser AXP cleanup for browser ownership.');
    if (reader.current?.state !== 'idle') throw new Error('Stop NFC reading before resetting APEX Bluetooth.');
    const active = session.current;
    const result = await recoverBluetooth(shutdownBluetooth, active, clearBleSession => {
      stopScan.current = null; accessoryScanning.current = false;
      setScanning(false); setBleDevices([]);
      if (clearBleSession && session.current === active) {
        disconnectListener.current?.(); disconnectListener.current = null;
        session.current = null; clearSession();
      }
    });
    observationUncertain.current = false; setObservationFenced(false);
    serviceDataUncertain.current = false; setServiceDataFenced(false); setBluetoothResetVersion(value => value + 1);
    const message = 'APEX Bluetooth manager released. Start a new scan or connection explicitly.';
    setNotice(message); append(message);
    if (result.sessionCleanupFailed) append('Follow-up session cleanup returned an error after confirmed manager release. The old session is no longer selected.');
  }
  async function refreshDevices() {
    if (!nativeDevice) throw new Error('USB host access requires an Android development build.');
    const [status, list] = await Promise.all([nativeDevice.getStatus(), nativeDevice.listUsbDevices()]);
    setNativeStatus(status); setDevices(list); append(`USB inventory: ${list.length} attached device(s).`);
  }
  function loadFixture(next: 'NEC' | 'CAN') { recording.loadFixture(next); recordingChanged(); }
  function analyse() { recording.analyse(); recordingChanged(); }

  return <View style={styles.root}>
    <StatusBar style="light" />
    <View style={styles.shell}>
      <View style={styles.header}>
        <View><Text style={styles.brand}>APEX<Text style={styles.brandDot}>.</Text></Text><Text style={styles.strap}>UNIVERSAL MASTER KEY</Text></View>
        <View style={styles.version}><Text style={styles.versionText}>FOUNDATION 0.1</Text><Text style={styles.platform}>{Platform.OS.toUpperCase()} / LOCAL</Text></View>
      </View>
      <View style={styles.tabs}>{(['Console', 'Devices', 'Analysis', 'Evidence', 'Research'] as Tab[]).map(name =>
        <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => { if (name !== 'Devices' && captureBusy.current) void captureReader.current?.cancel('Devices tab left; read cancelled.'); activeTab.current = name; setTab(name); }} style={[styles.tab, tab === name && styles.activeTab]}>
          <Text style={[styles.tabText, tab === name && { color: '#d8ff6b' }]}>{name}</Text>
        </Pressable>)}</View>
      <ScrollView ref={instance => { scroll.current = instance; }} contentContainerStyle={styles.body}>
        {notice && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>}
        {browserAxp && browserSnapshot && (tab === 'Devices' || browserSnapshot.held || browserSnapshot.cleanupFailed) && <BrowserAxpControls
          snapshot={browserSnapshot} support={browserAxpSupport()} devicesTab={tab === 'Devices'}
          eligible={!session.current && !busy && !captureBusy.current && !accessoryScanning.current && !observationBusy.current && !serviceDataBusy.current && !observationUncertain.current && !serviceDataUncertain.current && !nfcActive && foreground.current && browserAxpForeground()}
          onChoose={() => browserAction(() => browserAxp.choose(browserGate()))}
          onConnect={() => browserAction(() => browserAxp.connect(browserGate()), 'Browser AXP negotiation completed: device report, not authentication.')}
          onCancel={() => browserAction(() => browserAxp.cancel(), 'Browser AXP local cleanup completed.')}
          onRetry={() => browserAction(() => browserAxp.cancel(true), 'Browser AXP cleanup retry completed.')} />}
        {!browserAxp && acquisitionView && <View style={styles.card}>
          <Label>NATIVE APP SESSION CONNECTION</Label>
          <Text style={styles.description}>Simulator, USB or Bluetooth connection / negotiation. Cancellation stops preventable new work, then waits for outstanding work and cleanup. It does not dismiss system permission prompts or confirm physical release.</Text>
          <Button title={acquisitionView.cancelled ? 'Cancellation requested · waiting for cleanup' : 'Cancel connection attempt'}
            quiet disabled={acquisitionView.cancelled} onPress={() => cancelAcquisition(acquisitionView)} />
        </View>}
        {tab === 'Console' && <>
          <Label>01 / OPERATOR CONSOLE</Label>
          <Text style={styles.heading}>One platform.<Text style={styles.accent}> Many interfaces.</Text></Text>
          <Text style={styles.description}>Connect supported equipment. Inspect what is known. Build the next verified capability.</Text>
          <View style={styles.card}>
            <View style={styles.row}><Label>ACTIVE SESSION</Label><Text style={styles.pill}>{source}</Text></View>
            <Text style={styles.identity}>{identity}</Text>
            <Text style={styles.description}>{caps.length ? caps.join('  ·  ') : 'Identity and capabilities appear after negotiation.'}</Text>
            <View style={styles.actions}>
              <Button title="Connect simulator" disabled={!!browserSnapshot?.held || captureState.phase !== 'idle' || busy || observing || serviceDataObserving || observationFenced || serviceDataFenced} onPress={() => void run(() => connect(new SimulatorTransport()))} />
              <Button title="Ping device" quiet disabled={captureState.phase !== 'idle' || busy || observing || serviceDataObserving || observationFenced || serviceDataFenced || !caps.includes('system.ping')} onPress={() => void run(async () => {
                const active = session.current;
                const epoch = mountEpoch.current;
                if (!active) throw new Error('No active session');
                const reply = await active.request('system.ping', utf8('APEX round trip'));
                if (session.current !== active || active.state !== 'open' || !attached.current || mountEpoch.current !== epoch) return;
                append(`Ping received: ${text(reply)} [${active.source}]`);
              })} />
              <Button title="Disconnect" quiet disabled={!!browserAxp?.owns(session.current) || captureState.phase !== 'idle' || busy || observing || serviceDataObserving || observationFenced || serviceDataFenced || !sessionView.held} onPress={() => void run(disconnect)} />
            </View>
          </View>
          {sessionView.closed && !browserAxp?.owns(session.current) && <Text style={styles.footnote}>This session is closed locally. Choose Disconnect to finish or retry cleanup before starting observation. Failed USB cleanup can remain blocked; Bluetooth may require explicit Android recovery.</Text>}
          <Label>SESSION JOURNAL / IN MEMORY</Label>
          <View style={styles.terminal}>{events.map((event, i) => <Text key={`${i}-${event}`} style={styles.log}><Text style={styles.accent}>{String(i + 1).padStart(2, '0')} </Text>{event}</Text>)}</View>
          <Text style={styles.footnote}>Simulator traffic is software only. Physical device compatibility requires separate hardware evidence.</Text>
        </>}
        {tab === 'Devices' && <>
          <Label>02 / EQUIPMENT</Label><Text style={styles.heading}>Know the interface.</Text>
          <Text style={styles.description}>{nativeDevice ? 'Select an attached CDC accessory. Android will request USB permission when needed.' : 'iPhone and Android use native NFC and Bluetooth integrations. USB host access uses the Android development build. Web supports the simulator, offline analysis and experimental authorized AXP accessories on supported secure browsers.'}</Text>
          <Button title="Refresh USB inventory" disabled={captureState.phase !== 'idle' || busy || observing || serviceDataObserving || observationFenced || serviceDataFenced || !nativeDevice} onPress={() => void run(refreshDevices)} />
          {nativeStatus && <Text style={styles.description}>USB host: {String(nativeStatus.usbHost)} · NFC: {nativeStatus.nfcAvailable ? nativeStatus.nfcEnabled ? 'enabled' : 'disabled' : 'unavailable'}</Text>}
          {devices.map(device => <View key={device.id} style={styles.card}><Text style={styles.identity}>USB {device.vendorId.toString(16)}:{device.productId.toString(16)}</Text>
            <Text style={styles.description}>{device.name} · permission {device.hasPermission ? 'granted' : 'required'}</Text>
            <Button title={`Connect USB ${device.id}`} disabled={captureState.phase !== 'idle' || busy || observing || serviceDataObserving || observationFenced || serviceDataFenced} onPress={() => void run(() => connect(new AndroidUsbTransport(nativeDevice!, device.id)))} />
          </View>)}
          <View style={styles.card}><Label>AXP BLUETOOTH ACCESSORIES</Label>
            <Text style={styles.description}>Foreground discovery of the custom AXP service only. Requires an AXP BLE peer; existing third-party firmware is not automatically compatible.</Text>
            <Button title={scanning ? 'Stop accessory discovery' : 'Find Bluetooth accessories'} disabled={captureState.phase !== 'idle' || busy || observing || serviceDataObserving || observationFenced || serviceDataFenced || Platform.OS === 'web'} onPress={() => void runAccessoryDiscoveryAction(() => accessoryScanning.current, async () => { await stopScan.current?.(); }, async () => {
              if (browserAxp?.held) throw new Error('Release browser AXP ownership first.');
              setBleDevices([]); setScanning(true); accessoryScanning.current = true;
              try { stopScan.current = await scanAccessories(device => setBleDevices(items => [...items.filter(x => x.id !== device.id), device].slice(-64)), error => { setScanning(false); accessoryScanning.current = false; if (error) setNotice(error.message); }); }
              catch (error) { setScanning(false); accessoryScanning.current = false; throw error; }
            }, run, () => foreground.current && AppState.currentState === 'active')} />
            {bleDevices.map(device => <View key={device.id}><Text style={styles.description}>{device.name} · {device.rssi ?? '?'} dBm</Text><Button title={`Connect Bluetooth ${device.id}`} disabled={captureState.phase !== 'idle' || busy || observing || serviceDataObserving || observationFenced || serviceDataFenced} onPress={() => void run(() => connect(new BleTransport(bleDriver, device.id)))} /></View>)}
            <Text style={styles.description}>Android recovery ends APEX Bluetooth connections and releases its manager. It does not turn off the phone's Bluetooth or delete saved evidence. Pending native operations may still prevent recovery. The pinned iOS bridge cannot confirm this teardown, so reset is unavailable there.</Text>
            <Button title="Reset APEX Bluetooth" quiet disabled={captureState.phase !== 'idle' || busy || observing || serviceDataObserving || nfcActive || Platform.OS !== 'android'} onPress={() => void run(resetBluetooth, true)} />
          </View>
          <View style={styles.card}><Label>FOREGROUND NFC METADATA</Label><Text style={styles.description}>Tag identifier, supported technologies and cached NDEF record summaries.</Text>
            <Button title={nfcActive ? 'Stop NFC reader' : 'Start NFC reader'} disabled={captureState.phase !== 'idle' || (busy && !nfcActive) || observing || serviceDataObserving || observationFenced || serviceDataFenced || Platform.OS === 'web'} onPress={() => void runNfcReaderAction(reader.current, runForeground, error => setNotice(String(error)))} />{tag && <Text selectable style={styles.log}>{JSON.stringify(tag, null, 2)}</Text>}
          </View>
        </>}
        {tab === 'Devices' && <View style={styles.card}>
          <Label>ONE-TAG PHONE NDEF SELECTED FIELDS</Label>
          <Text style={styles.description}>Explicit foreground read of at most one OS-normalized callback within 30 seconds, including preparation. Retains only record TNF, type, optional record ID and payload in memory. Not original wire bytes, tag identity/authentication, or every detected message. No automatic display of interpretation or save. No URL navigation or provider transmission. Web unavailable.</Text>
          <Button title={captureState.phase === 'idle' ? 'Read one phone NDEF tag' : 'Stop phone NDEF read'} disabled={Platform.OS === 'web' || (captureState.phase === 'idle' && (busy || observing || serviceDataObserving || observationFenced || serviceDataFenced || scanning || nfcActive || sessionView.held))} onPress={() => {
            const capture = captureReader.current; if (!capture) return;
            if (capture.state.phase !== 'idle') { void capture.stopOrCancel(); return; }
            if (browserAxp?.held || !foreground.current || AppState.currentState !== 'active' || lock.current || observationBusy.current || serviceDataBusy.current || observationUncertain.current || serviceDataUncertain.current || accessoryScanning.current || reader.current?.state !== 'idle' || session.current || Platform.OS === 'web') return;
            void capture.start().catch(error => setNotice(String(error)));
          }} />
          <Text style={styles.description}>{captureState.phase}: {captureState.message}</Text>
          {captureState.capture && <Text style={styles.description}>App callback receipt time: {captureState.capture.receivedAt}. Not an RF or tag timestamp. Memory only.</Text>}
          <Text style={styles.description}>Inspect replaces the Offline phone NDEF selected fields card's draft. Interpretation and local save still require separate actions.</Text>
          <Button title="Inspect captured phone NDEF fields" disabled={captureState.phase !== 'idle' || !captureState.capture} onPress={() => {
            const selected = captureReader.current?.inspect(); if (!selected) return;
            setSelectedPhoneSource(previous => nextAnalysisSource(previous, selected)); selectInspector(ANALYSIS_ROUTES['phone-capture']);
          }} />
        </View>}
        <ServiceDataWorkbench active={tab === 'Devices'} resetVersion={bluetoothResetVersion}
          blocked={captureState.phase !== 'idle' || busy || scanning || nfcActive || sessionView.held || observing || observationFenced || serviceDataFenced}
          canStart={() => !browserAxp?.held && foreground.current && AppState.currentState === 'active' && !captureBusy.current && !observationBusy.current && !serviceDataBusy.current && !observationUncertain.current && !serviceDataUncertain.current && reader.current?.state === 'idle' && !lock.current && !accessoryScanning.current && session.current === null}
          onBusy={value => { serviceDataBusy.current = value; setServiceDataObserving(value); }}
          onUncertainty={value => { serviceDataUncertain.current = value; setServiceDataFenced(value); }}
          onInspect={document => { setSelectedBleSource(previous => nextAnalysisSource(previous, { document })); selectInspector(ANALYSIS_ROUTES['service-data']); }} />
        <ForegroundBleWorkbench resetVersion={bluetoothResetVersion} active={tab === 'Devices'} blocked={captureState.phase !== 'idle' || busy || scanning || nfcActive || sessionView.held || serviceDataObserving || observationFenced || serviceDataFenced}
          canStart={() => !browserAxp?.held && foreground.current && AppState.currentState === 'active' && !observationBusy.current && !serviceDataBusy.current && !observationUncertain.current && !serviceDataUncertain.current && !captureBusy.current && reader.current?.state === 'idle' && !lock.current && !accessoryScanning.current && !nfcActive && session.current === null}
          onBusy={value => { observationBusy.current = value; setObserving(value); }}
          onUncertainty={value => { observationUncertain.current = value; setObservationFenced(value); }}
          onInspect={document => { setSelectedBleSource(previous => nextAnalysisSource(previous, { document })); selectInspector(ANALYSIS_ROUTES['advertised-uuid']); }} />
        {tab === 'Analysis' && <View style={styles.inspectorChooser}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Choose Analysis inspector: ${inspectorLabel}`}
            accessibilityState={{ expanded: chooserOpen }} onPress={() => setChooserOpen(value => !value)} style={styles.inspectorControl}>
            <Text style={styles.identity}>{inspectorLabel}</Text><Text style={styles.description}>{chooserOpen ? 'Close inspector chooser' : 'Choose inspector'}</Text>
          </Pressable>
          {chooserOpen && ANALYSIS_INSPECTORS.map(item => <Pressable key={item.id} accessibilityRole="button"
            accessibilityLabel={`Select ${item.label}`} accessibilityState={{ selected: inspector === item.id }}
            onPress={() => selectInspector(item.id)} style={[styles.inspectorControl, inspector === item.id && styles.selectedInspector]}>
            <Text style={styles.description}>{item.label}{inspector === item.id ? ' · Selected' : ''}</Text>
          </Pressable>)}
          <Text style={styles.footnote}>Inspector selection is kept in memory across tabs. Reload returns to Recording.</Text>
        </View>}
        {tab === 'Analysis' && inspector === 'recording' && <>
          <Label>03 / LOCAL WORKBENCH</Label><Text style={styles.heading}>Evidence before inference.</Text>
          <Text style={styles.description}>Deterministic offline analysis. No AI provider is connected. NEC uses microsecond pulse durations; CAN accepts compact classic candump data frames. REA imports offline ELF-note evidence produced by the pinned research CLI; the original binary is not verified on this phone.</Text>
          <View style={styles.actions}><Button title="Load NEC fixture" quiet onPress={() => loadFixture('NEC')} /><Button title="Load CAN fixture" quiet onPress={() => loadFixture('CAN')} /><Button title="Import REA report" quiet onPress={() => { recording.edit('', 'REA ELF', false, 'Paste rea-evidence.json from the research CLI, then analyse.'); recordingChanged(); }} /><Button title="Load REA sample" quiet onPress={() => { recording.edit(JSON.stringify(reaSample), 'REA ELF', true, 'Recorded REA lab sample loaded. Ready to analyse.'); recordingChanged(); }} /></View>
          <Text style={styles.pill}>{format} / {fixture ? format === 'REA ELF' ? 'RECORDED LAB SAMPLE' : 'SYNTHETIC FIXTURE' : 'OFFLINE INPUT'}</Text>
          <TextInput accessibilityLabel="Recording input" multiline value={input} onChangeText={value => { recording.edit(value); recordingChanged(); }} style={styles.input} autoCapitalize="none" autoCorrect={false} />
          <View style={styles.actions}><Button title="Analyse recording" onPress={analyse} /><Button title="Save analysis evidence" quiet disabled={captureState.phase !== 'idle' || busy || observing || serviceDataObserving || observationFenced || serviceDataFenced || !recording.canSave} onPress={() => void run(async () => {
            try {
              if (!await recording.save(evidenceStore)) return;
              try { setRecords(await evidenceStore.list()); setNotice('Analysis saved to local evidence.'); }
              catch (error) { setNotice(`Analysis saved, but evidence refresh failed: ${String(error)}`); }
            } finally { recordingChanged(); }
          })} /></View><View style={styles.terminal}><Text selectable style={styles.log}>{analysis}</Text></View>
        </>}
        <BleTrialWorkbench active={tab === 'Analysis' && inspector === 'ble-trials'} authoring={trialAuthoring} onAuthoringChanged={authoringChanged} />
        <BleCandidateWorkbench active={tab === 'Analysis' && inspector === 'ble-candidate'} />
        <FlipperWorkbench active={tab === 'Analysis' && inspector === 'flipper'} />
        <DevicePassportWorkbench active={tab === 'Analysis' && inspector === 'device-passport'} />
        <IrWorkbench active={tab === 'Analysis' && inspector === 'ir'} />
        <HciWorkbench active={tab === 'Analysis' && inspector === 'hci'} onDocument={document => { setSelectedHciDocument(previous => nextAnalysisSource(previous, { document })); selectInspector(ANALYSIS_ROUTES['selected-hci-event']); }} />
        <HciDocumentWorkbench active={tab === 'Analysis' && inspector === 'hci-document'} onStage={source => { setSelectedHciComparison(previous => nextAnalysisSource(previous, source)); selectInspector(ANALYSIS_ROUTES['staged-hci-report']); }} selectedSource={selectedHciDocument} store={evidenceStore} onSaved={async () => {
          try { setRecords(await evidenceStore.list()); }
          catch (error) { setNotice(`HCI document saved, but evidence refresh failed: ${String(error)}`); }
        }} />
        <HciComparisonWorkbench active={tab === 'Analysis' && inspector === 'hci-compare'} selectedSource={selectedHciComparison} />
        <NdefWorkbench active={tab === 'Analysis' && inspector === 'ndef'} store={evidenceStore} onSaved={async () => {
          try { setRecords(await evidenceStore.list()); }
          catch (error) { setNotice(`NDEF saved, but evidence refresh failed: ${String(error)}`); }
        }} />
        <PhoneNdefWorkbench selectedSource={selectedPhoneSource} active={tab === 'Analysis' && inspector === 'phone-ndef'} store={evidenceStore} onSaved={async () => {
          try { setRecords(await evidenceStore.list()); }
          catch (error) { setNotice(`Phone NDEF saved, but evidence refresh failed: ${String(error)}`); }
        }} />
        <BleWorkbench onStageTrial={document => { trialAuthoring.stage(document); authoringChanged(); selectInspector(ANALYSIS_ROUTES['staged-ble']); }} active={tab === 'Analysis' && inspector === 'ble'} selectedSource={selectedBleSource} store={evidenceStore} onSaved={async () => {
          try { setRecords(await evidenceStore.list()); }
          catch (error) { setNotice(`BLE saved; evidence refresh failed: ${String(error)}`); }
        }} />
        <NfcStaticWorkbench active={tab === 'Analysis' && inspector === 'static-nfc'} />
        <IqWorkbench active={tab === 'Analysis' && inspector === 'iq'} />
        <EvidenceBundleWorkbench active={tab === 'Evidence'} />
        <EvidenceExportWorkbench active={tab === 'Evidence'} store={evidenceStore} />
        {tab === 'Evidence' && <>
          <Label>04 / LOCAL EVIDENCE</Label><Text style={styles.heading}>Keep what you learn.</Text>
          <Text style={styles.description}>Saved NFC metadata, offline analyses and imported firmware inspection summaries. SHA-256 detects changes; it does not prove authenticity. Native storage uses the app sandbox. Web storage belongs to this browser.</Text>
          <Button title="Refresh evidence" quiet onPress={() => void run(async () => setRecords(await evidenceStore.list()))} />
          {!records.length && <Text style={styles.description}>No saved observations yet. Analyse a fixture or inspect an authorised NFC tag.</Text>}
          {records.map(record => record.kind === 'analysis.hci-event' ? <View key={record.id} style={styles.card}><Text style={styles.identity}>analysis.hci-event · UNVERIFIED until explicit check</Text><Text style={styles.description}>Journal saved at {JSON.stringify(record.observedAt.slice(0, 120))}; declared save time, not authenticated capture time.</Text><HciEvidenceReopen record={record} store={evidenceStore} /></View> : <View key={record.id} style={styles.card}><Text style={styles.identity}>{record.kind}</Text><Text style={styles.pill}>{record.source}</Text><Text style={styles.description}>{record.kind === 'analysis.ndef-source' ? `Journal saved at ${record.observedAt}. Source timestamp unavailable; not RF/tag capture time.` : record.observedAt}</Text><Text selectable style={styles.log}>{JSON.stringify(record.payload, null, 2)}</Text><Text selectable style={styles.log}>SHA-256 {record.sha256}</Text><Button title={`Verify ${record.id}`} quiet onPress={() => void run(async () => setNotice(await evidenceStore.verify(record) ? 'Evidence digest verified.' : 'Evidence digest mismatch.'))} />{record.kind === 'analysis.ndef-source' && <PhoneNdefEvidenceReopen record={record} store={evidenceStore} />}{record.kind === 'analysis.ndef' && <NdefEvidenceReopen record={record} store={evidenceStore} />}{(record.kind === 'analysis.ble' || record.kind === 'analysis.ble-source') && <BleEvidenceReopen record={record} store={evidenceStore} />}</View>)}
        </>}
        {tab === 'Research'  && <>
          <Label>04 / CAPABILITY ATLAS</Label><Text style={styles.heading}>Ambition, with evidence.</Text>
          <Text style={styles.description}>31 upstream projects registered and backed up. Each capability retains its implementation status and hardware dependencies.</Text>
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
  inspectorChooser: { gap: 8 }, inspectorControl: { minHeight: 48, padding: 14, borderWidth: 1, borderColor: '#414c37', borderRadius: 4, backgroundColor: '#151a13' }, selectedInspector: { borderColor: '#d8ff6b' },
  quietButton: { backgroundColor: '#151a13', borderColor: '#414c37' }, buttonText: { color: '#13190b', fontSize: 12, fontWeight: '700' },
  terminal: { padding: 19, backgroundColor: '#0e120d', borderWidth: 1, borderColor: '#293124', borderRadius: 4, gap: 10 }, log: { color: '#b8c1af', fontFamily: mono, fontSize: 12, lineHeight: 21 },
  footnote: { color: '#99a38f', fontSize: 12, lineHeight: 20 }, input: { minHeight: 170, maxHeight: 300, color: '#c9d5bc', backgroundColor: '#11170f', padding: 15, borderWidth: 1, borderColor: '#414c37', fontFamily: mono, fontSize: 12, lineHeight: 20, textAlignVertical: 'top' },
  catalogue: { borderBottomWidth: 1, borderColor: '#293124', paddingVertical: 16, gap: 10 }, catalogueTitle: { color: '#f1f4ee', fontSize: 16 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderColor: '#293124', paddingTop: 24, marginTop: 20, paddingBottom: 20 }, footerText: { fontFamily: mono, fontSize: 9, color: '#8d987e', letterSpacing: 1 },
});
