import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  DEVICE_REPORT_MAX_CHARS, parseDeviceFirmwareReport, compareOfflineFirmwareReports,
} from '../packages/core/device-intelligence-report.ts';
import type { DeviceFirmwareReport, OfflineFirmwareComparison } from '../packages/core/device-intelligence-report.ts';
import { createOfflinePassport, describeUnknownBoundaries } from '../packages/core/device-intelligence.ts';
import { attachFirmwareStructureReport } from '../packages/core/firmware-structure-report.ts';
import type { ImportedFirmwareStructure } from '../packages/core/firmware-structure-report.ts';

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
  const [structureDraft,setStructureDraft]=useState('');
  const [linkedStructure,setLinkedStructure]=useState<ImportedFirmwareStructure|null>(null);
  const [reportA,setReportA]=useState<DeviceFirmwareReport|null>(null);
  const [reportB,setReportB]=useState<DeviceFirmwareReport|null>(null);
  const [comparison,setComparison]=useState<OfflineFirmwareComparison|null>(null);
  const [message,setMessage]=useState('Paste an exact JSON report exported by the desktop inspector, then inspect it.');
  useEffect(()=>{if (!active){setReportA(null);setReportB(null);setComparison(null);setLinkedStructure(null);}},[active]);
  const edit=(slot:'A'|'B',value:string)=>{
    if(value.length>DEVICE_REPORT_MAX_CHARS) {
      setMessage('Input rejected: 65,536-character bound. Previous draft retained, no result available.');
      if(slot==='A'){setReportA(null);setLinkedStructure(null);} else setReportB(null);
      setComparison(null);return;
    }
    if(slot==='A'){setDraftA(value);setReportA(null);setLinkedStructure(null);}else{setDraftB(value);setReportB(null);}
    setComparison(null);setMessage('Draft edited. Inspect explicitly to obtain a new result.');
  };
  const inspect=(slot:'A'|'B')=>{
    try {
      const result=parseDeviceFirmwareReport(slot==='A'?draftA:draftB);
      if(slot==='A'){setReportA(result);setLinkedStructure(null);} else setReportB(result);
      setComparison(null);setMessage('Report '+slot+' inspected as imported, unverified offline metadata.');
    } catch(error) {
      if(slot==='A'){setReportA(null);setLinkedStructure(null);}else setReportB(null);
      setComparison(null);
      setMessage('Import rejected: '+(error instanceof Error?error.message:'invalid report'));
    }
  };
  const editStructure=(value:string)=>{
    if(value.length>32768){
      setLinkedStructure(null);
      setMessage('Structure report rejected: 32,768-character limit. Previous draft remains.');
      return;
    }
    setStructureDraft(value);setLinkedStructure(null);
    setMessage('Structure draft edited. Inspect explicitly against Passport A.');
  };
  const inspectStructure=()=>{
    if(!reportA){setLinkedStructure(null);setMessage('Inspect Passport A before importing structure evidence.');return;}
    try{
      const result=attachFirmwareStructureReport(structureDraft,reportA.passport);
      setLinkedStructure(result);
      setMessage('Structure report matched to Passport A by declared SHA-256, size and format. Original bytes were not verified on this phone.');
    }catch(error){
      setLinkedStructure(null);
      setMessage('Structure import rejected: '+(error instanceof Error?error.message:'invalid report'));
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
    <View style={styles.result}>
      <Text style={styles.heading}>Hash-bound firmware structure</Text>
      <Text style={styles.text}>Paste a separate apex.firmware-structure report generated on the desktop. It can only attach to the exact SHA-256, byte length and firmware format of inspected Passport A. Imported CRC results are declarations, not independent mobile verification or signatures.</Text>
      <TextInput accessibilityLabel="Firmware structure report JSON" multiline value={structureDraft} autoCapitalize="none"
        autoCorrect={false} onChangeText={editStructure} style={styles.input}/>
      <View style={styles.actions}>
        <Control label="Inspect firmware structure against Passport A" disabled={!reportA||!structureDraft.length} onPress={inspectStructure}/>
        <Control label="Clear firmware structure draft" onPress={()=>{setStructureDraft('');setLinkedStructure(null);setMessage('Structure draft cleared.');}}/>
      </View>
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>
    {reportA&&<PassportCard title="Passport A" report={reportA}/>}
    {reportB&&<PassportCard title="Passport B" report={reportB}/>}
    {linkedStructure&&<View style={styles.result}>
      <Text style={styles.heading}>Linked structure · {linkedStructure.structure.kind}</Text>
      <Text selectable style={styles.digest}>Source SHA-256: {linkedStructure.source.sha256}</Text>
      <Text style={styles.text}>Status: {linkedStructure.structure.status}. Compression: {linkedStructure.structure.compression}.</Text>
      <Text style={styles.text}>Reported U-Boot header CRC: {linkedStructure.structure.headerCrc};
        payload CRC: {linkedStructure.structure.payloadCrc}. Declared payload size: {linkedStructure.structure.payloadBytes??'unknown'} bytes.</Text>
      <Text style={styles.text}>SquashFS declared bytes used: {linkedStructure.structure.usedBytes??'unknown'}.</Text>
      <Text style={styles.warning}>Original byte verification: NOT PERFORMED ON THIS PHONE. Signature: NOT VERIFIED. Root: UNKNOWN.</Text>
      {linkedStructure.warnings.map((warning,i)=><Text key={i} style={styles.text}>{warning}</Text>)}
    </View>}
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
