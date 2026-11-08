import React from 'react';
import type { IqFile, IqSide, IqPair } from '../iq-workbench.ts';
export interface IqInputProps { onFile: (side: IqSide, file: IqFile | null) => void; onPair?: (pair: IqPair) => void; resetKey?: number }
/** Ordinary local browser file handles. Selection stages only; no read, upload or normalization. */
export function IqInput({onFile}: IqInputProps) {
 return <div style={{display:'flex',flexDirection:'column',gap:12,color:'#b8c1af'}}>
  {(['metadata','data'] as const).map(side=><label key={side}>
   {side === 'metadata' ? 'Exact SigMF metadata file (1–65536 bytes)' : 'Exact ci16_le data file (4–262144 bytes)'}
   <input type="file" aria-label={`I/Q ${side} file`} onChange={event=>{
    const file = event.currentTarget.files?.[0] ?? null;
    // Release the DOM's retained selection; controller owns one staged handle. Reselection of same file works.
    event.currentTarget.value = '';
    if (file) onFile(side,file);
   }}/>
  </label>)}
 </div>;
}
