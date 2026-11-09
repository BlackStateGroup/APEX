/** Actual installed Metro resolver and repository sourceExts, not a hand-written selector. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { statSync, realpathSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const require=createRequire(import.meta.url);
const {resolve:metroResolve}=require('metro-resolver');
const root=fileURLToPath(new URL('../',import.meta.url));
const config=require('../metro.config.cjs');
function context(base:string,platform:string) {
 return {originModulePath:resolve(base,'src/EvidenceScreen.tsx'),sourceExts:config.resolver.sourceExts,
  assetExts:new Set(config.resolver.assetExts),preferNativePlatform:platform!=='web',
  mainFields:config.resolver.resolverMainFields,getPackageForModule:()=>null,
  fileSystemLookup:(path:string)=>{try{const stat=statSync(path);return{exists:true,type:stat.isDirectory()?'d':'f',realPath:realpathSync(path)};}catch{return{exists:false};}},
 };
}
for(const platform of ['ios','android','web'])test(`${platform}: Metro resolves the intended evidence share controls`,()=>{
 const result=metroResolve(context(root,platform),'./platform/evidence-share',platform);
 assert.deepEqual(result,{type:'sourceFile',filePath:resolve(root,`src/platform/evidence-share${platform==='web'?'':'.native'}.tsx`)});
});
test('negative control: mixed default .ts and native .tsx reproduces the silent native-control omission',()=>{
 const dir=mkdtempSync(join(tmpdir(),'apex-evidence-resolution-'));
 try{
  mkdirSync(join(dir,'src/platform'),{recursive:true});
  writeFileSync(join(dir,'src/platform/evidence-share.ts'),'export function EvidenceShare(){return null;}');
  writeFileSync(join(dir,'src/platform/evidence-share.native.tsx'),'export function EvidenceShare(){return "native";}');
  for(const platform of ['ios','android'])assert.equal(metroResolve(context(dir,platform),'./platform/evidence-share',platform).filePath,join(dir,'src/platform/evidence-share.ts'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
