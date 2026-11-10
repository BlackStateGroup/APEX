import { parseBoundedJson } from './bounded-json.ts';
import { parseReaElfEvidence } from './rea-inspection.ts';

export const PASSPORT_MAX_CHARS = 65536;
export const READ_OPERATIONS = ['system.info', 'system.health', 'system.version'] as const;
export type ReadOperation = typeof READ_OPERATIONS[number];
export type FirmwareFormat = 'elf' | 'uimage' | 'squashfs' | 'gzip' | 'zip' | 'tar' | 'unknown';
export type AccessStatus = 'unknown';
export type BoundaryId = 'network' | 'transport-identity' | 'management-authentication' | 'application-authorisation' | 'operating-system-root' | 'boot-trust';

export interface FirmwareSource {
  name: string;
  sha256: string;
  bytes: number;
  format: FirmwareFormat;
}
export interface StaticIndicators {
  sshConfigurationMarker: boolean;
  credentialConfigurationMarker: boolean;
  webManagementMarker: boolean;
  // Indicators are boolean-only. Raw secret material must never cross this seam.
}
export interface ReaEvidenceLink {
  evidenceId: string;
  architecture: string;
  format: 'elf32' | 'elf64';
  coverage: 'complete' | 'partial';
  artifactSha256: string;
  provenance: 'imported-host-rea-elf-report';
}
export interface DevicePassport {
  schemaVersion: 1;
  kind: 'apex.device-passport';
  source: FirmwareSource;
  indicators: StaticIndicators;
  rea: ReaEvidenceLink | null;
  access: {
    network: AccessStatus;
    management: AccessStatus;
    root: AccessStatus;
    boot: AccessStatus;
  };
  evidence: 'offline-static-only';
  deviceConnected: false;
  targetExecuted: false;
  warnings: string[];
}
export interface ScopeDeclaration {
  fixtureId: string;
  sourceSha256: string;
  authorisation: 'owned-or-authorised-lab';
  approvedOperations: readonly ReadOperation[];
  expiresAtMs: number;
  operatorConfirmed: true;
}
export interface PolicyDecision {
  eligible: boolean;
  reason: 'declared-lab-policy-only' | 'scope-invalid' | 'scope-expired' | 'target-mismatch' | 'operation-denied';
  executionAuthorised: false; // A declared scope is not cryptographic proof of ownership or a login.
}

const shaPattern = /^[0-9a-f]{64}$/;
const tokenPattern = /^[a-zA-Z0-9_.:-]{1,80}$/;
function fail(reason: string): never { throw new Error('Device intelligence schema: ' + reason); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('expected plain object');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(k => typeof k !== 'string' || !keys.includes(k)) ||
      keys.some(k => !descriptors[k] || !('value' in descriptors[k]!))) fail('unexpected or missing field');
  return Object.fromEntries(keys.map(k => [k, descriptors[k]!.value]));
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail('invalid text');
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !shaPattern.test(value)) fail('invalid sha256');
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) fail('invalid number');
  return Number(value);
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') fail('invalid indicator');
  return value;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/** Strictly parse data-only device metadata. Never promote offline claims to physical access. */
export function parseDevicePassport(json: string): DevicePassport {
  if (typeof json !== 'string' || json.length > PASSPORT_MAX_CHARS) fail('input exceeds bound');
  const raw = exact(parseBoundedJson(json, PASSPORT_MAX_CHARS, 6),
    ['schemaVersion', 'kind', 'source', 'indicators', 'rea', 'access', 'evidence', 'deviceConnected', 'targetExecuted', 'warnings']);
  if (raw.schemaVersion !== 1 || raw.kind !== 'apex.device-passport' ||
      raw.evidence !== 'offline-static-only' || raw.deviceConnected !== false || raw.targetExecuted !== false) fail('unsupported provenance or asserted execution');
  const source = exact(raw.source, ['name', 'sha256', 'bytes', 'format']);
  const format = source.format;
  if (!['elf', 'uimage', 'squashfs', 'gzip', 'zip', 'tar', 'unknown'].includes(String(format))) fail('unsupported firmware format');
  const parsedSource: FirmwareSource = {
    name: text(source.name, 128), sha256: digest(source.sha256),
    bytes: integer(source.bytes, 16, 67108864), format: format as FirmwareFormat,
  };
  if (/[\\/]/.test(parsedSource.name) || parsedSource.name === '.' || parsedSource.name === '..') fail('unsafe filename');
  const indicators = exact(raw.indicators, ['sshConfigurationMarker', 'credentialConfigurationMarker', 'webManagementMarker']);
  const parsedIndicators: StaticIndicators = {
    sshConfigurationMarker: flag(indicators.sshConfigurationMarker),
    credentialConfigurationMarker: flag(indicators.credentialConfigurationMarker),
    webManagementMarker: flag(indicators.webManagementMarker),
  };
  const access = exact(raw.access, ['network', 'management', 'root', 'boot']);
  if (Object.values(access).some(value => value !== 'unknown')) fail('offline evidence cannot prove privileged access');
  let rea: ReaEvidenceLink | null = null;
  if (raw.rea !== null) {
    const link = exact(raw.rea, ['evidenceId', 'architecture', 'format', 'coverage', 'artifactSha256', 'provenance']);
    if (parsedSource.format !== 'elf' || typeof link.evidenceId !== 'string' || !/^ev_[0-9a-f]{64}$/.test(link.evidenceId) ||
        !['elf32', 'elf64'].includes(String(link.format)) || !['complete', 'partial'].includes(String(link.coverage)) ||
        link.provenance !== 'imported-host-rea-elf-report' || digest(link.artifactSha256) !== parsedSource.sha256) {
      fail('REA evidence not linked to exact ELF source');
    }
    rea = { evidenceId: link.evidenceId, architecture: text(link.architecture, 64),
      format: link.format as ReaEvidenceLink['format'], coverage: link.coverage as ReaEvidenceLink['coverage'],
      artifactSha256: parsedSource.sha256, provenance: 'imported-host-rea-elf-report' };
  }
  if (!Array.isArray(raw.warnings) || raw.warnings.length < 1 || raw.warnings.length > 12) fail('warning count');
  const warnings = raw.warnings.map(v => text(v, 256));
  if (new Set(warnings).size !== warnings.length) fail('duplicate warning');
  return deepFreeze({
    schemaVersion: 1, kind: 'apex.device-passport', source: parsedSource, indicators: parsedIndicators, rea,
    access: { network:'unknown', management:'unknown', root:'unknown', boot:'unknown' },
    evidence: 'offline-static-only', deviceConnected:false, targetExecuted:false, warnings,
  });
}

/** Create the only valid offline-source passport shape; no user/device identity claims. */
export function createOfflinePassport(source: FirmwareSource, indicators: StaticIndicators): DevicePassport {
  return parseDevicePassport(JSON.stringify({
    schemaVersion:1, kind:'apex.device-passport', source, indicators, rea:null,
    access:{network:'unknown', management:'unknown', root:'unknown', boot:'unknown'},
    evidence:'offline-static-only', deviceConnected:false, targetExecuted:false,
    warnings:[
      'Static firmware bytes cannot establish device identity, authentication, connectivity or root.',
      'The inspected file was not executed; a detected marker is not a recovered credential.',
    ],
  }));
}

/** Bind an existing REA ELF report to the exact same bytes; no inference of native access. */
export function attachReaElfEvidence(passport: DevicePassport, rawReaReport: string): DevicePassport {
  const original = parseDevicePassport(JSON.stringify(passport));
  if (original.source.format !== 'elf') fail('REA ELF report requires an ELF input');
  const inspected = parseReaElfEvidence(rawReaReport);
  if (inspected.artifact.sha256 !== original.source.sha256 || inspected.artifact.bytes !== original.source.bytes) {
    fail('REA source digest or byte length mismatch');
  }
  return parseDevicePassport(JSON.stringify({
    ...original,
    rea:{ evidenceId:inspected.evidenceId, architecture:inspected.artifact.architecture,
      format:inspected.artifact.format, coverage:inspected.coverage, artifactSha256:inspected.artifact.sha256,
      provenance:'imported-host-rea-elf-report' },
  }));
}

/** Read-only policy preflight. NEVER represents login, hardware access or identity attestation. */
export function evaluateDeclaredReadScope(passport: DevicePassport, scope: unknown, operation: unknown, nowMs: number): PolicyDecision {
  const deny = (reason: PolicyDecision['reason']): PolicyDecision => Object.freeze({ eligible:false, reason, executionAuthorised:false });
  const p = parseDevicePassport(JSON.stringify(passport));
  if (!READ_OPERATIONS.includes(operation as ReadOperation)) return deny('operation-denied');
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return deny('scope-invalid');
  let s: Record<string, unknown>;
  try { s = exact(scope, ['fixtureId', 'sourceSha256', 'authorisation', 'approvedOperations', 'expiresAtMs', 'operatorConfirmed']); }
  catch { return deny('scope-invalid'); }
  if (typeof s.fixtureId !== 'string' || !tokenPattern.test(s.fixtureId) ||
      typeof s.sourceSha256 !== 'string' || !shaPattern.test(s.sourceSha256) ||
      s.authorisation !== 'owned-or-authorised-lab' || s.operatorConfirmed !== true ||
      !Number.isSafeInteger(s.expiresAtMs) || Number(s.expiresAtMs) < 1 ||
      !Array.isArray(s.approvedOperations) || s.approvedOperations.length < 1 || s.approvedOperations.length > 3 ||
      s.approvedOperations.some(v => !READ_OPERATIONS.includes(v)) ||
      new Set(s.approvedOperations).size !== s.approvedOperations.length) return deny('scope-invalid');
  if (s.sourceSha256 !== p.source.sha256) return deny('target-mismatch');
  if (nowMs >= Number(s.expiresAtMs)) return deny('scope-expired');
  if (!s.approvedOperations.includes(operation)) return deny('operation-denied');
  return Object.freeze({ eligible:true, reason:'declared-lab-policy-only', executionAuthorised:false });
}

/** Fixed security-boundary graph: independent unknowns, not a route to privilege escalation. */
export function describeUnknownBoundaries(passport: DevicePassport): readonly Readonly<{ id: BoundaryId; status: 'unknown'; interpretation: string }>[] {
  parseDevicePassport(JSON.stringify(passport));
  return deepFreeze([
    {id:'network',status:'unknown',interpretation:'Transport reachability does not prove management authentication'},
    {id:'transport-identity',status:'unknown',interpretation:'TLS, device pairing and cryptographic identity require independent verification'},
    {id:'management-authentication',status:'unknown',interpretation:'A valid network session does not grant an administrator session'},
    {id:'application-authorisation',status:'unknown',interpretation:'Management role permission is separate from successful login'},
    {id:'operating-system-root',status:'unknown',interpretation:'Administrative API access is not an OS root shell'},
    {id:'boot-trust',status:'unknown',interpretation:'Firmware signing and recovery state need separate physical evidence'},
  ]);
}
