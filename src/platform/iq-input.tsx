import React from 'react';
import type { IqFile, IqSide, IqPair, IqInputProfile } from '../iq-workbench.ts';
export interface IqInputProps { profile?: IqInputProfile; onFile: (side: IqSide, file: IqFile | null) => void; onPair?: (pair: IqPair) => void; resetKey?: number }
/** Ordinary local browser file handles. Selection stages only; no read, upload or normalization. */
export function IqInput({onFile,profile='sigmf'}: IqInputProps) {
 return <div style={{display:'flex',flexDirection:'column',gap:12,color:'#b8c1af'}}>
  {(['metadata','data'] as const).map(side=><label key={side}>
   {profile === 'mayhem-c8' ? (side === 'metadata' ? 'Exact C8 ASCII .txt sidecar (1–4096 bytes)' : 'Exact signed-int8 .c8 data (2–131072 bytes)') : side === 'metadata' ? 'Exact SigMF metadata file (1–65536 bytes)' : 'Exact ci16_le data file (4–262144 bytes)'}
   <input type="file" aria-label={`I/Q ${side} file`} onChange={event=>{
    const file = event.currentTarget.files?.[0] ?? null;
    // Release the DOM's retained selection; controller owns one staged handle. Reselection of same file works.
    event.currentTarget.value = '';
    if (file) onFile(side,file);
   }}/>
  </label>)}
 </div>;
}
