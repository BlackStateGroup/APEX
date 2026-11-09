import React, { useLayoutEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EvidenceStore } from '../packages/core/evidence.ts';
import { EvidenceExportWorkbench as Controller, EVIDENCE_EXPORT_LIMIT, EVIDENCE_EXPORT_PAGE_SIZE } from './evidence-export-workbench.ts';
import type { EvidenceExportState } from './evidence-export-workbench.ts';
import { bundleDigest } from './platform/bundle-digest';
import { hciDigest } from './platform/hci-digest';
import { EvidenceShare } from './platform/evidence-share';
import { evidenceShareByteLength, MAX_NATIVE_EVIDENCE_SHARE_BYTES } from './native-evidence-share.ts';

export function EvidenceExportWorkbench({active,store}:{active:boolean;store:EvidenceStore}) {
 const [controller]=useState(()=>new Controller(false));
 const [,refresh]=useState(0);
 const activeNow=useRef(active);activeNow.current=active;
 const changed=()=>refresh(value=>value+1);
 useLayoutEffect(()=>{
  const sync=()=>{if(active&&AppState.currentState==='active')controller.activate();else controller.deactivate();changed();};
  sync();
  let subscription:ReturnType<typeof AppState.addEventListener>;
  try{subscription=AppState.addEventListener('change',sync);}
  catch(error){controller.deactivate();throw error;}
  return()=>{controller.deactivate();subscription.remove();};
 },[active,controller]);
 const state=controller.state,lease=controller.lease;
 const current=()=>activeNow.current&&AppState.currentState==='active'&&controller.isActive(lease)&&state===controller.state;
 const act=(action:()=>void)=>{if(current()){action();changed();}};
 const run=(action:()=>Promise<void>)=>act(()=>{void action().then(()=>{if(activeNow.current&&controller.isActive(lease))changed();});});
 if(!active)return null;
 return <EvidenceExportWorkbenchView state={state}
  refresh={()=>run(()=>controller.refresh(()=>store.listDocuments(EVIDENCE_EXPORT_LIMIT),lease,state))}
  prepare={()=>run(()=>controller.prepare(bundleDigest,hciDigest,new Date().toISOString(),lease,state))}
  toggle={id=>act(()=>controller.toggle(id,lease,state))}
  clear={()=>act(()=>controller.clear())} page={value=>act(()=>controller.page(value))}
  share={<EvidenceShare document={state.bundle} preparationId={state.preparationId} sourceCurrent={current}/>}/>;
}

function Control({title,onPress,disabled=false}:{title:string;onPress:()=>void;disabled?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{title}</Text></Pressable>;
}
export function EvidenceExportWorkbenchView({state,refresh,prepare,toggle,clear,page,share}:{state:EvidenceExportState;refresh:()=>void;prepare:()=>void;toggle:(id:string)=>void;clear:()=>void;page:(n:number)=>void;share?:React.ReactNode}) {
 const pages=Math.ceil(state.records.length/EVIDENCE_EXPORT_PAGE_SIZE);
 const bundleBytes=state.bundle===null?0:evidenceShareByteLength(state.bundle);
 return <View style={styles.card}>
  <Text style={styles.heading}>Export selected local evidence</Text>
  <Text style={styles.text}>Load up to the latest {EVIDENCE_EXPORT_LIMIT} local records, select individual records, then explicitly Prepare. Nothing is selected automatically. Preparation verifies the selected canonical record content digests and creates the existing apex.selected-evidence bundle with their exact stored strings, including payloads. Digests are not signatures or proof of source authenticity.</Text>
  <Text style={styles.text}>This is a bounded selection, not a full backup. No journal changes, restore, automatic sharing or upload. Records saved later are not included until you Load again. Refresh, Clear, leaving Evidence or backgrounding clears the selection and prepared text; already-issued native sharing cannot be recalled.</Text>
  <View style={styles.actions}><Control title="Load local records for export" disabled={state.pending!==null} onPress={refresh}/><Control title="Clear selected export" onPress={clear}/></View>
  <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
  <Text style={styles.text}>{state.selectedIds.length} selected of {state.records.length} loaded. Loaded metadata is unverified until Prepare succeeds.</Text>
  {pages>0&&<>
   <Text style={styles.text}>Export record page {state.page+1} of {pages}. {EVIDENCE_EXPORT_PAGE_SIZE} metadata rows per page; payloads are not shown here.</Text>
   <View style={styles.actions}><Control title="Previous export records" disabled={state.page===0} onPress={()=>page(state.page-1)}/><Control title="Next export records" disabled={state.page+1>=pages} onPress={()=>page(state.page+1)}/></View>
   {state.records.slice(state.page*EVIDENCE_EXPORT_PAGE_SIZE,(state.page+1)*EVIDENCE_EXPORT_PAGE_SIZE).map(record=><View key={record.id} style={{gap:6}}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={`Select export record ${record.id}`} accessibilityState={{checked:state.selectedIds.includes(record.id)}} onPress={()=>toggle(record.id)} style={styles.button}><Text style={styles.text}>{state.selectedIds.includes(record.id)?'Selected':'Not selected'} · {JSON.stringify(record.id)}</Text></Pressable>
    <Text style={styles.text}>Kind {record.kind} · declared source {record.source} · declared record time {JSON.stringify(record.observedAt.slice(0,120))}{record.observedAt.length>120?' [display truncated]':''}</Text>
   </View>)}
  </>}
  <Control title="Prepare selected evidence bundle" disabled={state.pending!==null||state.selectedIds.length===0} onPress={prepare}/>
  {state.bundle!==null&&<>
   <Text style={styles.heading}>Prepared exact selected-record bundle</Text>
   <Text style={styles.text}>{state.selectedIds.length} records · {state.bundle.length} UTF-16 code units · {bundleBytes} UTF-8 bytes. The new export time is a local-clock declaration. Stored record strings and declared sources are preserved, not rewritten.</Text>
   {bundleBytes<=MAX_NATIVE_EVIDENCE_SHARE_BYTES?<TextInput accessibilityLabel="Exact prepared evidence bundle text" value={state.bundle} multiline editable={false} style={styles.input} autoCapitalize="none" autoCorrect={false}/>:<Text style={styles.text}>Prepared bundle exceeds the bounded text display and native-share limit. Prepare fewer records to display or share the whole text. No partial text is displayed or sent.</Text>}
  </>}
  {share}
 </View>;
}
const styles=StyleSheet.create({
 card:{minWidth:0,padding:18,gap:14,borderWidth:1,borderColor:'#414c37',borderRadius:6},
 heading:{color:'#d8ff6b',fontSize:17,fontWeight:'600'},text:{minWidth:0,flexShrink:1,color:'#b8c1af',fontSize:13,lineHeight:21},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:10},button:{padding:12,borderWidth:1,borderColor:'#414c37',borderRadius:4,maxWidth:'100%'},
 input:{minHeight:120,maxHeight:240,padding:12,backgroundColor:'#11170f',color:'#c9d5bc',textAlignVertical:'top'},
});
