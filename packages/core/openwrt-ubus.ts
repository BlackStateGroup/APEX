import { parseBoundedJson } from './bounded-json.ts';
import { evaluateDeclaredReadScope, parseDevicePassport } from './device-intelligence.ts';
import type { DevicePassport, ScopeDeclaration } from './device-intelligence.ts';

export type UbusReadMethod = 'board' | 'info';
export interface UbusReadEnvelope {
  jsonrpc:'2.0';
  id:number;
  method:'call';
  params:readonly [string, 'system', UbusReadMethod, Readonly<Record<string,never>>];
}
export interface UbusReadProjection {
  method:UbusReadMethod;
  provenance:'unverified-ubus-response';
  rootAccess:'unknown';
  administrativeAccess:'unknown';
  fields:Readonly<Record<string,string|number>>;
}
const sessionPattern=/^[0-9a-f]{32}$/;
function err(reason:string):never { throw new Error('OpenWrt ubus read-only: '+reason); }
function obj(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(value)))err('malformed object');
  return value as Record<string,unknown>;
}
function clean(value:unknown,max=128):string {
  if(typeof value!=='string'||value.length<1||value.length>max||/[\x00-\x1f\x7f]/.test(value))err('invalid field');
  return value;
}

/**
 * A protocol CODEC only. It cannot create an HTTP session, authenticate a router,
 * perform a request, discover passwords or grant root. The caller must supply a
 * separately authenticated HTTPS transport and a confirmed target/owner scope.
 */
export function buildOpenWrtUbusRead(
  passport:DevicePassport, scope:ScopeDeclaration, sessionId:string,
  method:UbusReadMethod, requestId:number, nowMs:number,
):UbusReadEnvelope {
  const p=parseDevicePassport(JSON.stringify(passport));
  if(method!=='board'&&method!=='info')err('unrecognised or state-changing method');
  if(typeof sessionId!=='string'||!sessionPattern.test(sessionId)||/^0{32}$/.test(sessionId)) {
    err('operator session token missing or invalid');
  }
  if(!Number.isSafeInteger(requestId)||requestId<1||requestId>0x7fffffff)err('invalid request ID');
  const op=method==='board'?'system.version':'system.health';
  const decision=evaluateDeclaredReadScope(p,scope,op,nowMs);
  if(!decision.eligible)err('scope denied: '+decision.reason);
  // Even an eligible declared scope is NOT proof that the supplied token grants
  // anything on the real router. The ubus server enforces ACLs separately.
  return Object.freeze({
    jsonrpc:'2.0',id:requestId,method:'call',
    params:Object.freeze([sessionId,'system',method,Object.freeze({})]) as UbusReadEnvelope['params'],
  });
}

/** Whitelist only non-secret system metadata. Reject errors and never return arbitrary RPC objects. */
export function parseOpenWrtUbusReadReply(document:string,method:UbusReadMethod,requestId:number):UbusReadProjection {
  if(method!=='board'&&method!=='info')err('unknown method');
  if(typeof document!=='string'||document.length>8192)err('response size bound');
  if(!Number.isSafeInteger(requestId)||requestId<1||requestId>0x7fffffff)err('request ID');
  const root=obj(parseBoundedJson(document,8192,8));
  if(root.jsonrpc!=='2.0'||root.id!==requestId||Object.hasOwn(root,'error'))err('RPC envelope mismatch or error');
  if(!Array.isArray(root.result)||root.result.length!==2||root.result[0]!==0)err('ubus permission or status rejection');
  const payload=obj(root.result[1]);
  let fields:Record<string,string|number>;
  if(method==='board') {
    fields={};
    for(const key of ['model','board_name','kernel','system','hostname']) {
      if(payload[key]!==undefined)fields[key]=clean(payload[key]);
    }
    if(payload.release!==undefined) {
      const release=obj(payload.release);
      for(const key of ['distribution','version','revision','target']) {
        if(release[key]!==undefined)fields['release.'+key]=clean(release[key]);
      }
    }
  } else {
    fields={};
    if(payload.uptime!==undefined) {
      if(!Number.isSafeInteger(payload.uptime)||Number(payload.uptime)<0||
         Number(payload.uptime)>Number.MAX_SAFE_INTEGER)err('invalid uptime');
      fields.uptimeSeconds=Number(payload.uptime);
    }
    if(payload.localtime!==undefined) {
      if(!Number.isSafeInteger(payload.localtime)||Number(payload.localtime)<0)err('invalid localtime');
      fields.localtimeSeconds=Number(payload.localtime);
    }
  }
  if(Object.keys(fields).length<1)err('unsupported or empty system projection');
  return Object.freeze({
    method,provenance:'unverified-ubus-response',rootAccess:'unknown',administrativeAccess:'unknown',
    fields:Object.freeze(fields),
  });
}
