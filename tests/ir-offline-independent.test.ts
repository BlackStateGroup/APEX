/** Independent review oracles, synthetic only. No imported upstream fixture/code. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectIrFile, type IrContext } from '../packages/core/ir-offline.ts';
const context: IrContext = { provenance: 'synthetic-fixture', sourceLabel: 'independent.ir' };
const header = 'Filetype: IR signals file\nVersion: 1\n';
const parsed = 'name: x\ntype: parsed\nprotocol: NEC\naddress: 00 00 00 00\ncommand: ff 00 00 00\n';
const raw = (data: number[] | string, duty = '.5', frequency = '38000') => `name: x\ntype: raw\nfrequency: ${frequency}\nduty_cycle: ${duty}\ndata: ${Array.isArray(data) ? data.join(' ') : data}\n`;
const inspect = (text: string) => inspectIrFile(Buffer.from(text), context);
// Construct LSB-first bit strings independently from decoder's bitwise traversal.
function frame(address: number, command: number): number[] {
  const bits = [address, 255-address, command, 255-command].map(n => n.toString(2).padStart(8,'0').split('').reverse().join('')).join('');
  return [9000,4500,...Array.from(bits).flatMap(bit => [563,bit === '1' ? 1688 : 563]),563];
}
test('independent decimal oracle rejects exact values above one despite Number rounding', async () => {
  for (const duty of ['1.00000000000000001', '1.0000000000000001', '0001.'+'0'.repeat(100)+'1']) {
    await assert.rejects(inspect(header + raw('1', duty)), /invalid-duty-cycle/, `exact decimal ${duty} exceeds 1`);
  }
});
test('all 256 parsed byte values preserve independent integer identity', async () => {
  for (let n=0;n<256;n++) {
    const r = (await inspect(header + parsed.replace('00 00 00 00',n.toString(16).padStart(2,'0')+' 00 00 00'))).records[0]!;
    assert(r.type==='parsed'); assert.equal(r.address,n); assert.equal(r.command,255);
  }
});
test('independent raw oracle covers all byte values, and individual waveform corruption', async () => {
  for(let n=0;n<256;n++) {
    const r=(await inspect(header+raw(frame(n,255-n)))).records[0]!;
    assert(r.type==='raw' && r.recognition.status==='recognized');
    assert.deepEqual(r.recognition.decoded,{protocol:'NEC',address:n,command:255-n,evidence:'offline'});
  }
  const original=frame(0x81,0x42);
  for(let i=0;i<original.length;i++) {
    const altered=original.slice(); altered[i]=20001;
    const r=(await inspect(header+raw(altered))).records[0]!;
    assert(r.type==='raw'); assert.equal(r.recognition.status,'not-recognized'); assert.deepEqual(r.durationsUs,altered);
  }
  for(const durations of [[...original,40000,9000,2250,563],[...original,40000,...original],[9000,2250,563],original.slice(1),[50000,...original]]) {
    const r=(await inspect(header+raw(durations))).records[0]!;
    assert(r.type==='raw'); assert.equal(r.recognition.status,'not-recognized'); assert.deepEqual(r.durationsUs,durations);
  }
});
test('independent integer tolerance boundaries and metadata separation', async () => {
  for(const [position,lower,upper] of [[0,6750,11250],[1,3375,5625],[2,422,703],[3,422,703],[66,422,703]]) {
    for(const [value,expected] of [[lower!,'recognized'],[upper!,'recognized'],[lower!-1,'not-recognized'],[upper!+1,'not-recognized']] as const) {
      const durations=frame(0,0); durations[position!]=value;
      const r=(await inspect(header+raw(durations,'1','10000'))).records[0]!;
      assert(r.type==='raw'); assert.equal(r.recognition.status,expected,`${position}: ${value}`);
    }
  }
});
test('physical line oracle, exact source digest and duplicate inert identities', async () => {
  const lines=['# preamble','Filetype: IR signals file','','Version: 1','# before','name: __proto__','', '# inside','type: parsed','protocol: NEC','address: AA 00 00 00','command: 01 00 00 00','# after','name: __proto__','type: raw','frequency: 38000','duty_cycle: .5','# internal','data: 4294967295','# after last'];
  const text=lines.map((l,i)=>l+(i%2?'\r\n':'\n')).join('');
  const r=await inspect(text);
  assert.equal(r.originalSource,text); assert.equal(r.sha256,createHash('sha256').update(text,'ascii').digest('hex'));
  assert.deepEqual(r.records.map(x=>[x.ordinal,x.name,x.startLine,x.endLine]),[[1,'__proto__',6,12],[2,'__proto__',14,19]]);
  assert(Object.isFrozen(r)); assert(Object.isFrozen(r.context)); assert(Object.isFrozen(r.verification));
  for(const rec of r.records) assert(Object.isFrozen(rec));
});
test('source view uses exact slots and context cannot mutate previously captured bytes', async () => {
  const source=header+parsed, backing=Buffer.from('junk'+source+'tail');
  const view=backing.subarray(4,4+source.length);
  for(const key of ['buffer','byteOffset','length','byteLength']) Object.defineProperty(view,key,{get(){throw Error('spoof accessed');}});
  Object.defineProperty(view,'slice',{value(){throw Error('slice accessed');}});
  const proxy=new Proxy({...context},{getOwnPropertyDescriptor(target,key){backing.fill(0);return Object.getOwnPropertyDescriptor(target,key);}});
  const r=await inspectIrFile(view,proxy); assert.equal(r.originalSource,source);
  const badContexts=[Object.create(context),Object.assign({...context},{extra:1}),{...context,[Symbol()]:1},{...context,sourceLabel:'x\n'},null];
  for(const c of badContexts) await assert.rejects(inspectIrFile(Buffer.from(source),c as IrContext));
});
test('ASCII grammar rejects every forbidden byte, extra whitespace, protocol aliases and key confusion', async () => {
  for(let n=0;n<256;n++) if(n!==10 && n!==13 && (n<32||n>126)) await assert.rejects(inspectIrFile(Buffer.concat([Buffer.from(header+parsed+'#'),Buffer.from([n])]),context));
  for(const fragment of [' ','\t','#x\r',' name: x','name:x','name: x\ntype: parsed\nprotocol: nec','name: x\ntype: parsed\nprotocol: NEC42']) await assert.rejects(inspect(header+fragment));
  for(const data of ['4294967296','00000000001','0','-0','1e1','1\t2','1  2',' 1','1 ']) await assert.rejects(inspect(header+raw(data)));
  for(const data of ['4294967295','0000000001']) await inspect(header+raw(data));
});
test('actual CLI bounded output and atomic failures with writes denied', async () => {
  const dir=await mkdtemp(join(tmpdir(),'ir-independent-'));
  try {
    const path=join(dir,'source.ir');
    const run=(args:string[])=>spawnSync(process.execPath,['--permission',`--allow-fs-read=${resolve('.')}`,`--allow-fs-read=${dir}`,'tools/inspect-ir-offline.ts',...args],{encoding:'utf8',maxBuffer:1048576+4096});
    const flags=['--provenance','synthetic-fixture'];
    await writeFile(path,header+parsed);
    const good=run([path,...flags]); assert.equal(good.status,0,good.stderr); assert.equal(JSON.parse(good.stdout).originalSource,header+parsed); assert(Buffer.byteLength(good.stdout)<=1048576);
    for(const args of [[path],[path,...flags,'extra'],[path,'--provenance','unknown'],['https://example.invalid/x',...flags],['--help',...flags]]) {const r=run(args);assert.equal(r.status,1);assert.equal(r.stdout,'');}
    for(const text of [header+parsed+raw('0'),header+parsed.repeat(129),'x'.repeat(262145)]) {await writeFile(path,text);const r=run([path,...flags]);assert.equal(r.status,1);assert.equal(r.stdout,'');}
    // Writes actually fail in the same child permission configuration.
    const denied=spawnSync(process.execPath,['--permission',`--allow-fs-read=${resolve('.')}`,'--input-type=module','-e',`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(dir,'forbidden'))},'x')`],{encoding:'utf8'});
    assert.notEqual(denied.status,0); assert.match(denied.stderr,/ERR_ACCESS_DENIED/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
