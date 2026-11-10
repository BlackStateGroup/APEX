import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { captureNativeLocalFile, NativeLocalFileCloseError } from '../native-local-file.ts';
import type { CaseFileInputProps } from './case-file-input.tsx';

// Shared across source and restore pickers. Pending native work retains this slot.
let owned = false, uncertain = false;
export function CaseFileInput({ disabled, maxBytes, onDocument }: CaseFileInputProps) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const epoch = useRef(0), mounted = useRef(true), disabledRef = useRef(disabled); disabledRef.current = disabled;
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', value => { if (value !== 'active') ++epoch.current; });
    return () => { mounted.current = false; ++epoch.current; sub.remove(); };
  }, []);
  async function choose() {
    if (owned || uncertain || disabled || AppState.currentState !== 'active') return;
    owned = true; setBusy(true); const token = ++epoch.current;
    const current = () => mounted.current && epoch.current === token && !disabledRef.current && AppState.currentState === 'active';
    try {
      const picker = await import('expo-document-picker'); if (!current()) return;
      const result = await picker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: false });
      if (!current() || result.canceled) return;
      if (result.assets.length !== 1) throw new Error('Select exactly one text file');
      const file = captureNativeLocalFile(result.assets[0]!, 1, maxBytes);
      const bytes = await file.read(async uri => {
        const { File, FileMode } = await import('expo-file-system'); if (!current()) throw new Error('Import cancelled');
        return new File(uri).open(FileMode.ReadOnly);
      }, current);
      if (current()) { onDocument(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); setMessage('Selected UTF-8 text loaded. Nothing saved until you confirm the action.'); }
    } catch (error) {
      if (error instanceof NativeLocalFileCloseError) uncertain = true;
      if (mounted.current) setMessage(uncertain ? 'File cleanup uncertain. Restart before importing again.' : error instanceof Error ? error.message : 'File import failed');
    } finally { owned = false; if (mounted.current) setBusy(false); }
  }
  return <View style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityLabel="Choose local case text" disabled={disabled || busy || uncertain} onPress={() => void choose()}><Text style={{ color: '#d8ff9e', padding: 12 }}>Choose local text file (up to {maxBytes} bytes)</Text></Pressable><Text style={{ color: '#9eab93' }}>{message}</Text></View>;
}
