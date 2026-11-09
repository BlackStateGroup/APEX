import React from 'react';
import { Text } from 'react-native';
export interface EvidenceShareProps { document: string | null; preparationId: number; sourceCurrent: () => boolean }
/** No browser share, clipboard, download or network behavior. */
export function EvidenceShare(_props: EvidenceShareProps) {
 return <Text style={{color:'#b8c1af'}}>Native text sharing is available in iPhone and Android development builds. Prepared text remains selectable here; this web view does not share or download it.</Text>;
}
