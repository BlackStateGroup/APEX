/** Conservative text handoff bound, not a promise about any receiving app's limits. */
export const MAX_NATIVE_EVIDENCE_SHARE_BYTES = 256 * 1024;
export type EvidenceShareOutcome = 'dismissed' | 'returned';
export type EvidenceShareBoundary = (document: string) => Promise<EvidenceShareOutcome>;
export class EvidenceShareBusyError extends Error {}
export class EvidenceShareUncertainError extends Error {}
export class EvidenceShareSizeError extends Error {}

/** UTF-8 byte count without requiring TextEncoder in the mobile runtime. */
export function evidenceShareByteLength(text: string): number {
 let size=0;
 for(let index=0;index<text.length;index++) {
  const code=text.charCodeAt(index);
  if(code<0x80)size++;
  else if(code<0x800)size+=2;
  else if(code>=0xd800&&code<=0xdbff&&index+1<text.length&&text.charCodeAt(index+1)>=0xdc00&&text.charCodeAt(index+1)<=0xdfff){size+=4;index++;}
  else size+=3;
 }
 return size;
}

/** Module-lifetime gate: remount does not cancel a pending native API request.
 * Android may resolve immediately after launching the chooser; this gate cannot
 * certify that an OS sheet closed. UI owners separately consume each preparation.
 * A dispatch error leaves its outcome uncertain and blocks another dispatch until
 * app restart. Returned/dismissed are OS API results, never delivery receipts. */
export function createEvidenceShareGate(boundary: EvidenceShareBoundary) {
 let pending=false,uncertain=false;
 return async (document: string, current: () => boolean): Promise<EvidenceShareOutcome | null> => {
  if(!current())return null;
  if(uncertain)throw new EvidenceShareUncertainError('Earlier share outcome is uncertain. Restart the app before another native share.');
  if(pending)throw new EvidenceShareBusyError('An earlier native share API request is still pending.');
  if(typeof document!=='string'||document.length===0||document.length>MAX_NATIVE_EVIDENCE_SHARE_BYTES||evidenceShareByteLength(document)>MAX_NATIVE_EVIDENCE_SHARE_BYTES)
   throw new EvidenceShareSizeError('Prepared text exceeds the native share limit. It was not truncated or sent.');
  if(!current())return null;
  pending=true;
  try {
   const result=await boundary(document);
   if(result!=='dismissed'&&result!=='returned')throw new Error('Unexpected native share result.');
   return result;
  } catch {
   uncertain=true;
   throw new EvidenceShareUncertainError('The share sheet failed or returned an unknown result. Delivery is unknown; restart the app before another native share.');
  } finally {pending=false;}
 };
}
