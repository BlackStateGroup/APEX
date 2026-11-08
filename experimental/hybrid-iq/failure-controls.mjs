// Negative controls for the numerical and pinned-reference gates. Never alters
// repository inputs; the deliberate source drift is applied to a temporary copy.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, mkdirSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeRequest, projectResponse } from './contract.mjs';
import { fixtures } from '../cpp-iq/proof-codec.mjs';
import { prepareReference, runReference } from './reference.mjs';
const cwd=fileURLToPath(new URL('.',import.meta.url));
const f=fixtures().find(f=>f.name==='quarter-1-256');
const {input,context}=encodeRequest(f);
const run=b=>{const r=spawnSync(join(cwd,'.build/host-verify'),[],{input:b,timeout:10000,maxBuffer:2**20});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;};
const expected=runReference(await prepareReference(f),f).frames;
assert.deepEqual(projectResponse(run(input),context).frames,expected);
const reversed=Buffer.from(input);
const sineAt=32+f.data.length+(2*f.fftSize-1)*8;
for(let i=0;i<f.fftSize-1;i++)reversed.writeDoubleLE(-reversed.readDoubleLE(sineAt+i*8),sineAt+i*8);
assert.throws(()=>assert.deepEqual(projectResponse(run(reversed),context).frames,expected));
const response=run(input),changed=Buffer.from(response);
// A single finite transform-value perturbation must not hide under tolerance.
changed.writeDoubleLE(changed.readDoubleLE(24)+Number.EPSILON,24);
assert.throws(()=>assert.deepEqual(projectResponse(changed,context).frames,expected));
const temp=mkdtempSync(join(tmpdir(),'apex-hybrid-gate-'));
try{
  mkdirSync(join(temp,'experimental'),{recursive:true});
  cpSync(cwd,join(temp,'experimental/hybrid-iq'),{recursive:true,filter:p=>!p.includes('/.build')&&!p.includes('/proof-results')&&!p.includes('/review')});
  cpSync(join(cwd,'../cpp-iq'),join(temp,'experimental/cpp-iq'),{recursive:true,filter:p=>!p.includes('/proof-results')&&!p.includes('/proof-host')});
  cpSync(join(cwd,'../../packages'),join(temp,'packages'),{recursive:true});
  appendFileSync(join(temp,'packages/core/iq-analysis.ts'),'\n// deliberate negative-control reference drift\n');
  const r=spawnSync(process.execPath,[join(temp,'experimental/hybrid-iq/proof.mjs'),'verify'],{timeout:10000,maxBuffer:2**20});
  assert.equal(r.status,1,r.stderr?.toString());
  const report=JSON.parse(readFileSync(join(temp,'experimental/hybrid-iq/proof-results/verify.json'),'utf8'));
  assert.equal(report.status,'FAIL');assert.match(report.error,/Pinned reference drift/);
}finally{rmSync(temp,{recursive:true,force:true});}
console.log('PASS: reversed FFT sign, finite output perturbation, and reference-source drift are detected; original source untouched.');
