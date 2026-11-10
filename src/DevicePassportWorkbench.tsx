import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  DEVICE_REPORT_MAX_CHARS, parseDeviceFirmwareReport, compareOfflineFirmwareReports,
} from '../packages/core/device-intelligence-report.ts';
import type { DeviceFirmwareReport, OfflineFirmwareComparison } from '../packages/core/device-intelligence-report.ts';
import { createOfflinePassport, describeUnknownBoundaries } from '../packages/core/device-intelligence.ts';

const synthetic = () => JSON.stringify({
  schemaVersion:1,kind:'apex.firmware-analysis',
  passport:createOfflinePassport(
    {name:'synthetic-router.bin',sha256:'0'.repeat(64),bytes:1024,format:'unknown'},
    {sshConfigurationMarker:true,credentialConfigurationMarker:false,webManagementMarker:true}),
  archive:null,
  inspection:{method:'bounded-static-byte-inspection',decompressed:false,firmwareExecuted:false,
    credentialValuesReturned:false,networkOrHardwareContact:false},
  limitations:[
    'Synthetic example only. No real device or firmware was inspected.',
    'Byte-pattern markers do not establish login, passwords or root access.',
    'Content hashes do not establish firmware authenticity.',
  ],
});

function Control({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    disabled={disabled} style={[styles.button,disabled&&styles.disabled]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}
function PassportCard({title,report}:{title:string;report:DeviceFirmwareReport}) {
  const p=report.passport, b=describeUnknownBoundaries(p);
  return <View style={styles.result}>
    <Text style={styles.heading}>{title} · {p.source.format.toUpperCase()} · offline</Text>
    <Text selectable style={styles.text}>Source filename: {p.source.name}. Size: {p.source.bytes} bytes.</Text>
    <Text selectable style={styles.digest}>SHA-256: {p.source.sha256}</Text>
    <Text style={styles.text}>Static markers only: SSH configuration {p.indicators.sshConfigurationMarker?'observed':'not observed'};
      credential-configuration {p.indicators.credentialConfigurationMarker?'observed':'not observed'};
      web-management {p.indicators.webManagementMarker?'observed':'not observed'}.
    </Text>
    {p.rea && <Text style={styles.text}>REA imported ELF evidence: {p.rea.architecture}, {p.rea.coverage}.
      This report only binds to identical bytes. Root and device identity remain unverified.</Text>}
    {report.archive && <Text style={styles.text}>TAR headers: {report.archive.entriesExamined} examined;
      {report.archive.unsafeEntryIndicators} unsafe-type/path indicators;
      incomplete: {report.archive.incomplete?'yes':'no'}. No files extracted.</Text>}
    <Text style={styles.heading}>Independent security boundaries</Text>
    {b.map(item=><Text key={item.id} style={styles.text}>{item.id}: UNKNOWN. {item.interpretation}</Text>)}
    <Text style={styles.warning}>Root access: UNKNOWN. Administrative access: UNKNOWN.
      No hardware, network or authentication operation took place.</Text>
    {report.warnings.map((warning,i)=><Text key={i} style={styles.text}>{warning}</Text>)}
  </View>;
}

/** Data-only pasted-report viewer. This component cannot start REA, Wi-Fi traffic or any router operation. */
export function DevicePassportWorkbench({active}:{active:boolean}) {
  const [draftA,setDraftA]=useState('');
  const [draftB,setDraftB]=useState('');
  const [reportA,setReportA]=useState<DeviceFirmwareReport|null>(null);
  const [reportB,setReportB]=useState<DeviceFirmwareReport|null>(null);
  const [comparison,setComparison]=useState<OfflineFirmwareComparison|null>(null);
  const [message,setMessage]=useState('Paste an exact JSON report exported by the desktop inspector, then inspect it.');
  useEffect(()=>{if (!active){setReportA(null);setReportB(null);setComparison(null);}},[active]);
  const edit=(slot:'A'|'B',value:string)=>{
    if(value.length>DEVICE_REPORT_MAX_CHARS) {
      setMessage('Input rejected: 65,536-character bound. Previous draft retained, no result available.');
      if(slot==='A') setReportA(null); else setReportB(null);
      setComparison(null);return;
    }
    if(slot==='A'){setDraftA(value);setReportA(null);}else{setDraftB(value);setReportB(null);}
    setComparison(null);setMessage('Draft edited. Inspect explicitly to obtain a new result.');
  };
  const inspect=(slot:'A'|'B')=>{
    try {
      const result=parseDeviceFirmwareReport(slot==='A'?draftA:draftB);
      if(slot==='A') setReportA(result); else setReportB(result);
      setComparison(null);setMessage('Report '+slot+' inspected as imported, unverified offline metadata.');
    } catch(error) {
      if(slot==='A') setReportA(null);else setReportB(null);
      setComparison(null);
      setMessage('Import rejected: '+(error instanceof Error?error.message:'invalid report'));
    }
  };
  if(!active)return null;
  return <View style={styles.card}>
    <Text style={styles.heading}>Device Intelligence · Firmware Passport</Text>
    <Text style={styles.text}>Paste output from the APEX desktop firmware inspector. Imports are data only, held in memory and lost on reload. No firmware bytes are executed, no connection is initiated, and no secrets or credentials are recovered. Leaving the inspector clears interpreted results; drafts remain in memory.</Text>
    <Text style={styles.text}>Every management, network, root and boot capability starts unknown. An ELF REA report must already have been hash-bound by the desktop tool. A firmware indicator is not proof of an account, security vulnerability or supported command.</Text>
    <Control label="Load labelled synthetic Passport A" onPress={()=>edit('A',synthetic())} />
    <Text style={styles.text}>Passport A report JSON · {draftA.length} characters</Text>
    <TextInput accessibilityLabel="Firmware Passport A JSON" multiline value={draftA} autoCapitalize="none"
      autoCorrect={false} onChangeText={value=>edit('A',value)} style={styles.input}/>
    <Control label="Inspect Firmware Passport A" disabled={!draftA.length} onPress={()=>inspect('A')}/>
    <Text style={styles.text}>Passport B for offline comparison · {draftB.length} characters</Text>
    <TextInput accessibilityLabel="Firmware Passport B JSON" multiline value={draftB} autoCapitalize="none"
      autoCorrect={false} onChangeText={value=>edit('B',value)} style={styles.input}/>
    <View style={styles.actions}>
      <Control label="Inspect Firmware Passport B" disabled={!draftB.length} onPress={()=>inspect('B')}/>
      <Control label="Compare inspected firmware reports" disabled={!reportA||!reportB}
        onPress={()=>{if(reportA&&reportB){setComparison(compareOfflineFirmwareReports(reportA,reportB));
          setMessage('Offline source comparison only. No security patch or hardware behaviour is verified.');}}}/>
      <Control label="Clear both Passport drafts" onPress={()=>{
        setDraftA('');setDraftB('');setReportA(null);setReportB(null);setComparison(null);setMessage('Cleared.');}}/>
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>
    {reportA&&<PassportCard title="Passport A" report={reportA}/>}
    {reportB&&<PassportCard title="Passport B" report={reportB}/>}
    {comparison&&<View style={styles.result}>
      <Text style={styles.heading}>Exact offline comparison</Text>
      <Text style={styles.text}>Same SHA-256: {comparison.sameFirmwareBytes?'yes':'no'};
        format changed: {comparison.formatChanged?'yes':'no'}; changed marker classes:
        {comparison.changedIndicators.length?comparison.changedIndicators.join(', '):'none'}.</Text>
      <Text style={styles.warning}>Security patch established: NO. Actual device equivalence: UNKNOWN.
        No privilege or vulnerability conclusions are implied.</Text>
    </View>}
  </View>;
}
const styles=StyleSheet.create({
  card:{backgroundColor:'#121713',borderWidth:1,borderColor:'#384838',padding:15,gap:12,marginTop:12,borderRadius:4},
  heading:{color:'#e7f5df',fontSize:18,fontWeight:'700'},
  text:{color:'#d1d8cf',fontSize:13,lineHeight:20},
  digest:{color:'#a5dea0',fontSize:12,lineHeight:18},
  input:{minHeight:120,maxHeight:245,borderColor:'#526353',borderWidth:1,borderRadius:4,padding:10,
    color:'#e7f5df',backgroundColor:'#0b0f0c',textAlignVertical:'top',fontSize:12},
  button:{paddingVertical:11,paddingHorizontal:12,borderWidth:1,borderColor:'#6c8663',
    backgroundColor:'#1b261b',borderRadius:4,alignSelf:'flex-start'},
  disabled:{opacity:0.4},
  buttonText:{color:'#d8f1cd',fontSize:13,fontWeight:'600'},
  result:{backgroundColor:'#182118',padding:12,gap:9,borderColor:'#3f5540',borderWidth:1,borderRadius:4},
  warning:{color:'#e2c6a3',fontSize:13,lineHeight:20},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:9},
});
