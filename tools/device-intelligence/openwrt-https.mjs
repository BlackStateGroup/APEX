import https from 'node:https';
import { isIP } from 'node:net';
import { buildOpenWrtUbusRead, parseOpenWrtUbusReadReply } from '../../packages/core/openwrt-ubus.ts';

/**
 * Node-only authenticated HTTPS lab transport for exact OpenWrt /ubus reads.
 * NEVER logs/retries requests, disables TLS verification, follows redirects,
 * auto-authenticates, scans an address range or forwards arbitrary methods.
 * Requires a pre-existing operator-authorised ubus session and an explicit CA.
 */
export async function readOwnedOpenWrtUbus({
  endpoint, expectedHost, caPem, passport, scope, sessionId,
  method, requestId, nowMs, timeoutMs=5000,
}) {
  const rpc=buildOpenWrtUbusRead(passport,scope,sessionId,method,requestId,nowMs);
  let url;
  try { url=new URL(endpoint); } catch { throw new Error('OpenWrt HTTPS: invalid endpoint'); }
  if(url.protocol!=='https:' || url.pathname!=='/ubus' || url.search || url.hash ||
     url.username || url.password || url.hostname!==expectedHost || !url.port && url.port!=='') {
    throw new Error('OpenWrt HTTPS: HTTPS /ubus endpoint and exact host match required');
  }
  if(typeof expectedHost!=='string' || !isApprovedLabHost(expectedHost)) {
    throw new Error('OpenWrt HTTPS: only explicitly selected local/private lab hosts supported');
  }
  if(typeof caPem!=='string'||caPem.length<50||caPem.length>16384||
     !caPem.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('OpenWrt HTTPS: explicit trusted CA certificate required');
  }
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000) {
    throw new Error('OpenWrt HTTPS: invalid timeout');
  }
  const body=JSON.stringify(rpc);
  if(body.length>1024)throw new Error('OpenWrt HTTPS: request bound');
  const content=await new Promise((resolve,reject)=>{
    let settled=false,timer;
    let request;
    const fail=(reason)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      request?.destroy();
      reject(reason instanceof Error?reason:new Error('OpenWrt HTTPS: request failed'));
    };
    const success=(response)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);resolve(response);
    };
    request=https.request({
      protocol:'https:',hostname:url.hostname,port:url.port||443,
      path:'/ubus',method:'POST',agent:false,ca:caPem,rejectUnauthorized:true,
      headers:{'content-type':'application/json','accept':'application/json',
        'content-length':Buffer.byteLength(body),'cache-control':'no-store'},
    },response=>{
      if(response.statusCode!==200 || !String(response.headers['content-type']??'').toLowerCase().startsWith('application/json')) {
        response.resume();fail(new Error('OpenWrt HTTPS: non-JSON or non-200 response'));return;
      }
      const headerLength=Number(response.headers['content-length']??'0');
      if(headerLength>8192 || headerLength<0 || !Number.isFinite(headerLength)) {
        response.resume();fail(new Error('OpenWrt HTTPS: response exceeds byte bound'));return;
      }
      let total=0;const chunks=[];
      response.on('data',chunk=>{
        total+=chunk.length;
        if(total>8192){fail(new Error('OpenWrt HTTPS: response exceeds byte bound'));return;}
        chunks.push(Buffer.from(chunk));
      });
      response.on('end',()=>success(Buffer.concat(chunks).toString('utf8')));
      response.on('aborted',()=>fail(new Error('OpenWrt HTTPS: response aborted')));
      response.on('error',fail);
    });
    request.on('error',fail);
    request.on('socket',socket=>{
      socket.once('secureConnect',()=>{
        if(!socket.authorized || !isApprovedPrivateAddress(socket.remoteAddress)) {
          fail(new Error('OpenWrt HTTPS: TLS identity or private-network scope failed'));return;
        }
        // Token-bearing request bytes are only written *after* TLS and
        // private-network peer checks. Headers carry no session token.
        request.end(body);
      });
    });
    timer=setTimeout(()=>fail(new Error('OpenWrt HTTPS: deadline exceeded')),timeoutMs);
    request.flushHeaders();
  });
  return parseOpenWrtUbusReadReply(content,method,requestId);
}

function isApprovedLabHost(host) {
  if(host==='localhost' || host.endsWith('.lan') || host.endsWith('.local'))return true;
  return isApprovedPrivateAddress(host);
}
function isApprovedPrivateAddress(address) {
  if(typeof address!=='string')return false;
  const normalized=address.startsWith('::ffff:')?address.slice(7):address;
  if(normalized==='::1')return true;
  if(isIP(normalized)!==4)return false;
  const parts=normalized.split('.').map(Number);
  return parts[0]===10 || parts[0]===127 ||
    (parts[0]===172 && parts[1]>=16 && parts[1]<=31) ||
    (parts[0]===192 && parts[1]===168);
}
