import React, { useLayoutEffect, useRef, useState } from 'react';
import { AppState, Pressable, Share, Text, View } from 'react-native';
import { createEvidenceShareGate, evidenceShareByteLength, MAX_NATIVE_EVIDENCE_SHARE_BYTES, EvidenceShareBusyError, EvidenceShareSizeError } from '../native-evidence-share.ts';
import type { EvidenceShareProps } from './evidence-share.tsx';

const share=createEvidenceShareGate(async document=>{
 const result=await Share.share({message:document,title:'APEX selected evidence'},{dialogTitle:'Share selected APEX evidence text'});
 if(result.action===Share.dismissedAction)return 'dismissed';
 if(result.action===Share.sharedAction)return 'returned';
 throw new Error('Unrecognized native share response.');
});

export function EvidenceShare({document,preparationId,sourceCurrent}:EvidenceShareProps) {
 const owner=useRef({mounted:false,epoch:0});
 const consumed=useRef<number|null>(null);
 const [state,setState]=useState({pending:false,message:''});
 useLayoutEffect(()=>{owner.current.mounted=true;return()=>{owner.current.mounted=false;++owner.current.epoch;};},[]);
 useLayoutEffect(()=>{++owner.current.epoch;setState({pending:false,message:''});},[document,preparationId]);
 const epoch=owner.current.epoch;
 const current=()=>owner.current.mounted&&owner.current.epoch===epoch&&AppState.currentState==='active'&&sourceCurrent();
 const bytes=document===null?0:evidenceShareByteLength(document);
 const oversized=bytes>MAX_NATIVE_EVIDENCE_SHARE_BYTES;
 return <View style={{gap:10}}>
  <Text style={{color:'#b8c1af'}}>Share opens the system sheet with the entire prepared bundle as text, including selected payloads, identifiers and timestamps. Choose the destination yourself. A receiving app may alter or truncate text; verify the received bundle separately. APEX does not create a file, write the clipboard or choose a destination.</Text>
  <Text style={{color:'#b8c1af'}}>Native text limit: {MAX_NATIVE_EVIDENCE_SHARE_BYTES} UTF-8 bytes. {document===null?'Prepare a selection first.':`${bytes} prepared bytes.`} {oversized?'Too large to share whole. Prepare fewer records; nothing is truncated.':''}</Text>
  <Text style={{color:'#b8c1af'}}>Each preparation allows one share attempt. Prepare again for another attempt. The native API may return before the Android chooser closes; it does not confirm delivery.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel="Share prepared evidence text" disabled={!document||oversized||state.pending||consumed.current===preparationId} onPress={()=>{
   if(!document||state.pending||consumed.current===preparationId||!current())return;
   consumed.current=preparationId;
   setState({pending:true,message:'Opening the system share sheet with the prepared text. Delivery is not confirmed.'});
   void share(document,current).then(result=>{
    if(!current())return;
    setState({pending:false,message:result==='dismissed'?'System share sheet dismissed. Delivery is not confirmed.':result==='returned'?'Native share API returned. Delivery is not confirmed; Android may return before the chooser closes.':'Share not opened because this selection is no longer current.'});
   }).catch(error=>{
    if(!current())return;
    setState({pending:false,message:error instanceof EvidenceShareBusyError?'An earlier native share API request is still pending. After it settles, Prepare again to retry.':error instanceof EvidenceShareSizeError?'Prepared text exceeds the native limit. Prepare fewer records; nothing was truncated or sent.':'Native share failed or its result is unknown. Delivery is unknown; restart the app before another native share.'});
   });
  }}><Text style={{color:'#d8ff6b',padding:12}}>Share prepared evidence text</Text></Pressable>
  <Text accessibilityLiveRegion="polite" style={{color:'#b8c1af'}}>{state.message}</Text>
 </View>;
}
