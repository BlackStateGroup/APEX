import React, { useLayoutEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { NativeHciFileSession, nativeHciSingleFlight } from '../native-hci-file.ts';
import type { CapturedNativeLocalFile } from '../native-local-file.ts';
import type { HciInputProps } from './hci-input.tsx';

const pick=nativeHciSingleFlight(async (current: () => boolean) => {
 const DocumentPicker=await import('expo-document-picker');
 if (!current()) return {canceled:true,assets:null};
 return DocumentPicker.getDocumentAsync({type:'*/*',multiple:false,copyToCacheDirectory:false});
});
const read=nativeHciSingleFlight(async (file: CapturedNativeLocalFile, current: () => boolean) => file.read(async uri => {
 const {File,FileMode}=await import('expo-file-system');
 if (!current()) throw new Error('Import no longer current.');
 return new File(uri).open(FileMode.ReadOnly);
},current),true);

export function HciInput({resetKey,sourceCurrent,onBytes}: HciInputProps) {
 const [session]=useState(()=>new NativeHciFileSession(pick,read));
 const [,refresh]=useState(0);
 useLayoutEffect(()=>session.subscribe(()=>refresh(n=>n+1)),[session]);
 useLayoutEffect(()=>{
  session.attach(AppState.currentState==='active');
  let subscription: ReturnType<typeof AppState.addEventListener>;
  try {subscription=AppState.addEventListener('change',state=>session.foreground(state==='active'));}
  catch (error) {session.detach();throw error;}
  return ()=>{session.detach();subscription.remove();};
 },[session]);
 useLayoutEffect(()=>session.reset(),[resetKey,session]);
 const state=session.state;
 const current=()=>AppState.currentState==='active'&&sourceCurrent();
 return <View style={{gap:10}}>
  <Text selectable style={{color:'#b8c1af'}}>Native HCI file import: choose one supplied btsnoop/H4 file, 16–32768 bytes with a known size. Choose retains its handle only. Load reads local bytes into the hex draft, declares imported provenance and clears old results; Inspect remains separate. No radio capture, upload, save or persistent URI grant.</Text>
  <Text selectable style={{color:'#b8c1af'}}>The system/provider may download or stage the file. APEX requests no extra cache copy and reads at most 16384 bytes per chunk plus a one-byte end check. Labels, source identity and original capture history are unverified. Physical iPhone/Android acceptance remains unrun.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel="Choose native HCI file" disabled={state.picking||state.reading||!state.foreground} onPress={()=>{if(current())void session.choose(state);}}><Text style={{color:'#d8ff6b',padding:12}}>Choose native HCI file</Text></Pressable>
  {state.candidate&&<Text selectable style={{color:'#b8c1af'}}>Selected label: {JSON.stringify(state.candidate.name)} · declared size {state.candidate.size} bytes. The label does not validate the format.</Text>}
  <Pressable accessibilityRole="button" accessibilityLabel="Load selected HCI bytes" disabled={!state.candidate||state.picking||state.reading||!state.foreground} onPress={()=>{
   if(!current())return;
   void session.load(state,current).then(bytes=>{if(bytes&&current())onBytes(bytes);});
  }}><Text style={{color:'#d8ff6b',padding:12}}>Load selected HCI bytes</Text></Pressable>
  <Text selectable style={{color:'#b8c1af'}}>{state.message} If native file support is unavailable, rebuild this development app or use the existing strict hex input.</Text>
 </View>;
}
