import React from 'react';
import { Text } from 'react-native';
export interface CaseFileInputProps { disabled: boolean; maxBytes: number; onDocument(text: string): void }
export function CaseFileInput(_props: CaseFileInputProps) { return <Text style={{ color: '#9eab93', fontSize: 12 }}>Paste JSON text here. Native builds also offer a selected local text file.</Text>; }
