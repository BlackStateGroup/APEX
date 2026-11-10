import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflinePassport } from '../packages/core/device-intelligence.ts';
import { attachFirmwareStructureReport } from '../packages/core/firmware-structure-report.ts';

const sha='d'.repeat(64);
const a = (format:'uimage'|'squashfs'|'elf'='uimage',bytes=128)=>createOfflinePassport(
  {name:'synthetic-firmware.bin',sha256:sha,bytes,format},
  {sshConfigurationMarker:false,credentialConfigurationMarker:false,webManagementMarker:false}
);
function build(structure:unknown,format='uimage',bytes=128){
  return {
    schemaVersion:1,kind:'apex.firmware-structure',
    source:{name:'synthetic-firmware.bin',bytes,sha256:sha,format},
    structure,
    inspection:{method:'bounded-static-header-inspection',targetExecuted:false,
      networkContact:false,decompressed:false,extracted:false},
    limitations:[
      'Original source bytes are not verified on the mobile app.',
      'Checksum matches do not provide cryptographic identity.',
      'No shell, recovery, login or root access is implied.',
    ],
  };
}
const common = {
  schemaVersion:1,evidence:'static-header-only',trustedFirmware:false,rootAccess:'unknown',
};
const uimage=()=>({...common,kind:'uboot-legacy',status:'complete',
  headerChecksum:'matched',payloadChecksum:'matched',
  declaredPayloadBytes:64,availablePayloadBytes:64,trailingBytes:0,
  osCode:5,architectureCode:2,imageTypeCode:2,compressionCode:1,
  limitations:[
    'U-Boot CRC32 checks detect accidental corruption, not authenticity, trust or privilege.',
    'Header name, load/entry addresses and payload contents are deliberately not exported.',
    'Compression and multi-image contents were not decoded or executed.',
  ],
});
const squash=()=>({...common,kind:'squashfs',status:'plausible-v4-header',
  versionMajor:4,versionMinor:0,compressionCode:4,compression:'xz',
  blockSize:131072,blockLog:17,inodeCount:42,declaredBytesUsed:128,
  declaredSizeWithinInput:true,
  limitations:[
    'The superblock is untrusted input. No filesystem blocks, inode tables or signatures were verified.',
    'Plausible header fields do not establish a readable or authentic filesystem.',
    'No decompression, path traversal, file extraction or firmware execution was performed.',
  ],
});

test('uImage import attaches only to exact declared source identity, preserving unknown access',()=>{
  const r=attachFirmwareStructureReport(JSON.stringify(build(uimage())),a());
  assert.equal(r.source.sha256,sha);
  assert.equal(r.structure.kind,'uboot-legacy');
  assert.equal(r.structure.status,'complete');
  assert.equal(r.structure.headerCrc,'matched');
  assert.equal(r.structure.payloadCrc,'matched');
  assert.equal(r.structure.payloadBytes,64);
  assert.equal(r.structure.compression,'gzip');
  assert.equal(r.access,'unknown');
  assert.equal(r.signatureAuthenticated,false);
  assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.structure));assert.ok(Object.isFrozen(r.warnings));
});
test('SquashFS report accepts plausible v4 header but never declares verified filesystem',()=>{
  const report=build(squash(),'squashfs',256);
  const linked=attachFirmwareStructureReport(JSON.stringify(report),a('squashfs',256));
  assert.equal(linked.structure.kind,'squashfs');
  assert.equal(linked.structure.status,'plausible-v4-header');
  assert.equal(linked.structure.compression,'xz');
  assert.equal(linked.structure.usedBytes,128);
  assert.equal(linked.signatureAuthenticated,false);
});
test('imported report cannot attach to another hash, byte length or firmware format',()=>{
  const valid=build(uimage());
  for(const mismatch of [
    {...valid,source:{...valid.source,sha256:'e'.repeat(64)}},
    {...valid,source:{...valid.source,bytes:129}},
    {...valid,source:{...valid.source,format:'squashfs'}},
  ]) assert.throws(()=>attachFirmwareStructureReport(JSON.stringify(mismatch),a()),/source|bound/);
  assert.throws(()=>attachFirmwareStructureReport(JSON.stringify(valid),a('squashfs',128)),/source/);
  assert.throws(()=>attachFirmwareStructureReport(JSON.stringify(valid),a('uimage',256)),/source/);
});
test('forged authority, execution and extra raw-secret fields reject',()=>{
  for(const mutate of [
    (x:any)=>{x.structure.rootAccess='verified';},
    (x:any)=>{x.structure.trustedFirmware=true;},
    (x:any)=>{x.structure.password='root:123';},
    (x:any)=>{x.inspection.targetExecuted=true;},
    (x:any)=>{x.inspection.networkContact=true;},
    (x:any)=>{x.source.root='yes';},
    (x:any)=>{x.operation='reboot';},
    (x:any)=>{x.structure.status='root';},
    (x:any)=>{x.structure.payloadChecksum='authenticated';},
    (x:any)=>{x.structure.headerChecksum='authenticated';},
  ]){
    const x:any=build(uimage());mutate(x);
    assert.throws(()=>attachFirmwareStructureReport(JSON.stringify(x),a()));
  }
});
test('uImage header data must be internally consistent to avoid false complete/truncated claims',()=>{
  const bad=[
    (x:any)=>{x.declaredPayloadBytes=65;},
    (x:any)=>{x.availablePayloadBytes=65;},
    (x:any)=>{x.trailingBytes=12;},
    (x:any)=>{x.payloadChecksum='unavailable-truncated';},
    (x:any)=>{x.compressionCode=500;},
    (x:any)=>{x.status='truncated-payload';},
  ];
  for(const mutate of bad){
    const s:any=uimage();mutate(s);
    assert.throws(()=>attachFirmwareStructureReport(JSON.stringify(build(s)),a()));
  }
  const truncated:any=uimage();
  truncated.declaredPayloadBytes=65;truncated.status='truncated-payload';
  truncated.trailingBytes=null;truncated.payloadChecksum='unavailable-truncated';
  assert.equal(attachFirmwareStructureReport(JSON.stringify(build(truncated)),a()).structure.status,'truncated-payload');
});
test('SquashFS version, compression, size, block consistency and claimed plausibility checked',()=>{
  const bad=[
    (x:any)=>{x.versionMajor=5;},
    (x:any)=>{x.compression='aes';},
    (x:any)=>{x.blockSize=10000;},
    (x:any)=>{x.blockLog=16;},
    (x:any)=>{x.declaredBytesUsed=9999;},
    (x:any)=>{x.declaredSizeWithinInput=false;},
    (x:any)=>{x.versionMinor=1;},
  ];
  for(const mutate of bad){
    const s:any=squash();mutate(s);
    assert.throws(()=>attachFirmwareStructureReport(JSON.stringify(build(s,'squashfs',256)),a('squashfs',256)));
  }
});
test('warnings containing secret-shaped text never appear in imported summary',()=>{
  const report=build(uimage());
  report.limitations=['password=HIDDEN_TEST_VALUE','privateKey=HIDDEN_TEST_VALUE','session=HIDDEN_TEST_VALUE'];
  report.structure.limitations=['password=HIDDEN_TEST_VALUE','token=HIDDEN_TEST_VALUE','root=HIDDEN_TEST_VALUE'];
  const linked=attachFirmwareStructureReport(JSON.stringify(report),a());
  assert.equal(JSON.stringify(linked).includes('HIDDEN_TEST_VALUE'),false);
  assert.equal(linked.warnings.length,3);
});
test('truncated header variants reject impossible source lengths, legacy code and unknown kind',()=>{
  const u={...common,kind:'uboot-legacy',status:'truncated-header',limitations:['No data']};
  const s={...common,kind:'squashfs',status:'truncated-header',limitations:['No data']};
  assert.equal(attachFirmwareStructureReport(JSON.stringify(build(u,'uimage',32)),a('uimage',32)).structure.status,'truncated-header');
  assert.throws(()=>attachFirmwareStructureReport(JSON.stringify(build(u)),a()));
  assert.equal(attachFirmwareStructureReport(JSON.stringify(build(s,'squashfs',64)),a('squashfs',64)).structure.status,'truncated-header');
  const legacy={...common,kind:'squashfs-legacy-big-endian',status:'unsupported-version',limitations:['Unsupported','No integrity']};
  assert.equal(attachFirmwareStructureReport(JSON.stringify(build(legacy,'squashfs',128)),a('squashfs',128)).structure.kind,'squashfs-legacy-big-endian');
  assert.throws(()=>attachFirmwareStructureReport(JSON.stringify(build({...legacy,kind:'other'},'squashfs',128)),a('squashfs',128)));
});
test('malformed, ambiguous and oversized JSON strictly rejected',()=>{
  const good=JSON.stringify(build(uimage()));
  assert.throws(()=>attachFirmwareStructureReport('{',a()));
  assert.throws(()=>attachFirmwareStructureReport(' '.repeat(32769),a()),/character limit/);
  assert.throws(()=>attachFirmwareStructureReport(good.replace('"kind":"apex.firmware-structure"','"kind":"apex.firmware-structure","kind":"apex.firmware-structure"'),a()),/Duplicate/);
  assert.throws(()=>attachFirmwareStructureReport(good.replace('"kind":"apex.firmware-structure"','"__proto__":{},"kind":"apex.firmware-structure"'),a()));
});
