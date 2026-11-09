import React, { useLayoutEffect, useState } from 'react';
import { AppState, Pressable, Text, TextInput, View } from 'react-native';
import { IqController, IQ_FFT_SIZES, validActivitySettings } from './iq-workbench.ts';
import type { IqFile, IqSide, IqPair, IqState, IqFftSize, IqWindowMode, IqActivityField, IqInputProfile } from './iq-workbench.ts';
import { iqByteHasher } from './platform/iq-digest';
import { IqInput } from './platform/iq-input';
import { createIqAnalysisEngine } from './platform/iq-engine';
function Info({children}:{children:React.ReactNode}) { return <Text selectable style={{color:'#b8c1af',lineHeight:21}}>{children}</Text>; }
function Control({title,onPress,disabled=false}:{title:string;onPress:()=>void;disabled?:boolean}) { return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}><Text style={{color:'#d8ff6b',padding:12}}>{title}</Text></Pressable>; }
export function IqWorkbench({active}:{active:boolean}) {
 // Stable mounted controller owns the actual outstanding slot across navigation and AppState transitions.
 const [controller] = useState(()=>new IqController(false,iqByteHasher,undefined,createIqAnalysisEngine()));
 const [,refresh] = useState(0);
 useLayoutEffect(()=>controller.subscribe(()=>refresh(n=>n+1)),[controller]);
 useLayoutEffect(()=>{
  const sync = (state: string | null | undefined) => { if (active && state === 'active') controller.activate(); else controller.deactivate(); refresh(n=>n+1); };
  sync(AppState.currentState);
  const listener = AppState.addEventListener('change',sync);
  return ()=>{ listener.remove(); controller.deactivate(); };
 },[active,controller]);
 const state = controller.state, lease = controller.lease;
 const act = (action:()=>void|Promise<void>) => { if (AppState.currentState === 'active' && controller.isActive(lease) && controller.state === state) void action(); };
 if (!active) return null;
 return <IqWorkbenchView inputProfile={profile=>act(()=>controller.inputProfile(profile,lease,state))} pair={pair=>act(()=>controller.stagePair(pair,lease,state))} activitySetting={(f,t)=>act(()=>controller.activitySetting(f,t,lease,state))} activityFramePage={p=>act(()=>controller.activityFramePage(p,lease,state))} activityRunPage={p=>act(()=>controller.activityRunPage(p,lease,state))} selectActivityRun={i=>act(()=>controller.selectActivityRun(i,lease,state))} activityIntervalPage={p=>act(()=>controller.activityIntervalPage(p,lease,state))} state={state} showPeakPage={()=>act(()=>controller.showPeakPage(lease,state))} hop={s=>act(()=>controller.hopSamples(s,lease,state))} count={s=>act(()=>controller.frameCount(s,lease,state))} framePage={p=>act(()=>controller.framePage(p,lease,state))} selectFrame={i=>act(()=>controller.selectFrame(i,lease,state))} mode={m=>act(()=>controller.windowMode(m,lease,state))} size={n=>act(()=>controller.fftSize(n,lease,state))} start={s=>act(()=>controller.startSample(s,lease,state))} toneExample={()=>act(()=>controller.toneExample(lease,state))} file={(side,file)=>act(()=>controller.stageFile(side,file,lease,state))} inspect={()=>act(()=>controller.inspect(lease,state))} clear={()=>act(()=>controller.clear(lease,state))} example={()=>act(()=>controller.example(lease,state))} page={p=>act(()=>controller.page(p,lease,state))}/>;
}
export interface IqViewProps { inputProfile?: (profile:IqInputProfile)=>void; pair?: (pair:IqPair)=>void; activitySetting?:(field:IqActivityField,text:string)=>void; activityFramePage?:(page:number)=>void; activityRunPage?:(page:number)=>void; selectActivityRun?:(index:number)=>void; activityIntervalPage?:(page:number)=>void; state: IqState; showPeakPage:()=>void; hop:(text:string)=>void; count:(text:string)=>void; framePage:(page:number)=>void; selectFrame:(index:number)=>void; mode:(mode:IqWindowMode)=>void; size:(size:IqFftSize)=>void; start:(text:string)=>void; toneExample:()=>void; file: (side:IqSide,file:IqFile|null)=>void; inspect:()=>void; clear:()=>void; example:()=>void; page:(page:number)=>void }
export function IqWorkbenchView({state,file,pair,inputProfile=()=>{},inspect,clear,example,toneExample,mode,size,start,page,hop,count,framePage,selectFrame,showPeakPage,activitySetting=()=>{},activityFramePage=()=>{},activityRunPage=()=>{},selectActivityRun=()=>{},activityIntervalPage=()=>{}}:IqViewProps) {
 const r = state.report ?? state.timeFrequencyReport ?? state.activityReport;
 const energy=state.activityReport, run=state.selectedActivityRun;
 const single = state.report, tf = state.timeFrequencyReport, selected = state.selectedFrame;
 return <View style={{padding:18,gap:12,borderWidth:1,borderColor:'#414c37'}}>
  <Info>Offline supplied I/Q, not phone RF acquisition</Info>
  <Info>Analysis results stay in memory. The SigMF input/derived profile is exact 1.2.6 ci16_le: one capture at zero, empty annotations. APEX does not upload, persist or share results or acquire RF. Native document providers may download or stage selected files. Selection stages handles; APEX reads bytes only after Inspect checks both captured sizes. One selected pair is at most 327680 source bytes, not a total heap bound.</Info>
  <Control title="Use SigMF input profile" onPress={()=>inputProfile('sigmf')}/>
  <Control title="Use Mayhem C8 input profile" onPress={()=>inputProfile('mayhem-c8')}/>
  <Info>Selected input profile: {state.inputProfile}. Changing profiles releases staged files. File labels do not establish compatibility or source identity.</Info>
  {state.inputProfile === 'mayhem-c8' && <Info>Narrow APEX C8 text v1 profile only: signed int8 interleaved I,Q and exactly three ASCII sidecar fields: sample_rate, center_frequency and format=c8 (signed int8 I,Q). Sample rate and frequency are canonical integer Hz. No timestamp is inferred. At most 135168 original source bytes; derived ci16_le data can be twice the C8 byte length. These are file bounds, not heap bounds. Mayhem firmware versions and physical devices are not verified.</Info>}
  <IqInput profile={state.inputProfile} onFile={file} onPair={pair} resetKey={state.inputRevision}/>
  <Control title="Load synthetic I/Q zero example" onPress={example}/>
  <Info>Loading the manually authored synthetic example never reads files, hashes or inspects. Expected after Inspect: 1024 samples, zero amplitudes, no rail hits, no peak.</Info>
  <Control title="Load synthetic quarter-cycle example" onPress={toneExample}/>
  {state.windowMode !== 'activity' && <Info>8192 exact integer samples at declared 8192 Hz. First 4096: positive quarter-cycle; second 4096: negative quarter-cycle. A window contained in one half has peak amplitude 0.5 at signed bin +N/4 or −N/4. Windows crossing the split may mix both orientations.</Info>}
  <Control title="Use default FFT window" onPress={()=>mode('default')}/>
  <Control title="Use explicit FFT window" onPress={()=>mode('explicit')}/>
  <Control title="Use explicit time-frequency windows" onPress={()=>mode('time-frequency')}/>
  <Control title="Selected-window energy / threshold" onPress={()=>mode('activity')}/>
  {state.windowMode !== 'activity' && <Info>Staged mode: {state.windowMode}. Periodic Hann is fixed. Default uses 1024 samples at zero, or statistics only for short data. Explicit windows must fit; no padding or fallback.</Info>}
  {state.windowMode !== 'default' && state.windowMode !== 'activity' && <>
   {IQ_FFT_SIZES.map(n=><Control key={n} title={`Stage FFT size ${n}`} onPress={()=>size(n)}/>)}
   <Info>Staged FFT size: {state.fftSize ?? 'invalid'}. Start sample: 1–5 ASCII digits, 0–65535. Invalid edits block Inspect until corrected.</Info>
   <TextInput accessibilityLabel="FFT start sample" value={state.startText} onChangeText={start} keyboardType="number-pad" style={{color:'#d8ff6b',borderWidth:1,borderColor:'#414c37',padding:12}}/>
  </>}
  {state.windowMode === 'time-frequency' && <>
   <Info>Explicit time-frequency geometry: hop 1–65536 (1–5 ASCII digits); frame count 1–64 (1–2 ASCII digits). FFT size × frames must be at most 16384; final complete window must fit. No padding or automatic computation.</Info>
   <TextInput accessibilityLabel="Time-frequency hop samples" value={state.hopText} onChangeText={hop} keyboardType="number-pad" style={{color:'#d8ff6b',borderWidth:1,borderColor:'#414c37',padding:12}}/>
   <TextInput accessibilityLabel="Time-frequency frame count" value={state.frameCountText} onChangeText={count} keyboardType="number-pad" style={{color:'#d8ff6b',borderWidth:1,borderColor:'#414c37',padding:12}}/>
   <Info>Full-file statistics are omitted in this mode. Only the requested windows are transformed.</Info>
  </>}
  {state.windowMode !== 'activity' && (state.fftSize === null || state.startSample === null) && <Info>Invalid staged window settings block Inspect in every spectral mode. Use explicit mode to correct them, or Clear/load an example to reset defaults.</Info>}
  {state.windowMode === 'activity' && <>
   <Info>Selected-window energy / threshold. Six separate staged settings: start 0–65535 (1–5 ASCII digits), window 1–4096 (1–4), hop 1–65536 (1–5), frames 1–256 (1–3), threshold numerator and nonzero denominator each 1–128 ASCII digits. At most 262144 processed cells; every complete window must fit. No clipping, padding, fallback or inferred threshold.</Info>
   {([['startSample','Start sample'],['windowSamples','Window samples'],['hopSamples','Hop samples'],['frameCount','Frame count'],['thresholdNumerator','Threshold numerator'],['thresholdDenominator','Threshold denominator']] as const).map(([field,label])=><View key={field}><Info>{label}</Info><TextInput accessibilityLabel={`Activity ${label}`} value={state.activitySettings[field]} onChangeText={text=>activitySetting(field,text)} keyboardType="number-pad" style={{color:'#d8ff6b',borderWidth:1,borderColor:'#414c37',padding:12}}/></View>)}
   {!validActivitySettings(state.activitySettings) && <Info>Invalid activity settings block this mode until corrected.</Info>}
   <Info>Staged defaults are start 0, window 1024, hop 1024, frames 1 and threshold 0/1. This asks whether mean squared raw counts is strictly positive, not an estimated noise floor. Noise and DC can exceed it. Zero example equals 0 and is not above; both quarter-cycle halves have mean 268435456/1, so energy does not detect the frequency-sign change.</Info>
  </>}
  <Info>Settings edits invalidate results without reads or hashes. Clear, either example, and exit/background reset mode to default, FFT 1024, start 0, hop 1024 and frame count 1; activity start 0, window 1024, hop 1024, frames 1, threshold 0/1.</Info>
  <Info>Staged origin: {state.origin}. Metadata label: {state.metadata ? JSON.stringify(state.metadata.name) : 'none'} ({state.metadata?.size ?? 0} bytes). Data label: {state.data ? JSON.stringify(state.data.name) : 'none'} ({state.data?.size ?? 0} bytes).</Info>
  <Info>Names are bounded inert file labels, not paths, authenticated origins or proof of pairing. Hashes cover exact bytes, not names or acquisition history. Producer metadata remains untrusted and inert; no links are opened.</Info>
  <Control title="Inspect staged I/Q pair" onPress={inspect} disabled={state.busy || !state.metadata || !state.data || (state.windowMode === 'activity' ? !validActivitySettings(state.activitySettings) : state.fftSize === null || state.startSample === null || (state.windowMode === 'time-frequency' && (state.hopSamples === null || state.frameCount === null)))}/>
  <Control title="Clear I/Q selection and report" onPress={clear}/>
  <Info>{state.analysisEngine}</Info>
  <Info>{state.message} {state.busy ? 'One outstanding read/hash/analysis job still owns the slot; new inspection waits for settlement.' : ''}</Info>
  <Info>Clear, replacement, exit and background fence publication and request native cancellation between frames. Reads, hashes and synchronous JavaScript work are not interrupted or securely erased. Selection is released on exit/background; new work waits until the previous job settles.</Info>
  {r && <>
   <Info>Source origin: {r.origin}; offline import, acquisition not verified. Import time: {r.importedAt}. Producer-declared timestamp (unvalidated): {r.producerTime === null ? 'not provided' : JSON.stringify(r.producerTime)}.</Info>
   {r.c8Import && <>
    <Info>C8 conversion provenance: {r.c8Import.sourceProfile}, parser {r.c8Import.parserVersion}. {r.c8Import.conversion}. Original data {r.c8Import.original.dataLength} bytes; original sidecar {r.c8Import.original.sidecarLength} bytes.</Info>
    <Info>Original C8 SHA-256: {r.c8Import.original.dataSha256}</Info>
    <Info>Original C8 sidecar SHA-256: {r.c8Import.original.sidecarSha256}</Info>
    <Info>The metadata/data hashes below identify the derived SigMF representation, not the original selected files. Acquisition, producer and authenticity are not verified. Converted int16 rail-hit counts are not original int8 clipping counts.</Info>
   </>}
   <Info>Exact metadata SHA-256: {r.metadataSha256}; {r.metadataLength} bytes.</Info>
   <Info>Exact data SHA-256: {r.dataSha256}; {r.dataLength} bytes.</Info>
   <Info>Optional data SHA-512 status: {r.sha512Status}. A byte match does not authenticate the source.</Info>
   {single && <>
   <Info>{single.statistics.sampleCount} complex samples. Declared sample rate {r.sampleRate} Hz; declared center frequency {r.centerFrequency} Hz. Nominal duration {single.statistics.nominalDurationSeconds} s; last sample time {single.statistics.lastSampleTimeSeconds} s.</Info>
   <Info>Raw I minimum {single.statistics.rawI.minimum}, maximum {single.statistics.rawI.maximum}; raw Q minimum {single.statistics.rawQ.minimum}, maximum {single.statistics.rawQ.maximum}.</Info>
   <Info>Digital normalized mean I {single.statistics.meanI}; mean Q {single.statistics.meanQ}; DC magnitude {single.statistics.dcMagnitude}; peak complex magnitude {single.statistics.peakComplexMagnitude}; RMS {single.statistics.rmsComplexMagnitude}; AC RMS {single.statistics.acRmsComplexMagnitude}.</Info>
   <Info>Rail hits (possible clipping): I negative {single.statistics.railHits.iNegative}, I positive {single.statistics.railHits.iPositive}, Q negative {single.statistics.railHits.qNegative}, Q positive {single.statistics.railHits.qPositive}. Complex pairs {single.statistics.railHits.complexPairCount}; fraction {single.statistics.railHits.complexPairFraction}.</Info>
   {single.spectrum ? <>
    <Info>FFT: {single.spectrum.fftSize} samples, start {single.spectrum.startSample}, end exclusive {single.spectrum.endSampleExclusive}, periodic Hann. Bin spacing {single.spectrum.binSpacingHz} Hz; window duration {single.spectrum.windowDurationSeconds} s. {single.spectrum.normalization}. Peak {single.spectrum.peakBin ? `offset ${single.spectrum.peakBin.offsetHz} Hz; linear amplitude ${single.spectrum.peakBin.amplitude}` : 'none (all zero amplitudes)'}.</Info>
    <Info>FFT bins: page {state.page+1} of {state.pageCount}, eight bins per page, at most 4096 retained bins (not a heap bound). Offset Hz uses declared sample rate. dB is relative to unit amplitude, not dBm; zero amplitude is −∞ dB, not a measured noise floor.</Info>
    <Control title="Show peak bin page" disabled={single.spectrum.peakBin === null} onPress={showPeakPage}/>
    <Control title="Previous I/Q FFT bins" disabled={state.page===0} onPress={()=>page(state.page-1)}/>
    <Control title="Next I/Q FFT bins" disabled={state.page+1>=state.pageCount} onPress={()=>page(state.page+1)}/>
    {state.bins.map(b=><Info key={b.signedBin}>Bin {b.signedBin}: offset {b.offsetHz} Hz; linear amplitude {b.amplitude}; relative-unit dB {b.dbRelativeToUnitAmplitude === null ? '−∞ (zero amplitude)' : b.dbRelativeToUnitAmplitude}.</Info>)}
   </> : <Info>Insufficient samples for default 1024-sample FFT. Full-file statistics only; no padding.</Info>}
   </>}
   {tf && selected && <>
    <Info>Time-frequency: FFT {tf.geometry.fftSize}; start {tf.geometry.startSample}; hop {tf.geometry.hopSamples}; frames {tf.geometry.frameCount}. Periodic Hann; {tf.normalization}. Bin spacing {tf.binSpacingHz} Hz; window duration {tf.windowDurationSeconds} s. Declared sample rate {tf.sampleRate} Hz; declared center frequency {tf.centerFrequency} Hz.</Info>
    <Info>Frame spacing: {tf.spacing}; {tf.gapSamples} sample positions not covered by the selected windows between frames when gapped. Overlapping frames are correlated; Hann neighbors and leakage do not establish independent signals. Full-file statistics omitted.</Info>
    <Info>Retained {tf.cellCount} cells, at most 16384, with multiple arrays; not a heap bound. Pagination limits rendered rows only: four frame summaries and eight selected-frame bins per page.</Info>
    <Info>Frame overview page {state.framePage+1} of {state.framePageCount}. Bounds are half-open; times use declared sample rate and are nominal positions, not RF timestamps.</Info>
    <Control title="Previous time-frequency overview" disabled={state.framePage===0} onPress={()=>framePage(state.framePage-1)}/>
    <Control title="Next time-frequency overview" disabled={state.framePage+1>=state.framePageCount} onPress={()=>framePage(state.framePage+1)}/>
    {state.frames.map(f=><View key={f.index}>
     <Info>Frame {f.index}: samples [{f.startSample}, {f.endSampleExclusive}); nominal start {f.nominalStartSeconds} s, center {f.nominalCenterSeconds} s, end exclusive {f.nominalEndExclusiveSeconds} s; peak signed bin {f.peakSignedBin ?? 'none (all transformed amplitudes zero)'}.</Info>
     <Control title={`Select time-frequency frame ${f.index}`} onPress={()=>selectFrame(f.index)}/>
    </View>)}
    <Control title="Show peak bin page" disabled={selected.peakSignedBin === null} onPress={showPeakPage}/>
    <Info>Selected frame {selected.index}: samples [{selected.startSample}, {selected.endSampleExclusive}); nominal start {selected.nominalStartSeconds} s, center {selected.nominalCenterSeconds} s, end exclusive {selected.nominalEndExclusiveSeconds} s. Peak signed bin {selected.peakSignedBin ?? 'none (all transformed amplitudes zero)'}.</Info>
    <Control title="Previous selected time-frequency frame" disabled={selected.index===0} onPress={()=>selectFrame(selected.index-1)}/>
    <Control title="Next selected time-frequency frame" disabled={selected.index+1>=tf.geometry.frameCount} onPress={()=>selectFrame(selected.index+1)}/>
    <Info>Selected frame bins page {state.page+1} of {state.pageCount}. Display floor {tf.displayFloorDb} dB is only a display clamp, not physical noise. Raw dB is relative to unit amplitude; null means exact zero (−∞), not a measured noise floor.</Info>
    <Control title="Previous I/Q FFT bins" disabled={state.page===0} onPress={()=>page(state.page-1)}/>
    <Control title="Next I/Q FFT bins" disabled={state.page+1>=state.pageCount} onPress={()=>page(state.page+1)}/>
    {state.bins.map(b=><Info key={b.signedBin}>Bin {b.signedBin}: signed offset {b.offsetHz} Hz; declared RF {b.declaredRfHz} Hz; linear magnitude {b.amplitude}; raw relative-unit dB {b.dbRelativeToUnitAmplitude === null ? 'null (−∞, zero amplitude)' : b.dbRelativeToUnitAmplitude}; display dB {b.displayDb}.</Info>)}
   </>}
   {energy && <>
    <Info>Selected-window energy / threshold: {energy.analysisVersion}. Start {energy.options.startSample}; window {energy.options.windowSamples}; hop {energy.options.hopSamples}; frames {energy.options.frameCount}; exact threshold {energy.options.thresholdNumerator}/{energy.options.thresholdDenominator}.</Info>
    <Info>{energy.units}. Mean is the exact sum/window fraction, not claimed reduced. {energy.comparison}. Declared sample rate {energy.sampleRate} Hz; center frequency {energy.centerFrequency} Hz.</Info>
    <Info>{energy.timeBasis}. {energy.runMeaning}. Window relationship: {energy.windowRelationship}.</Info>
    <Info>Processed cells {energy.processedCells}; limits: window {energy.limits.maxWindowSamples}, frames {energy.limits.maxFrames}, cells {energy.limits.maxProcessedCells}, threshold digits {energy.limits.maxThresholdDigits}. Retained at most 256 frames, 128 runs and 256 measured intervals total. Pagination limits rendered rows, not heap: four frames, four run summaries and eight selected-run intervals per page.</Info>
    <Info>Activity frames page {state.activityFramePage+1} of {state.activityFramePageCount}.</Info>
    <Control title="Previous activity frames" disabled={state.activityFramePage===0} onPress={()=>activityFramePage(state.activityFramePage-1)}/>
    <Control title="Next activity frames" disabled={state.activityFramePage+1>=state.activityFramePageCount} onPress={()=>activityFramePage(state.activityFramePage+1)}/>
    {state.activityFrames.map(f=><Info key={f.index}>Activity frame {f.index}: samples [{f.startSample}, {f.endSampleExclusive}); nominal start {f.nominalStartSeconds} s, end exclusive {f.nominalEndExclusiveSeconds} s; exact sum {f.sumSquaredCounts}; exact mean {f.meanSquaredCounts.numerator}/{f.meanSquaredCounts.denominator}; strictly above threshold: {String(f.aboveThreshold)}.</Info>)}
    <Info>Activity runs page {state.activityRunPageCount ? state.activityRunPage+1 : 0} of {state.activityRunPageCount}. Consecutive selected windows are not physical bursts or proof of continuous activity; gapped runs preserve separate measured intervals.</Info>
    <Control title="Previous activity runs" disabled={state.activityRunPage===0} onPress={()=>activityRunPage(state.activityRunPage-1)}/>
    <Control title="Next activity runs" disabled={state.activityRunPage+1>=state.activityRunPageCount} onPress={()=>activityRunPage(state.activityRunPage+1)}/>
    {state.activityRuns.map(r=><View key={r.index}><Info>Activity run {r.index}: frames {r.firstFrameIndex}–{r.lastFrameIndex}; count {r.frameCount}; measured intervals {r.intervalCount}.</Info><Control title={`Select activity run ${r.index}`} onPress={()=>selectActivityRun(r.index)}/></View>)}
    {run ? <>
     <Info>Selected activity run {run.index}: frames {run.firstFrameIndex}–{run.lastFrameIndex}; count {run.frameCount}; measured intervals {run.intervalCount}. Interval page {state.activityIntervalPage+1} of {state.activityIntervalPageCount}.</Info>
     <Control title="Previous activity intervals" disabled={state.activityIntervalPage===0} onPress={()=>activityIntervalPage(state.activityIntervalPage-1)}/>
     <Control title="Next activity intervals" disabled={state.activityIntervalPage+1>=state.activityIntervalPageCount} onPress={()=>activityIntervalPage(state.activityIntervalPage+1)}/>
     {state.activityIntervals.map(i=><Info key={i.startSample}>Measured interval: samples [{i.startSample}, {i.endSampleExclusive}); nominal declared-rate start {i.startSample/energy.sampleRate} s, end exclusive {i.endSampleExclusive/energy.sampleRate} s.</Info>)}
    </> : <Info>No above-threshold runs.</Info>}
   </>}
   {r.warnings.map((w,index)=><Info key={index}>{w}</Info>)}
  </>}
  <Info>Digital amplitudes are not volts, dBm or calibrated RF power. Declared axes are not calibrated carrier measurements. Peaks are not transmitter identities, protocol recognition or modulation classification.</Info>
 </View>;
}
