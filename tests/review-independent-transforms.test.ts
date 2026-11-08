import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { transformFromAstSync } = require('@babel/core');
const controllers = [
  ['evidence-bundle-workbench', 'EvidenceBundleWorkbench'],
  ['hci-comparison-workbench', 'HciComparisonController'],
  ['hci-document-workbench', 'HciDocumentController'],
  ['hci-evidence-reopen', 'HciEvidenceReopenController'],
  ['hci-workbench', 'HciWorkbenchController'],
  ['iq-workbench', 'IqController'],
  ['ir-workbench', 'IrWorkbenchController'],
  ['nfc-static-workbench', 'NfcStaticWorkbenchController'],
] as const;
const hash = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

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


for (const platform of ['web','android','ios']) for (const dev of [false,true]) {
 const load=loader(platform,dev);
 for(const [file,name] of controllers) test(`independent ${platform}/${dev}: ${name} brand and peer isolation`,()=>{
  const C=load(`src/${file}.ts`)[name];
  const a=name==='HciEvidenceReopenController'?new C({},hash):new C(false,hash);
  const b=name==='HciEvidenceReopenController'?new C({},hash):new C(false,hash);
  const bState=b.state, bLease=b.lease;
  a.deactivate();a.activate();
  assert.equal(b.state,bState);assert.equal(b.lease,bLease);
  for(const fake of [{},Object.create(C.prototype),Object.assign({},a),new Proxy(a,{})]) {
   assert.throws(()=>C.prototype.activate.call(fake),TypeError);
   assert.throws(()=>Object.getOwnPropertyDescriptor(C.prototype,'state')!.get!.call(fake),TypeError);
  }
  assert.throws(()=>Object.defineProperty(a,'state',{value:bState}),TypeError);
  assert.throws(()=>Object.setPrototypeOf(a,{}),TypeError);
 });
 test(`independent ${platform}/${dev}: bundle async error and immutable provenance`,async()=>{
  const {EvidenceBundleWorkbench:C}=load('src/evidence-bundle-workbench.ts');
  const {bundleFixture,sha256}=load('tests/bundle-preview-fixture.ts');
  const {bundle,documents}=await bundleFixture(1);
  const c=new C();c.edit(bundle);await c.inspect(sha256);
  assert.deepEqual(c.state.report.recordDocuments,documents);
  const verified=c.state;
  assert.throws(()=>{c.state.report.records[0].source='native-ios';},TypeError);
  for(const transition of ['edit','clear','deactivate','new-inspect']) {
   c.activate();c.edit(bundle);
   let reject:any;const old=c.inspect(()=>new Promise((_,r)=>{reject=r;}));
   assert.equal(c.state.pending,true);
   if(transition==='edit')c.edit('{}');
   if(transition==='clear')c.clear();
   if(transition==='deactivate'){c.deactivate();c.activate();}
   if(transition==='new-inspect')await c.inspect(sha256);
   const expected=c.state;reject(new Error('independent stale failure'));await old;
   assert.equal(c.state,expected);
   assert.doesNotMatch(c.state.message,/independent stale failure/);
  }
  assert.equal(verified.document,bundle);assert.deepEqual(verified.report.recordDocuments,documents);
 });
}
