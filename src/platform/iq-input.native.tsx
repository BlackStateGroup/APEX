import React, { useLayoutEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { NativeIqPickerSession, nativeIqSingleFlight } from '../native-iq-files.ts';
import type { IqInputProps } from './iq-input.tsx';

// Inert render never loads native bindings or opens files.
const pick = nativeIqSingleFlight(async (isCurrent: () => boolean) => {
 const DocumentPicker = await import('expo-document-picker');
 if (!isCurrent()) return {canceled:true,assets:null};
 return DocumentPicker.getDocumentAsync({type:'*/*',multiple:true,copyToCacheDirectory:false});
});
async function open(uri: string) {
 const { File, FileMode } = await import('expo-file-system');
 return new File(uri).open(FileMode.ReadOnly);
}

export function IqInput({onPair,resetKey,profile='sigmf'}: IqInputProps) {
 const [session] = useState(()=>new NativeIqPickerSession(pick,open));
 const [,refresh] = useState(0);
 useLayoutEffect(()=>session.subscribe(()=>refresh(n=>n+1)),[session]);
 useLayoutEffect(()=>{
  session.attach(AppState.currentState === 'active');
  const subscription = AppState.addEventListener('change',state=>session.foreground(state === 'active'));
  return ()=>{ subscription.remove(); session.detach(); };
 },[session]);
 useLayoutEffect(()=>session.setProfile(profile),[profile,session]);
 useLayoutEffect(()=>session.reset(),[resetKey,session]);
 const state = session.state;
 return <View style={{gap:10}}>
  <Text selectable style={{color:'#b8c1af'}}>Choose both files in one system picker: {profile === 'mayhem-c8' ? 'one .txt ASCII sidecar (1–4096 bytes) and one .c8 file (2–131072 bytes, even length).' : 'one .sigmf-meta and one .sigmf-data.'} Known sizes are required. No broad storage permission or persistent URI grant is requested. The system/provider may download or stage files; APEX does not request an extra cache copy. Inspect uses read-only chunks of at most 16384 bytes and a one-byte end check. Physical-device acceptance is still unrun.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel="Choose native I/Q pair" disabled={state.picking || !state.foreground} onPress={()=>{
   if (AppState.currentState === 'active') void session.choose(state);
  }}><Text style={{color:'#d8ff6b',padding:12}}>Choose native I/Q pair</Text></Pressable>
  {state.candidate && <Text selectable style={{color:'#b8c1af'}}>Selected labels: {JSON.stringify(state.candidate.metadata)} and {JSON.stringify(state.candidate.data)}. Labels do not prove pairing or source identity.</Text>}
  <Pressable accessibilityRole="button" accessibilityLabel="Stage selected I/Q pair" disabled={!onPair || !state.candidate || !state.foreground || state.picking} onPress={()=>{
   if (AppState.currentState !== 'active') return;
   const pair = session.takePair(state); if (pair) onPair?.(pair);
  }}><Text style={{color:'#d8ff6b',padding:12}}>Stage selected I/Q pair</Text></Pressable>
  <Text selectable style={{color:'#b8c1af'}}>{state.message} If native file support is missing, rebuild this development app. Synthetic examples remain available.</Text>
 </View>;
}
