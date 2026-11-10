import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync,truncateSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inspectOwnedFirmwareStructureFile } from '../tools/device-intelligence/inspect-structure.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

test('additive structure CLI validates a real U-Boot-like binary fixture and preserves exact input',()=>{
  const folder=mkdtempSync(join(tmpdir(),'apex-structure-cli-'));
  try{
    const binary=Buffer.alloc(128);
    binary.writeUInt32BE(0x27051956,0);
    binary.writeUInt32BE(64,12);
    binary[28]=5;binary[29]=2;binary[30]=2;binary[31]=0;
    const input=join(folder,'owned-image.uimg'),output=join(folder,'structure.json');
    writeFileSync(input,binary);
    const result=inspectOwnedFirmwareStructureFile(input);
    assert.equal(result.kind,'apex.firmware-structure');
    assert.equal(result.source.sha256,digest(binary));
    assert.equal(result.source.format,'uimage');
    assert.equal(result.structure.kind,'uboot-legacy');
    assert.equal(result.structure.status,'complete');
    assert.equal(result.structure.headerChecksum,'mismatched');
    assert.equal(result.structure.payloadChecksum,'mismatched');
    assert.equal(result.inspection.targetExecuted,false);
    assert.equal(result.inspection.extracted,false);
    assert.deepEqual(readFileSync(input),binary);
    const cmd=()=>spawnSync(process.execPath,[
      new URL('../tools/device-intelligence/inspect-structure.mjs',import.meta.url).pathname,
      input,output],{encoding:'utf8',timeout:12000});
    const done=cmd();assert.equal(done.status,0,done.stderr);
    const saved=JSON.parse(readFileSync(output,'utf8'));
    assert.deepEqual(saved,result);
    const again=cmd();assert.notEqual(again.status,0);
    assert.match(again.stderr,/EEXIST/);
    assert.deepEqual(JSON.parse(readFileSync(output,'utf8')),saved);
    assert.deepEqual(readFileSync(input),binary);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
test('structure CLI refuses nonregular inputs and symlinks, no evidence written',()=>{
  const folder=mkdtempSync(join(tmpdir(),'apex-structure-safe-'));
  try{
    const file=join(folder,'tiny'),large=join(folder,'large'),link=join(folder,'link');
    writeFileSync(file,'small');writeFileSync(large,'');truncateSync(large,64*1024*1024+1);symlinkSync(file,link);
    const out=join(folder,'out.json');
    const script=new URL('../tools/device-intelligence/inspect-structure.mjs',import.meta.url).pathname;
    for(const input of [file,large,link,folder]){
      const proc=spawnSync(process.execPath,[script,input,out],{encoding:'utf8',timeout:12000});
      assert.notEqual(proc.status,0);
      assert.equal(existsSync(out),false);
    }
  }finally{rmSync(folder,{recursive:true,force:true});}
});
test('structure report for owned ELF host binary is explicitly unsupported at this header parser',()=>{
  const result=inspectOwnedFirmwareStructureFile('build/apex-firmware');
  assert.equal(result.source.format,'elf');
  assert.equal(result.structure,null);
  assert.equal(result.inspection.targetExecuted,false);
  assert.equal(result.inspection.networkContact,false);
});
