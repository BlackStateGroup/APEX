// Source-executed host-only navigation checks. No React/browser/device execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WebAxpApplication } from '../src/experimental/web-axp-application.ts';
import { WebAxpManager } from '../src/experimental/web-axp.ts';
const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
function harness(){
 const activeTab={current:'Devices'};const calls:string[]=[];
 const select=source.slice(source.indexOf('  function selectInspector('),source.indexOf('  const inspectorLabel')).replace('(next: AnalysisInspector)','(next)');
 const inspect=new Function('activeTab','setInspector','setChooserOpen','setTab','scroll',select+'return selectInspector')(activeTab,()=>calls.push('inspector'),()=>calls.push('chooser'),(tab:string)=>{assert.equal(activeTab.current,tab);calls.push('tab')},{current:{scrollTo:()=>calls.push('scroll')}});
 const gateStart=source.indexOf('  const browserGate =');const gateSource=source.slice(gateStart,source.indexOf('  const syncBrowserSession',gateStart));
 const values={attached:{current:true},activeTab,foreground:{current:true},AppState:{currentState:'active'},browserAxpForeground:()=>true,lock:{current:false},accessoryScanning:{current:false},observationBusy:{current:false},serviceDataBusy:{current:false},observationUncertain:{current:false},serviceDataUncertain:{current:false},captureBusy:{current:false},reader:{current:{state:'idle'}}};
 const gate=new Function(...Object.keys(values),gateSource+'return browserGate')(...Object.values(values));
 return {inspect,gate,activeTab,calls};
}
test('independent: actual Analysis navigation closes stale Devices acquisition before React state publication',()=>{
 const h=harness();let chooserCalls=0;const app=new WebAxpApplication(new WebAxpManager({secureContext:true,bluetooth:{requestDevice(){chooserCalls++;throw new Error('must not execute')}}}));
 assert.equal(h.gate().devicesTab,true);h.inspect('iq');assert.deepEqual(h.calls,['inspector','chooser','tab','scroll']);assert.equal(h.gate().devicesTab,false);
 assert.throws(()=>app.choose(h.gate()),/Devices tab/);assert.equal(chooserCalls,0);assert.equal(app.held,false);
});
test('independent: actual Analysis navigation preserves selected ownership but rejects stale Connect',async()=>{
 const h=harness();let chooserCalls=0;const app=new WebAxpApplication(new WebAxpManager({secureContext:true,bluetooth:{async requestDevice(){chooserCalls++;return {name:'synthetic inert selection',addEventListener(){},removeEventListener(){}}}}}));
 await app.choose(h.gate());h.inspect('iq');assert.equal(app.snapshot().manager.state,'selected');assert.ok(app.held);assert.throws(()=>app.connect(h.gate()),/Devices tab/);assert.equal(app.session.current,null);assert.equal(chooserCalls,1);await app.cancel();
});
