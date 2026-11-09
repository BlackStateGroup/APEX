/** Real installed Expo transforms for opt-in receive negotiation and coordinator. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { transformFromAstSync } = require('@babel/core');
// Execute real Expo Metro Babel output, not Node's native private slots.
// Relative application dependencies use the same transform and module cache.
function loader(platform: string, dev: boolean, baseline = false) {
  // Expo caches config discovery once per worker. Give each matrix loader its
  // own discovery state so the baseline cannot mask configured output.
  const transformer = require.resolve('@expo/metro-config/babel-transformer');
  delete require.cache[resolve(dirname(transformer), 'loadBabelConfig.js')];
  delete require.cache[transformer];
  const { transform } = require(transformer);
  const cache = new Map<string, { exports: any }>();
  return function load(filename: string): any {
    filename = resolve(root, filename);
    if (cache.has(filename)) return cache.get(filename)!.exports;
    const src = readFileSync(filename, 'utf8');
    const result = transform({ filename, src, plugins: [], options: {
      projectRoot: root, platform, dev, hot: false,
      enableBabelRCLookup: !baseline,
      customTransformOptions: platform === 'web' ? {} : { engine: 'hermes' },
    } });
    const { code } = transformFromAstSync(result.ast, src, { babelrc: false, configFile: false });
    const module = { exports: {} };
    cache.set(filename, module);
    const localRequire = createRequire(filename);
    const dependency = (name: string) => name.startsWith('.') && name.endsWith('.ts')
      ? load(resolve(dirname(filename), name)) : localRequire(name);
    runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(dependency, module, module.exports);
    return module.exports;
  };
}



for (const platform of ['web', 'android', 'ios']) for (const dev of [false, true]) {
 test(`${platform} ${dev?'development':'production'}: explicit receive negotiation, private capability receipt and one queued stop`,async()=>{
  const load=loader(platform,dev);
  const {DeviceSession}=load('packages/core/session.ts');
  const {createRadioReceiveClient}=load('packages/core/radio-receive-client.ts');
  const {FrameDecoder,encode,utf8}=load('packages/protocol/index.ts');
  const calls:number[]=[],listeners=new Set<(bytes:Uint8Array)=>void>();
  const declared=['system.info','system.capabilities','system.ping','radio.rx.start','radio.rx.poll','radio.rx.stop'];
  let release!:(bytes:Uint8Array)=>void;
  const status=(state:number)=>{const b=new Uint8Array(24);b.set([1,state,1,0,1]);b[18]=150;return b;};
  const decoder=new FrameDecoder((frame:any)=>{
   calls.push(frame.opcode);
   const reply=(payload:Uint8Array)=>{for(const listener of listeners)listener(encode({...frame,kind:2,payload}));};
   if(frame.opcode===1)reply(utf8(JSON.stringify({id:'fixture',board:'synthetic',firmware:'1',protocol:1,source:'host'})));
   else if(frame.opcode===2)reply(utf8(JSON.stringify({operations:declared})));
   else if(frame.opcode===0x60)release=reply;
   else if(frame.opcode===0x62)reply(status(2));
   else assert.fail('Unexpected operation');
  });
  const transport={source:'host',async connect(){},async disconnect(){},async write(bytes:Uint8Array){decoder.push(bytes);},onData(fn:(bytes:Uint8Array)=>void){listeners.add(fn);return()=>listeners.delete(fn);},onDisconnect(){return()=>{};}};
  const session=new DeviceSession(transport,{allowRadioReceive:true});
  try{
   await session.open();assert.deepEqual(calls,[1,2]);const client=createRadioReceiveClient(session);assert.equal(createRadioReceiveClient(session),client);
   assert.ok(Object.isFrozen(client));assert.ok(Object.isFrozen(client.state));const start=client.start(1000,4);
   for(let n=0;n<32&&!release;n++)await Promise.resolve();assert.equal(typeof release,'function');
   const stop=client.stop();assert.equal(client.stop(),stop);release(status(1));await start;await stop;
   assert.deepEqual(calls,[1,2,0x60,0x62]);assert.equal(client.state.status.state,2);assert.equal(client.state.uncertain,false);
  }finally{await session.close();}
  // A base-only peer may not acquire the new capability via a public array edit.
  declared.splice(3);calls.length=0;
  const base=new DeviceSession(transport,{allowRadioReceive:true});
  try{await base.open();base.capabilities.push('radio.rx.start');await assert.rejects(base.request('radio.rx.start',new Uint8Array(6)));assert.deepEqual(calls,[1,2]);}
  finally{await base.close();}
 });
}
