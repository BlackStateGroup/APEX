import type { DeviceSession } from './session.ts';
import { RADIO_RECEIVE_OPERATIONS, encodeRadioReceiveStart, encodeRadioReceiveCaptureId, parseRadioReceiveStatus } from './radio-receive-protocol.ts';
import type { RadioReceivePacket, RadioReceiveStatus } from './radio-receive-protocol.ts';

export type RadioReceiveSession = Pick<DeviceSession, 'state' | 'capabilities' | 'request'>;
type ReceiveOperation = keyof typeof RADIO_RECEIVE_OPERATIONS;
export interface RadioReceiveSnapshot {
 readonly pending: 'start' | 'poll' | 'stop' | null;
 readonly stopQueued: boolean;
 readonly uncertain: boolean;
 readonly clockMonotonic: boolean;
 readonly durationMs: number | null;
 readonly eventLimit: number | null;
 readonly status: RadioReceiveStatus | null;
 readonly packets: readonly RadioReceivePacket[];
 /** Accepted, non-queue-dropped packets absent from this client's returned list. */
 readonly unreturnedAccepted: number;
 readonly message: string;
}
export interface RadioReceiveClient {
 readonly state: RadioReceiveSnapshot;
 start(durationMs: number, eventLimit: number): Promise<RadioReceiveStatus>;
 poll(): Promise<RadioReceiveStatus>;
 /** Queue one stop behind outstanding work. Does not close the caller's session. */
 stop(): Promise<RadioReceiveStatus | null>;
}
export class RadioReceiveBusyError extends Error {}
export class RadioReceiveCancelledError extends Error {}
export class RadioReceiveOperationError extends Error {}
const clients = new WeakMap<RadioReceiveSession, RadioReceiveClient>();

/** One retained coordinator per exact session. No auto-start, polling, timeout
 * retry, reconnect, modem setting or transmit path. Reports remain peer claims. */
export function createRadioReceiveClient(session: RadioReceiveSession): RadioReceiveClient {
 const existing=clients.get(session);if(existing)return existing;
 if(session.state!=='open'||!Object.keys(RADIO_RECEIVE_OPERATIONS).every(op=>session.capabilities.includes(op as ReceiveOperation)))
  throw new Error('An explicitly opted-in open receive-capable session is required.');
 const request=session.request.bind(session);
 let state:RadioReceiveSnapshot=Object.freeze({pending:null,stopQueued:false,uncertain:false,clockMonotonic:true,
  durationMs:null,eventLimit:null,status:null,packets:Object.freeze([]),unreturnedAccepted:0,
  message:'Ready for an explicit bounded receive request. Peer identity and RF reception are unverified.'});
 let work:Promise<RadioReceiveStatus>|null=null,stopping:Promise<RadioReceiveStatus|null>|null=null;
 let captureId=0,highestCaptureId=0;
 const publish=(changes:Partial<RadioReceiveSnapshot>)=>{state=Object.freeze({...state,...changes});};
 const open=()=>{if(session.state!=='open')throw new Error('Receive session is not open.');};
 const idle=()=>{if(work||stopping||state.stopQueued)throw new RadioReceiveBusyError('A receive request or queued stop is still pending.');};
 function accept(operation:ReceiveOperation,next:RadioReceiveStatus) {
  const previous=state.status,duration=state.durationMs!,limit=state.eventLimit!;
  if(operation==='radio.rx.start') {
   if(next.captureId<=highestCaptureId||![1,3,5].includes(next.state)||next.observed!==0||next.queued!==0||next.packet)
    throw new Error('Contradictory start status');
  } else {
   if(next.captureId!==captureId||next.state===0||operation==='radio.rx.stop'&&(next.packet!==null||next.state===1))
    throw new Error('Contradictory capture status');
   if(previous&&(next.observed<previous.observed||next.accepted<previous.accepted||next.dropped<previous.dropped||next.rejected<previous.rejected||
      previous.state!==1&&next.state!==previous.state&&next.state!==5||next.state!==5&&next.elapsedMs<previous.elapsedMs))
    throw new Error('Regressing capture status');
   // Terminal firmware does not tick, acquire packets or advance its saved clock.
   // A reply cannot invent queued data. Out-of-band drains can leave a gap,
   // retained separately as unreturnedAccepted rather than declared RF loss.
   if(previous&&previous.state!==1&&(next.observed!==previous.observed||next.accepted!==previous.accepted||
      next.dropped!==previous.dropped||next.rejected!==previous.rejected||next.elapsedMs!==previous.elapsedMs||
      next.queued+Number(next.packet!==null)>previous.queued))throw new Error('Terminal capture status changed');
  }
  if(next.observed>limit||next.state===4&&next.observed!==limit||next.state===3&&next.elapsedMs<duration||next.state===1&&(next.observed>=limit||next.elapsedMs>=duration)||
     next.packet&&(next.packet.elapsedMs>=duration||next.state!==5&&next.packet.elapsedMs>next.elapsedMs))
   throw new Error('Capture status exceeds the requested bounds');
  if(next.packet&&state.packets.length&&next.packet.elapsedMs<state.packets[state.packets.length-1]!.elapsedMs)
   throw new Error('Returned packet timestamps are not FIFO ordered');
  const packets=next.packet?[...state.packets,next.packet]:state.packets;
  const unreturnedAccepted=next.accepted-next.dropped-next.queued-packets.length;
  if(packets.length>limit||unreturnedAccepted<0)throw new Error('Contradictory returned packet accounting');
  if(operation==='radio.rx.start'){captureId=next.captureId;highestCaptureId=next.captureId;}
  publish({status:next,packets:Object.freeze(packets),unreturnedAccepted,
   clockMonotonic:state.clockMonotonic&&(!previous||next.elapsedMs>=previous.elapsedMs),
   message:next.state===5?'Peer reports a receiver fault. Physical stop is unverified; no new capture is allowed.':
    next.state===1?'Peer reports an active bounded receive lease. Poll explicitly; no physical reception is proven.':
    'Peer reports the capture is no longer running. Queued packets require explicit Poll; physical stop is unverified.'});
  return next;
 }
 function perform(operation:ReceiveOperation,payload:Uint8Array):Promise<RadioReceiveStatus> {
  const pending=operation==='radio.rx.start'?'start':operation==='radio.rx.poll'?'poll':'stop';
  publish({pending});
  let dispatched=false;
  const task=Promise.resolve().then(async()=>{
   if(operation==='radio.rx.start'&&state.stopQueued)throw new RadioReceiveCancelledError('Receive start cancelled before dispatch.');
   open();dispatched=true;
   const response=await request(operation,payload);
   return accept(operation,parseRadioReceiveStatus(response));
  }).catch(error=>{
   if(dispatched)publish({uncertain:true,message:'Receive request failed or its response was inconsistent. Further starts and polls are blocked. A known capture ID may still be explicitly stopped; physical state is unknown.'});
   else publish({message:error instanceof RadioReceiveCancelledError?'Receive start cancelled before dispatch. No start request was issued.':'Receive request not issued because the session is closed.'});
   if(error instanceof RadioReceiveCancelledError)throw error;
   throw new RadioReceiveOperationError('Receive request did not yield a trusted status.',{cause:error});
  }).finally(()=>{if(work===task){work=null;publish({pending:null});}});
  work=task;return task;
 }
 const client:RadioReceiveClient=Object.freeze({
  get state(){return state;},
  start(durationMs:number,eventLimit:number){
   try {
    const payload=encodeRadioReceiveStart(durationMs,eventLimit);idle();open();
    if(state.uncertain||state.status?.state===5)throw new Error('Receive state is uncertain or faulted; a new capture is not permitted.');
    if(highestCaptureId===0xffffffff)throw new Error('Receiver capture ID space is exhausted; no new capture is permitted.');
    if(state.status&&(state.status.state===1||state.status.queued!==0))throw new RadioReceiveBusyError('Stop the current capture and drain its queue before starting again.');
    captureId=0;
    publish({durationMs,eventLimit,status:null,packets:Object.freeze([]),unreturnedAccepted:0,clockMonotonic:true,message:'Requesting one bounded receive lease. Start has not been confirmed.'});
    return perform('radio.rx.start',payload);
   } catch(error){return Promise.reject(error);}
  },
  poll(){
   try {
    idle();open();
    if(state.uncertain)throw new Error('Receive state is uncertain; polling is blocked.');
    if(!captureId||!state.status||state.status.state!==1&&state.status.queued===0)throw new Error('No running or queued capture is available to poll.');
    return perform('radio.rx.poll',encodeRadioReceiveCaptureId(captureId));
   } catch(error){return Promise.reject(error);}
  },
  stop(){
   if(stopping)return stopping;
   publish({stopQueued:true});
   const pending=work;
   const task=Promise.resolve(pending).catch(()=>undefined).then(()=>{
    if(!captureId)return null;
    return perform('radio.rx.stop',encodeRadioReceiveCaptureId(captureId));
   }).finally(()=>{if(stopping===task){stopping=null;publish({stopQueued:false});}});
   stopping=task;return task;
  },
 });
 clients.set(session,client);return client;
}
