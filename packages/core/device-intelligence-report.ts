import { parseBoundedJson } from './bounded-json.ts';
import { parseDevicePassport } from './device-intelligence.ts';
import type { DevicePassport } from './device-intelligence.ts';

export const DEVICE_REPORT_MAX_CHARS = 65536;
export interface ArchiveSafetySummary { entriesExamined:number; unsafeEntryIndicators:number; incomplete:boolean }
export interface DeviceFirmwareReport {
  passport: DevicePassport;
  archive: ArchiveSafetySummary | null;
  warnings: readonly string[];
  evidence: 'offline-static-only';
  rootAccess: 'unknown';
  connectivity: 'unknown';
}
export interface OfflineFirmwareComparison {
  sameFirmwareBytes:boolean;
  formatChanged:boolean;
  changedIndicators:readonly ('sshConfigurationMarker'|'credentialConfigurationMarker'|'webManagementMarker')[];
  firstSha256:string;
  secondSha256:string;
  actualDeviceEquivalence:'unknown';
  securityPatchEstablished:false;
}

function fail(message:string):never { throw new Error('Firmware report: ' + message); }
function object(value:unknown,keys:readonly string[]):Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('expected plain object');
  const names=Reflect.ownKeys(value), descriptors=Object.getOwnPropertyDescriptors(value);
  if (names.length!==keys.length || names.some(k=>typeof k!=='string'||!keys.includes(k)) ||
    keys.some(k=>!descriptors[k]||!('value' in descriptors[k]!))) fail('unexpected fields');
  return Object.fromEntries(keys.map(k=>[k,descriptors[k]!.value]));
}
function safeText(value:unknown):string {
  if (typeof value !== 'string'||!value.length||value.length>256||/[\x00-\x1f\x7f]/.test(value)) fail('invalid warning');
  return value;
}
function count(value:unknown):number {
  if (!Number.isSafeInteger(value)||Number(value)<0||Number(value)>2048) fail('invalid archive count');
  return Number(value);
}

/** A strict, data-only mobile import of the Node inspector output. Neither file nor firmware is opened on the phone. */
export function parseDeviceFirmwareReport(document:string):DeviceFirmwareReport {
  if (typeof document !== 'string' || document.length>DEVICE_REPORT_MAX_CHARS) fail('input character bound');
  const raw=object(parseBoundedJson(document,DEVICE_REPORT_MAX_CHARS,8),
    ['schemaVersion','kind','passport','archive','inspection','limitations']);
  if (raw.schemaVersion!==1 || raw.kind!=='apex.firmware-analysis') fail('unsupported report');
  const passport=parseDevicePassport(JSON.stringify(raw.passport));
  const inspection=object(raw.inspection,['method','decompressed','firmwareExecuted','credentialValuesReturned','networkOrHardwareContact']);
  if (inspection.method!=='bounded-static-byte-inspection' || inspection.decompressed!==false ||
    inspection.firmwareExecuted!==false || inspection.credentialValuesReturned!==false ||
    inspection.networkOrHardwareContact!==false) fail('unsupported or asserted live inspection');
  let archive:ArchiveSafetySummary|null=null;
  if (raw.archive!==null) {
    const a=object(raw.archive,['entriesExamined','unsafeEntryIndicators','incomplete']);
    if (passport.source.format!=='tar' || typeof a.incomplete!=='boolean') fail('inconsistent archive');
    const entriesExamined=count(a.entriesExamined),unsafeEntryIndicators=count(a.unsafeEntryIndicators);
    if (unsafeEntryIndicators>entriesExamined) fail('invalid unsafe archive count');
    archive=Object.freeze({entriesExamined,unsafeEntryIndicators,incomplete:a.incomplete});
  } else if (passport.source.format==='tar') fail('tar must have archive summary');
  if (!Array.isArray(raw.limitations) || raw.limitations.length!==3) fail('invalid limitations');
  const warnings=raw.limitations.map(safeText);
  return Object.freeze({
    passport, archive, warnings:Object.freeze(warnings),
    evidence:'offline-static-only', rootAccess:'unknown', connectivity:'unknown',
  });
}

/** Compare declarations only, without interpreting marker changes as firmware patches or vulnerabilities. */
export function compareOfflineFirmwareReports(first:DeviceFirmwareReport,second:DeviceFirmwareReport):OfflineFirmwareComparison {
  const a=parseDeviceFirmwareReport(JSON.stringify({
    schemaVersion:1,kind:'apex.firmware-analysis',passport:first.passport,archive:first.archive,
    inspection:{method:'bounded-static-byte-inspection',decompressed:false,firmwareExecuted:false,credentialValuesReturned:false,networkOrHardwareContact:false},
    limitations:first.warnings,
  }));
  const b=parseDeviceFirmwareReport(JSON.stringify({
    schemaVersion:1,kind:'apex.firmware-analysis',passport:second.passport,archive:second.archive,
    inspection:{method:'bounded-static-byte-inspection',decompressed:false,firmwareExecuted:false,credentialValuesReturned:false,networkOrHardwareContact:false},
    limitations:second.warnings,
  }));
  const indicators=['sshConfigurationMarker','credentialConfigurationMarker','webManagementMarker'] as const;
  return Object.freeze({
    sameFirmwareBytes:a.passport.source.sha256===b.passport.source.sha256,
    formatChanged:a.passport.source.format!==b.passport.source.format,
    changedIndicators:Object.freeze(indicators.filter(key=>a.passport.indicators[key]!==b.passport.indicators[key])),
    firstSha256:a.passport.source.sha256,secondSha256:b.passport.source.sha256,
    actualDeviceEquivalence:'unknown',securityPatchEstablished:false,
  });
}
