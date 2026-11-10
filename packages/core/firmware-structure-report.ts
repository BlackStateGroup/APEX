import { parseBoundedJson } from './bounded-json.ts';
import { createOfflinePassport, parseDevicePassport } from './device-intelligence.ts';
import type { DevicePassport, FirmwareSource } from './device-intelligence.ts';

export interface ImportedFirmwareStructure {
  source: Readonly<FirmwareSource>;
  provenance: 'unverified-offline-structure-import';
  signatureAuthenticated: false;
  access: 'unknown';
  structure: Readonly<{
    kind: 'uboot-legacy' | 'squashfs' | 'squashfs-legacy-big-endian' | 'unsupported';
    status: string;
    headerCrc: 'matched' | 'mismatched' | 'not-reported';
    payloadCrc: 'matched' | 'mismatched' | 'unavailable-truncated' | 'not-reported';
    compression: string;
    architectureCode: number | null;
    payloadBytes: number | null;
    usedBytes: number | null;
  }>;
  warnings: readonly string[];
}
const MAX_CHARACTERS=32768;
const SHA=/^[a-f\d]{64}$/;
function fail(message:string):never{throw new Error('Firmware structure import: '+message);}
function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!value || typeof value!=='object'||Array.isArray(value)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('expected plain object');
  const names=Reflect.ownKeys(value), descriptors=Object.getOwnPropertyDescriptors(value);
  if(names.length!==keys.length || names.some(k=>typeof k!=='string'||!keys.includes(k))||
     keys.some(k=>!descriptors[k]||!('value' in descriptors[k]!)))fail('missing or unexpected field');
  return Object.fromEntries(keys.map(k=>[k,descriptors[k]!.value]));
}
function boundedNumber(v:unknown,max=0xffffffff):number{
  if(!Number.isSafeInteger(v)||Number(v)<0||Number(v)>max)fail('number out of range');
  return Number(v);
}
function warnings(value:unknown,count:number):void{
  if(!Array.isArray(value)||value.length!==count||value.some(v=>typeof v!=='string'||v.length<1||v.length>256))fail('invalid limitations');
}
const UIMAGE_FIELDS=[
  'schemaVersion','kind','status','headerChecksum','payloadChecksum','declaredPayloadBytes',
  'availablePayloadBytes','trailingBytes','osCode','architectureCode','imageTypeCode',
  'compressionCode','evidence','trustedFirmware','rootAccess','limitations',
] as const;
const SQUASH_FIELDS=[
  'schemaVersion','kind','status','versionMajor','versionMinor','compressionCode',
  'compression','blockSize','blockLog','inodeCount','declaredBytesUsed',
  'declaredSizeWithinInput','evidence','trustedFirmware','rootAccess','limitations',
] as const;
const COMMON_FIELDS=['schemaVersion','kind','status','evidence','trustedFirmware','rootAccess','limitations'] as const;
const names=['gzip','lzma','lzo','xz','lz4','zstd'] as const;

function interpret(raw:unknown,source:FirmwareSource):ImportedFirmwareStructure['structure']{
  const result={kind:'unsupported',status:'not-available',headerCrc:'not-reported',
    payloadCrc:'not-reported',compression:'unknown',architectureCode:null,payloadBytes:null,usedBytes:null} as ImportedFirmwareStructure['structure'];
  if(raw===null)return Object.freeze(result);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('malformed structure');
  const kind=(raw as Record<string,unknown>).kind;
  const status=(raw as Record<string,unknown>).status;
  const base=(kind==='uboot-legacy'&&status!=='truncated-header')?
    exact(raw,UIMAGE_FIELDS) :
    (kind==='squashfs'&&status!=='truncated-header')?
      exact(raw,SQUASH_FIELDS):exact(raw,COMMON_FIELDS);
  if(base.schemaVersion!==1 || base.evidence!=='static-header-only' ||
     base.trustedFirmware!==false || base.rootAccess!=='unknown')fail('untrusted authority assertion');
  const limitCount=(kind==='uboot-legacy'&&status==='truncated-header')||(kind==='squashfs'&&status==='truncated-header')?1:
    kind==='squashfs-legacy-big-endian'?2:3;
  warnings(base.limitations,limitCount);
  if(kind==='uboot-legacy'){
    if(source.format!=='uimage')fail('uImage evidence format mismatch');
    if(status==='truncated-header'){
      if(source.bytes>=64)fail('false truncated U-Boot header');
      return Object.freeze({...result,kind,status});
    }
    if(!['complete','truncated-payload'].includes(String(status))||source.bytes<64)fail('invalid U-Boot status');
    if(!['matched','mismatched'].includes(String(base.headerChecksum)) ||
       !['matched','mismatched','unavailable-truncated'].includes(String(base.payloadChecksum)))fail('invalid CRC status');
    const declared=boundedNumber(base.declaredPayloadBytes);
    const available=boundedNumber(base.availablePayloadBytes,67108864);
    if(available!==source.bytes-64)fail('U-Boot payload size disagrees with source');
    for(const key of ['osCode','architectureCode','imageTypeCode','compressionCode'])boundedNumber(base[key],255);
    if(status==='complete'){
      if(declared>available || base.trailingBytes!==available-declared ||
         base.payloadChecksum==='unavailable-truncated')fail('false U-Boot payload completeness');
    }else if(declared<=available || base.trailingBytes!==null ||
      base.payloadChecksum!=='unavailable-truncated')fail('false U-Boot truncation');
    return Object.freeze({...result,kind,status,
      headerCrc:base.headerChecksum as 'matched'|'mismatched',
      payloadCrc:base.payloadChecksum as 'matched'|'mismatched'|'unavailable-truncated',
      compression:['none','gzip','bzip2','lzma','lzo','lz4'][base.compressionCode as number]??'unknown',
      architectureCode:Number(base.architectureCode),payloadBytes:declared});
  }
  if(kind==='squashfs'){
    if(source.format!=='squashfs')fail('SquashFS format mismatch');
    if(status==='truncated-header'){
      if(source.bytes>=96)fail('false truncated SquashFS header');
      return Object.freeze({...result,kind,status});
    }
    if(!['plausible-v4-header','inconsistent-or-unsupported'].includes(String(status))||source.bytes<96)fail('invalid SquashFS status');
    const major=boundedNumber(base.versionMajor,65535),minor=boundedNumber(base.versionMinor,65535);
    const code=boundedNumber(base.compressionCode,65535),block=boundedNumber(base.blockSize),
      log=boundedNumber(base.blockLog,65535);
    boundedNumber(base.inodeCount);
    let used:null|number=null;
    if(base.declaredBytesUsed!==null)used=boundedNumber(base.declaredBytesUsed,Number.MAX_SAFE_INTEGER);
    if(typeof base.declaredSizeWithinInput!=='boolean'||base.declaredSizeWithinInput!==(used!==null&&used>=96&&used<=source.bytes))fail('inconsistent SquashFS size declaration');
    const expectedCompression=names[code-1]??'unknown';
    if(base.compression!==expectedCompression)fail('compression label mismatch');
    const plausible=major===4&&minor===0&&block>=4096&&block<=1048576&&(block&(block-1))===0&&
      log===Math.log2(block)&&used!==null&&used>=96&&used<=source.bytes&&code>=1&&code<=6;
    if((status==='plausible-v4-header')!==plausible)fail('false SquashFS plausibility');
    return Object.freeze({...result,kind,status,compression:expectedCompression,usedBytes:used});
  }
  if(kind==='squashfs-legacy-big-endian'){
    if(source.format!=='squashfs'||status!=='unsupported-version')fail('unsupported SquashFS identity mismatch');
    return Object.freeze({...result,kind,status});
  }
  fail('unknown structure kind');
}

/**
 * Import structure metadata only when it refers to the exact same source bytes
 * as a separately validated Device Passport. This establishes correspondence
 * of *declared hashes*; the phone has not independently read those bytes.
 */
export function attachFirmwareStructureReport(
  document:string, expectedPassport:DevicePassport,
):ImportedFirmwareStructure{
  if(typeof document!=='string'||document.length>MAX_CHARACTERS)fail('character limit');
  const passport=parseDevicePassport(JSON.stringify(expectedPassport));
  const raw=exact(parseBoundedJson(document,MAX_CHARACTERS,6),
    ['schemaVersion','kind','source','structure','inspection','limitations']);
  if(raw.schemaVersion!==1||raw.kind!=='apex.firmware-structure')fail('unsupported report');
  const s=exact(raw.source,['name','bytes','sha256','format']);
  if(typeof s.sha256!=='string'||!SHA.test(s.sha256))fail('invalid source digest');
  const source=createOfflinePassport(s as unknown as FirmwareSource,{
    sshConfigurationMarker:false,credentialConfigurationMarker:false,webManagementMarker:false,
  }).source;
  if(source.sha256!==passport.source.sha256||source.bytes!==passport.source.bytes||
     source.format!==passport.source.format)fail('structure report not bound to Device Passport source');
  const inspection=exact(raw.inspection,
    ['method','targetExecuted','networkContact','decompressed','extracted']);
  if(inspection.method!=='bounded-static-header-inspection'||inspection.targetExecuted!==false||
     inspection.networkContact!==false||inspection.decompressed!==false||inspection.extracted!==false){
    fail('unexpected execution or transport claim');
  }
  warnings(raw.limitations,3);
  return Object.freeze({
    source:Object.freeze({...source}),
    provenance:'unverified-offline-structure-import',
    signatureAuthenticated:false,access:'unknown',
    structure:interpret(raw.structure,source),
    warnings:Object.freeze([
      'Hash correspondence is declared by imported reports and has not been checked against the original firmware on this phone.',
      'CRC fields are unkeyed integrity reports, not firmware signatures or access credentials.',
      'No root, management authentication, real-device identity or recovery capability is established.',
    ]),
  });
}
