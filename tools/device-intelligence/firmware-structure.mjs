/**
 * Bounded, read-only firmware container header checks for owned/offline images.
 * U-Boot legacy image.h and Linux squashfs_fs.h are reference formats.
 * These checks do not decompress, execute, unpack, authenticate or grant access.
 */
const MAX_BYTES = 64 * 1024 * 1024;
const HEADER_BYTES = 64;
const SQUASHFS_SUPERBLOCK_BYTES = 96;
const UIMAGE_MAGIC = Buffer.from([0x27,0x05,0x19,0x56]);
const SQUASH_MAGIC = Buffer.from('hsqs','ascii');
const SQUASH_LEGACY_BIG_ENDIAN_MAGIC = Buffer.from('sqsh','ascii');

const CRC_TABLE = Uint32Array.from({length:256},(_,i)=>{
  let c=i;
  for(let bit=0;bit<8;bit++)c=(c&1)?((c>>>1)^0xedb88320):(c>>>1);
  return c>>>0;
});

/** Standard reflected CRC-32, independently tested against the 123456789 vector. */
export function firmwareCrc32(bytes) {
  if(!Buffer.isBuffer(bytes) || bytes.length>MAX_BYTES)throw new Error('CRC input must be a bounded Buffer');
  let crc=0xffffffff;
  for(const byte of bytes)crc=(CRC_TABLE[(crc^byte)&0xff] ^ (crc>>>8))>>>0;
  return (crc^0xffffffff)>>>0;
}
function immutable(value) {
  if (value && typeof value==='object') {
    Object.freeze(value);
    for(const x of Object.values(value)) immutable(x);
  }
  return value;
}
const COMPRESSIONS=Object.freeze({1:'gzip',2:'lzma',3:'lzo',4:'xz',5:'lz4',6:'zstd'});
function squashCompression(code){return COMPRESSIONS[code]??'unknown';}

/**
 * Only bytes at offset zero are interpreted. Unknown wrappers and embedded
 * containers are not scanned for "interesting" offsets.
 *
 * Statuses represent only header consistency. CRCs are not signatures;
 * compromised or malicious firmware can have recomputed valid CRCs.
 */
export function inspectFirmwareStructure(bytes) {
  if(!Buffer.isBuffer(bytes) || bytes.length<16 || bytes.length>MAX_BYTES)throw new Error('Structure input outside 16 B to 64 MiB bound');
  if(bytes.subarray(0,4).equals(UIMAGE_MAGIC))return inspectUimage(bytes);
  if(bytes.subarray(0,4).equals(SQUASH_MAGIC))return inspectSquashFs(bytes);
  if(bytes.subarray(0,4).equals(SQUASH_LEGACY_BIG_ENDIAN_MAGIC))return immutable({
    schemaVersion:1,kind:'squashfs-legacy-big-endian',status:'unsupported-version',
    evidence:'static-header-only',trustedFirmware:false,rootAccess:'unknown',
    limitations:['Legacy big-endian image not decoded.','Header recognition is not firmware authenticity.'],
  });
  return null;
}

function inspectUimage(bytes) {
  if(bytes.length<HEADER_BYTES)return immutable({
    schemaVersion:1,kind:'uboot-legacy',status:'truncated-header',
    evidence:'static-header-only',trustedFirmware:false,rootAccess:'unknown',
    limitations:['Incomplete U-Boot header. No payload verification was attempted.'],
  });
  const header=Buffer.from(bytes.subarray(0,HEADER_BYTES));
  const expectedHeaderCrc=header.readUInt32BE(4);
  header.writeUInt32BE(0,4);
  const headerMatches=firmwareCrc32(header)===expectedHeaderCrc;
  const payloadBytes=bytes.readUInt32BE(12);
  const presentPayloadBytes=Math.max(0,bytes.length-HEADER_BYTES);
  const completePayload=payloadBytes<=presentPayloadBytes;
  const payload=completePayload?bytes.subarray(HEADER_BYTES,HEADER_BYTES+payloadBytes):null;
  const payloadMatches=payload!==null && firmwareCrc32(payload)===bytes.readUInt32BE(24);
  return immutable({
    schemaVersion:1,kind:'uboot-legacy',status:completePayload?'complete':'truncated-payload',
    headerChecksum:headerMatches?'matched':'mismatched',
    payloadChecksum:!completePayload?'unavailable-truncated':payloadMatches?'matched':'mismatched',
    declaredPayloadBytes:payloadBytes,
    availablePayloadBytes:presentPayloadBytes,
    trailingBytes:completePayload?presentPayloadBytes-payloadBytes:null,
    osCode:bytes[28],architectureCode:bytes[29],imageTypeCode:bytes[30],compressionCode:bytes[31],
    evidence:'static-header-only',trustedFirmware:false,rootAccess:'unknown',
    limitations:[
      'U-Boot CRC32 checks detect accidental corruption, not authenticity, trust or privilege.',
      'Header name, load/entry addresses and payload contents are deliberately not exported.',
      'Compression and multi-image contents were not decoded or executed.',
    ],
  });
}

function inspectSquashFs(bytes) {
  if(bytes.length<SQUASHFS_SUPERBLOCK_BYTES)return immutable({
    schemaVersion:1,kind:'squashfs',status:'truncated-header',
    evidence:'static-header-only',trustedFirmware:false,rootAccess:'unknown',
    limitations:['Incomplete SquashFS v4 superblock; no filesystem contents inspected.'],
  });
  const blockSize=bytes.readUInt32LE(12);
  const compressionCode=bytes.readUInt16LE(20);
  const blockLog=bytes.readUInt16LE(22);
  const versionMajor=bytes.readUInt16LE(28);
  const versionMinor=bytes.readUInt16LE(30);
  const usedBig=bytes.readBigUInt64LE(40);
  const bytesUsed=usedBig<=BigInt(Number.MAX_SAFE_INTEGER)?Number(usedBig):null;
  const blockSizeValid=blockSize>=4096 && blockSize<=1048576 &&
    (blockSize&(blockSize-1))===0 && blockLog===Math.log2(blockSize);
  const sizePlausible=bytesUsed!==null && bytesUsed>=SQUASHFS_SUPERBLOCK_BYTES && bytesUsed<=bytes.length;
  const versionSupported=versionMajor===4 && versionMinor===0;
  const metadataPlausible=versionSupported && blockSizeValid && sizePlausible &&
    Number.isInteger(compressionCode) && compressionCode>=1 && compressionCode<=6;
  return immutable({
    schemaVersion:1,kind:'squashfs',status:metadataPlausible?'plausible-v4-header':'inconsistent-or-unsupported',
    versionMajor,versionMinor,compressionCode,compression:squashCompression(compressionCode),
    blockSize,blockLog,inodeCount:bytes.readUInt32LE(4),declaredBytesUsed:bytesUsed,
    declaredSizeWithinInput:sizePlausible,
    evidence:'static-header-only',trustedFirmware:false,rootAccess:'unknown',
    limitations:[
      'The superblock is untrusted input. No filesystem blocks, inode tables or signatures were verified.',
      'Plausible header fields do not establish a readable or authentic filesystem.',
      'No decompression, path traversal, file extraction or firmware execution was performed.',
    ],
  });
}
