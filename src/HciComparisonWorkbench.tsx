import React, { useLayoutEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { HciComparisonController } from './hci-comparison-workbench.ts';
import type { ComparisonState, ComparisonSource, Side } from './hci-comparison-workbench.ts';
import { hciDigest } from './platform/hci-digest';
import { HCI_COMPARISON_EXAMPLES } from './hci-comparison-examples.ts';
function Control({title,disabled=false,onPress}:{title:string;disabled?:boolean;onPress:()=>void}) { return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}><Text style={{color:'#d8ff6b',padding:12}}>{title}</Text></Pressable>; }
function Info({children}:{children:React.ReactNode}) { return <Text selectable style={{color:'#b8c1af',lineHeight:21}}>{children}</Text>; }
export function HciComparisonWorkbench({active,selectedSource}:{active:boolean;selectedSource?:ComparisonSource|null}) {
 const [controller] = useState(()=>new HciComparisonController(active,hciDigest)); const [,refresh] = useState(0); const changed=()=>refresh(n=>n+1);
 useLayoutEffect(()=>{if(active) controller.activate();else controller.deactivate();changed();return ()=>controller.deactivate();},[active,controller]);
 useLayoutEffect(()=>{controller.receive(selectedSource);changed();},[controller,selectedSource]);
 const state=controller.state,lease=controller.lease;
 const act=(action:()=>void|Promise<void>)=>{if(controller.isActive(lease)&&state===controller.state){const pending=action();changed();if(pending) void pending.then(()=>{if(controller.isActive(lease)) changed();});}};
 if(!active) return null;
 return <HciComparisonWorkbenchView state={state} canCompare={controller.canCompare()} edit={(s,d)=>act(()=>controller.edit(s,d,lease,state))} clear={s=>act(()=>controller.clear(s,lease,state))} verify={s=>act(()=>controller.verify(s,lease,state))} select={(s,i)=>act(()=>controller.select(s,i,lease,state))} page={(s,p)=>act(()=>controller.reportPage(s,p,lease,state))} resultPage={p=>act(()=>controller.resultPage(p,lease,state))} compare={()=>act(()=>controller.compare(lease,state))} example={()=>act(()=>controller.example(HCI_COMPARISON_EXAMPLES[0],HCI_COMPARISON_EXAMPLES[1],lease,state))} />;
}
export interface ComparisonViewProps { state:ComparisonState;canCompare:boolean;edit:(s:Side,d:string)=>void;clear:(s:Side)=>void;verify:(s:Side)=>void;select:(s:Side,i:number)=>void;page:(s:Side,p:number)=>void;resultPage:(p:number)=>void;compare:()=>void;example:()=>void }
export function HciComparisonWorkbenchView({state,canCompare,edit,clear,verify,select,page,resultPage,compare,example}:ComparisonViewProps) {
 return <View style={{padding:18,gap:14,borderWidth:1,borderColor:'#414c37'}}>
 <Info>HCI explicit report byte comparison</Info>
 <Info>Memory only. Each exact document is bounded to 4096 UTF-16 code units. Whole rejected edits retain old text and fence verification until accepted replacement or Clear. No trimming or normalization. Both exact whole-event drafts may contain multiple advertisers, sensitive vendor identifiers and arbitrary content. No persistence, import/export, share, clipboard, provider or device actions.</Info>
 <Control title="Load synthetic comparison example" onPress={example}/><Info>Manually authored synthetic documents, not physical validation. Loading never verifies, selects or compares.</Info>
 {(['left','right'] as const).map(side=>{const slot=state[side],value=slot.value;return <View key={side} style={{gap:8}}>
 <Info>{side} document · requested report {slot.requested ?? 'none'} · usable selected report {slot.selected ?? 'none'}</Info>
 <TextInput accessibilityLabel={`${side} HCI comparison document`} multiline autoCorrect={false} autoCapitalize="none" value={slot.draft} onChangeText={d=>edit(side,d)} style={{color:'#b8c1af',minHeight:120,maxHeight:250}}/>
 <Info>{slot.draft.length} retained UTF-16 code units. {slot.message}</Info>
 <Control title={`Verify ${side} HCI comparison document`} disabled={slot.pending||slot.rejected} onPress={()=>verify(side)}/><Control title={`Clear ${side} HCI comparison document`} onPress={()=>clear(side)}/>
 {value&&<><Info>{side} declared provenance {JSON.stringify(value.context.provenance)}; inert quoted label {JSON.stringify(value.context.label)}. Operator declarations only.</Info>
 <Info>{side} verified derivative binary SHA-256 {value.derivative.sha256}; {value.derivative.byteCount} bytes. Trusted adapter; digest covers decoded single-record derivative, not JSON or original capture.</Info>
 <Info>{side} UNVERIFIED original-source references: SHA-256 {value.sourceReference.sha256}; bytes {value.sourceReference.byteCount}; record index {value.sourceReference.recordIndex}; record offset {value.sourceReference.recordOffset}. No authentication, identity, truthful timing or physical reception established.</Info>
 <Info>{slot.reports.length} reports · page {slot.page+1} of {Math.ceil(slot.reports.length/4)}</Info>
 <Control title={`Previous ${side} reports`} disabled={slot.page===0} onPress={()=>page(side,slot.page-1)}/><Control title={`Next ${side} reports`} disabled={(slot.page+1)*4>=slot.reports.length} onPress={()=>page(side,slot.page+1)}/>
 {slot.reports.slice(slot.page*4,slot.page*4+4).map(r=><View key={r.index}><Info>Report {r.index}: event type {r.eventType}; kind {r.kind}; address type {r.addressType}; supplied wire address {r.addressWireHex}; data length {r.dataLength}; derivative data offset {r.dataOffset}; AD framing {r.adStatus}.</Info><Control title={`Select ${side} report ${r.index}`} onPress={()=>select(side,r.index)}/></View>)}
 </>}
 </View>;})}
 <Info>Data-byte offsets include AD length/type headers and UUID bytes, NOT service-payload coordinates. Derivative offsets start at decoded single-record byte zero. AD framing/service states are separate from transport acceptance. Unknown/encrypted content remains opaque. Supplied field equality is not sender identity. Different metadata and scan responses remain separate: no pooling, alignment, inferred fields or statistical independence, statistical significance or experimental control. Empty and same-document comparisons are mathematical results, not independent observations. Labels, URI and text stay inert.</Info>
 <Control title="Compare explicit HCI reports" disabled={!canCompare} onPress={compare}/><Info>{state.message}</Info>
 {state.result&&<><Info>Supplied metadata equality: event type {String(state.result.metadataEquality.eventType)}; kind {String(state.result.metadataEquality.kind)}; address type {String(state.result.metadataEquality.addressType)}; address bytes {String(state.result.metadataEquality.addressWireHex)}.</Info>
 <Info>Data bytes equal: {String(state.result.dataBytesEqual)}; {state.result.rows.length} positional rows; page {state.page+1} of {Math.max(1,Math.ceil(state.result.rows.length/8))}.</Info>
 <Control title="Previous comparison rows" disabled={state.page===0} onPress={()=>resultPage(state.page-1)}/><Control title="Next comparison rows" disabled={(state.page+1)*8>=state.result.rows.length} onPress={()=>resultPage(state.page+1)}/>
 {state.result.rows.slice(state.page*8,state.page*8+8).map(r=><Info key={r.dataByteOffset}>Data-byte offset {r.dataByteOffset}: left {r.leftHex===null?'absent (null)':`hex ${r.leftHex}`} at derivative {r.leftDerivativeOffset??'absent (null)'}; right {r.rightHex===null?'absent (null)':`hex ${r.rightHex}`} at derivative {r.rightDerivativeOffset??'absent (null)'}; {r.relation}.</Info>)}
 </>}
 </View>;
}
