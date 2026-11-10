import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFirmwareStructure,firmwareCrc32 } from '../tools/device-intelligence/firmware-structure.mjs';

const independentCrc32 = data => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i=0;i<8;i++) crc = (crc&1) ? (crc>>>1)^0xedb88320 : crc>>>1;
  }
  return (crc^0xffffffff)>>>0;
};

function uImage(payload=Buffer.from('Synthetic U-Boot firmware payload', 'ascii'), overrides={}) {
  const h=Buffer.alloc(64);
  h.writeUInt32BE(0x27051956,0);
  h.writeUInt32BE(1731080000,8);
  h.writeUInt32BE(payload.length,12);
  h.writeUInt32BE(0,16);
  h.writeUInt32BE(0,20);
  h.writeUInt32BE(independentCrc32(payload),24);
  h[28]=5;h[29]=2;h[30]=2;h[31]=1;
  h.write('PRIVATE_PASSWORD_EXAMPLE',32, 'ascii'); // Must never be emitted in a report.
  if(overrides.declaredPayloadBytes!==undefined)h.writeUInt32BE(overrides.declaredPayloadBytes,12);
  const h0=Buffer.from(h);h0.writeUInt32BE(0,4);
  h.writeUInt32BE(independentCrc32(h0),4);
  return Buffer.concat([h,payload]);
}
function squash(overrides={}) {
  const bytes=Buffer.alloc(256);
  bytes.write('hsqs',0,'ascii');
  bytes.writeUInt32LE(42,4);
  bytes.writeUInt32LE(1680000000,8);
  bytes.writeUInt32LE(131072,12);
  bytes.writeUInt32LE(0,16);
  bytes.writeUInt16LE(4,20);
  bytes.writeUInt16LE(17,22);
  bytes.writeUInt16LE(0,24);
  bytes.writeUInt16LE(1,26);
  bytes.writeUInt16LE(4,28);
  bytes.writeUInt16LE(0,30);
  bytes.writeBigUInt64LE(128n,40);
  if(overrides.blockSize!==undefined)bytes.writeUInt32LE(overrides.blockSize,12);
  if(overrides.blockLog!==undefined)bytes.writeUInt16LE(overrides.blockLog,22);
  if(overrides.compression!==undefined)bytes.writeUInt16LE(overrides.compression,20);
  if(overrides.major!==undefined)bytes.writeUInt16LE(overrides.major,28);
  if(overrides.used!==undefined)bytes.writeBigUInt64LE(overrides.used,40);
  bytes.write('password=SHOULD_NOT_APPEAR',128,'ascii');
  return bytes;
}

test('CRC32 uses the standard independent polynomial and known vector',()=>{
  assert.equal(firmwareCrc32(Buffer.from('123456789')),0xcbf43926);
  assert.equal(firmwareCrc32(Buffer.from('123456789')),independentCrc32(Buffer.from('123456789')));
  assert.equal(firmwareCrc32(Buffer.alloc(0)),0);
  assert.throws(()=>firmwareCrc32('not a Buffer'),/bounded Buffer/);
  assert.throws(()=>firmwareCrc32(Buffer.alloc(64*1024*1024+1)),/bounded Buffer/);
});

test('valid U-Boot legacy header and payload CRCs verified independently, with no secrets emitted',()=>{
  const bytes=uImage();
  const unchanged=Buffer.from(bytes);
  const report=inspectFirmwareStructure(bytes);
  assert.deepEqual(report && {
    kind:report.kind,status:report.status,headerChecksum:report.headerChecksum,
    payloadChecksum:report.payloadChecksum,declaredPayloadBytes:report.declaredPayloadBytes,
    availablePayloadBytes:report.availablePayloadBytes,trailingBytes:report.trailingBytes,
    architectureCode:report.architectureCode,compressionCode:report.compressionCode,
  },{
    kind:'uboot-legacy',status:'complete',headerChecksum:'matched',payloadChecksum:'matched',
    declaredPayloadBytes:bytes.length-64,availablePayloadBytes:bytes.length-64,trailingBytes:0,
    architectureCode:2,compressionCode:1,
  });
  assert.equal(report.trustedFirmware,false);
  assert.equal(report.rootAccess,'unknown');
  assert.equal(report.evidence,'static-header-only');
  assert.equal(JSON.stringify(report).includes('PRIVATE_PASSWORD'),false);
  assert.deepEqual(bytes,unchanged);
  assert.equal(Object.isFrozen(report),true);
  assert.equal(Object.isFrozen(report.limitations),true);
});

test('recomputed CRC is not authenticity or root access; independent header and payload corruption are distinguished',()=>{
  const image=uImage();
  const mutatedPayload=Buffer.from(image);mutatedPayload[mutatedPayload.length-1]^=0x01;
  const payloadReport=inspectFirmwareStructure(mutatedPayload);
  assert.equal(payloadReport.headerChecksum,'matched');
  assert.equal(payloadReport.payloadChecksum,'mismatched');
  assert.equal(payloadReport.rootAccess,'unknown');

  const mutatedHeader=Buffer.from(image);mutatedHeader[29]^=0x01;
  const headerReport=inspectFirmwareStructure(mutatedHeader);
  assert.equal(headerReport.headerChecksum,'mismatched');
  assert.equal(headerReport.payloadChecksum,'matched');
  assert.equal(headerReport.trustedFirmware,false);
  assert.equal(headerReport.architectureCode,3);
});

test('truncated U-Boot images cannot claim a verified payload; trailing bytes recorded distinctly',()=>{
  const input=uImage(Buffer.from('abcdefghijklmnop'));
  const reported=inspectFirmwareStructure(input.subarray(0,30));
  assert.equal(reported.status,'truncated-header');
  const truncated=inspectFirmwareStructure(input.subarray(0,68));
  assert.equal(truncated.status,'truncated-payload');
  assert.equal(truncated.headerChecksum,'matched');
  assert.equal(truncated.payloadChecksum,'unavailable-truncated');
  assert.equal(truncated.trailingBytes,null);
  const extra=inspectFirmwareStructure(Buffer.concat([input,Buffer.alloc(37)]));
  assert.equal(extra.trailingBytes,37);
  const declared=uImage(Buffer.from('real data'),{declaredPayloadBytes:4294967295});
  const mismatch=inspectFirmwareStructure(declared);
  assert.equal(mismatch.status,'truncated-payload');
  assert.equal(mismatch.payloadChecksum,'unavailable-truncated');
});

test('SquashFS v4 superblock metrics are plausibility checks, not filesystem verification',()=>{
  const bytes=squash();
  const original=Buffer.from(bytes);
  const result=inspectFirmwareStructure(bytes);
  assert.equal(result.kind,'squashfs');
  assert.equal(result.status,'plausible-v4-header');
  assert.equal(result.versionMajor,4);
  assert.equal(result.versionMinor,0);
  assert.equal(result.compression,'xz');
  assert.equal(result.blockSize,131072);
  assert.equal(result.blockLog,17);
  assert.equal(result.declaredBytesUsed,128);
  assert.equal(result.declaredSizeWithinInput,true);
  assert.equal(result.inodeCount,42);
  assert.equal(result.rootAccess,'unknown');
  assert.equal(result.trustedFirmware,false);
  assert.equal(JSON.stringify(result).includes('SHOULD_NOT_APPEAR'),false);
  assert.deepEqual(bytes,original);
});

test('squash header invalid size, version, block size or compression stays unsupported',()=>{
  const variants=[
    {major:5},{blockSize:10000},{blockLog:12},{compression:999},
    {used:9000n},{used:1n},{used:0xffffffffffffffffn},
  ];
  for(const option of variants){
    const r=inspectFirmwareStructure(squash(option));
    assert.equal(r.status,'inconsistent-or-unsupported',JSON.stringify(option,(_key,value)=>typeof value==='bigint'?String(value):value));
    assert.equal(r.trustedFirmware,false);
  }
  const partial=squash().subarray(0,50);
  assert.equal(inspectFirmwareStructure(partial).status,'truncated-header');
  const legacy=Buffer.from(squash());legacy.write('sqsh',0,'ascii');
  assert.equal(inspectFirmwareStructure(legacy).status,'unsupported-version');
});

test('unknown, nested and oversized inputs are not scanned or unpacked',()=>{
  const embedded=Buffer.concat([Buffer.alloc(64),uImage()]);
  assert.equal(inspectFirmwareStructure(embedded),null);
  assert.equal(inspectFirmwareStructure(Buffer.alloc(512)),null);
  assert.throws(()=>inspectFirmwareStructure(Buffer.alloc(15)),/outside/);
  assert.throws(()=>inspectFirmwareStructure(Buffer.alloc(64*1024*1024+1)),/outside/);
  assert.throws(()=>inspectFirmwareStructure({magic:'hsqs'}),/outside/);
});
