import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOfflinePassport } from '../packages/core/device-intelligence.ts';
import { readOwnedOpenWrtUbus } from '../tools/device-intelligence/openwrt-https.mjs';

const hash='c'.repeat(64), token='a'.repeat(32);
const passport=createOfflinePassport({name:'synthetic-lab.bin',sha256:hash,bytes:1000,format:'unknown'},
  {sshConfigurationMarker:false,credentialConfigurationMarker:false,webManagementMarker:false});
const scope={
  fixtureId:'owned-lab-router',sourceSha256:hash,authorisation:'owned-or-authorised-lab',
  approvedOperations:['system.version','system.health'],operatorConfirmed:true,expiresAtMs:10000,
};
async function loopback(handler,callback) {
  const dir=mkdtempSync(join(tmpdir(),'apex-ubus-https-'));
  let server;
  try {
    const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,
      '-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],
      {stdio:'ignore',timeout:10000});
    const caPem=readFileSync(cert,'utf8');
    server=https.createServer({key:readFileSync(key),cert:caPem},(req,res)=>{
      let body='',length=0;
      req.on('data',chunk=>{length+=chunk.length;if(length<2048)body+=chunk.toString('utf8');});
      req.on('end',()=>handler(req,body,res));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port;
    const config={endpoint:'https://127.0.0.1:'+port+'/ubus',expectedHost:'127.0.0.1',
      caPem,passport,scope,sessionId:token,method:'board',requestId:7,nowMs:100,timeoutMs:4000};
    await callback(config);
  } finally {
    if(server){
      server.closeAllConnections();
      await new Promise(resolve=>server.close(resolve));
    }
    rmSync(dir,{recursive:true,force:true});
  }
}
const good=()=>({jsonrpc:'2.0',id:7,result:[0,{model:'Owned synthetic lab',
  release:{distribution:'OpenWrt',version:'24.10-test'},password:'NEVER_RETURN_SECRET'}]});
const write=(res,status,obj)=>{
  res.statusCode=status;res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(obj));
};

test('real TLS loopback roundtrip performs only authenticated read-only ubus board, projects safe fields',async()=>{
  let observed=null;
  await loopback((req,body,res)=>{
    assert.equal(req.method,'POST');
    assert.equal(req.url,'/ubus');
    const request=JSON.parse(body);observed=request;
    assert.deepEqual(request.params,[token,'system','board',{}]);
    write(res,200,good());
  },async config=>{
    const result=await readOwnedOpenWrtUbus(config);
    assert.equal(result.fields.model,'Owned synthetic lab');
    assert.equal(result.fields['release.version'],'24.10-test');
    assert.equal(result.rootAccess,'unknown');
    assert.equal(JSON.stringify(result).includes('NEVER_RETURN_SECRET'),false);
  });
  assert.equal(observed.method,'call');
});
test('ubus server ACL denial never triggers fallback, retries or unauthorised methods',async()=>{
  let calls=0;
  await loopback((req,body,res)=>{calls++;write(res,200,{jsonrpc:'2.0',id:7,result:[6]});},async config=>{
    await assert.rejects(readOwnedOpenWrtUbus(config),/permission/);
    assert.equal(calls,1);
  });
});
test('redirect, excessive response bytes and non-JSON content are terminal errors',async()=>{
  for(const kind of ['redirect','long','html']){
    await loopback((_req,_body,res)=>{
      if(kind==='redirect'){res.statusCode=302;res.setHeader('Location','https://example.com/');res.end();return;}
      if(kind==='long'){res.setHeader('Content-Type','application/json');res.end('X'.repeat(9000));return;}
      res.statusCode=200;res.setHeader('Content-Type','text/html');res.end('<html>not JSON</html>');
    },async config=>{
      await assert.rejects(readOwnedOpenWrtUbus(config));
    });
  }
});
test('expired authority, private-host mismatch, HTTP downgrade and URL credentials fail before network dispatch',async()=>{
  let calls=0;
  await loopback((_req,_body,res)=>{calls++;write(res,200,good());},async config=>{
    for(const mutation of [
      {nowMs:10000},{endpoint:config.endpoint.replace('https:','http:')},
      {expectedHost:'example.com'},{endpoint:'https://test.lan/ubus',expectedHost:'test.lan'},
      {endpoint:'https://localhost/ubus',expectedHost:'localhost'},
      {endpoint:config.endpoint.replace('/ubus','/admin')},
      {endpoint:config.endpoint.replace('https://','https://user:pass@')},
      {method:'reboot'},
    ])await assert.rejects(readOwnedOpenWrtUbus({...config,...mutation}));
    assert.equal(calls,0);
    const badCA='-----BEGIN CERTIFICATE-----\n'+('A'.repeat(300))+'\n-----END CERTIFICATE-----';
    await assert.rejects(readOwnedOpenWrtUbus({...config,caPem:badCA}));
    assert.equal(calls,0);
  });
});
test('error text never exposes session tokens or authenticated response data',async()=>{
  await loopback((_req,_body,res)=>{write(res,403,{error:'secret-should-never-echo'});},async config=>{
    try{await readOwnedOpenWrtUbus(config);assert.fail('expected refusal');}
    catch(error){
      assert.equal(String(error).includes(token),false);
      assert.equal(String(error).includes('secret-should-never-echo'),false);
    }
  });
});
