import React from 'react';
import { Text } from 'react-native';
import type { IqFile, IqSide } from '../iq-workbench.ts';
export interface IqInputProps { onFile: (side: IqSide, file: IqFile | null) => void }
export function IqInput(_props: IqInputProps) {
 return <Text selectable style={{color:'#b8c1af'}}>Arbitrary local file import is unavailable in this native build. You can load the manually authored synthetic example, then explicitly Inspect. Native runtime support has not been validated here.</Text>;
}
