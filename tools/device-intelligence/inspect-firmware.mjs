import { openSync, readSync, closeSync, fstatSync, writeFileSync, constants } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createOfflinePassport, attachReaElfEvidence, parseDevicePassport } from '../../packages/core/device-intelligence.ts';

const MAX_BYTES = 67108864;
const MIN_BYTES = 16;
const INPUT_FLAGS = constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const has = (bytes, term) => bytes.indexOf(Buffer.from(term, 'ascii')) >= 0;

export function detectFirmwareFormat(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < MIN_BYTES) throw new Error('Expected a bounded binary buffer');
  if (bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return 'elf';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x27, 0x05, 0x19, 0x56]))) return 'uimage';
  if (bytes.subarray(0, 4).equals(Buffer.from('hsqs', 'ascii')) || bytes.subarray(0, 4).equals(Buffer.from('sqsh', 'ascii'))) return 'squashfs';
  if (bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 8) return 'gzip';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
      bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]))) return 'zip';
  if (bytes.length >= 512 && bytes.toString('ascii', 257, 262) === 'ustar') return 'tar';
  return 'unknown';
}

function tarSafety(bytes) {
  let offset = 0, entries = 0, unsafe = 0, truncated = false;
  while (offset + 512 <= bytes.length && entries < 2048) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(v => v === 0)) break;
    const name = header.toString('utf8', 0, 100).split('\0')[0] ?? '';
    const prefix = header.toString('utf8', 345, 500).split('\0')[0] ?? '';
    const path = prefix ? prefix + '/' + name : name;
    const sizeText = header.toString('ascii', 124, 136).replace(/\0.*$/s, '').trim();
    if (!/^[0-7]{1,11}$/.test(sizeText)) { truncated = true; break; }
    const size = parseInt(sizeText, 8);
    const type = String.fromCharCode(header[156] ?? 0);
    if (path.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(path) ||
        path.includes('\\') || path.includes('\0') || ['1','2','3','4','6','7','x','g','L','K'].includes(type)) unsafe++;
    entries++;
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    if (!Number.isSafeInteger(next) || next > bytes.length) { truncated = true; break; }
    offset = next;
  }
  if (entries === 2048 && offset + 512 <= bytes.length) truncated = true;
  return Object.freeze({entriesExamined: entries, unsafeEntryIndicators: unsafe, incomplete: truncated});
}

/** Static, bounded byte-only inspection. Does not extract archives, execute firmware or output secrets. */
export function inspectFirmwareBytes(bytes, filename = 'firmware.bin', rawReaReport = null) {
  if (!Buffer.isBuffer(bytes) || bytes.length < MIN_BYTES || bytes.length > MAX_BYTES) {
    throw new Error('Firmware must be a Buffer between 16 bytes and 64 MiB');
  }
  if (typeof filename !== 'string' || filename !== basename(filename) ||
      filename.length < 1 || filename.length > 128 || /[\x00-\x1f\x7f\\/]/.test(filename)) {
    throw new Error('Unsafe firmware filename');
  }
  const format = detectFirmwareFormat(bytes);
  const source = {name:filename, bytes:bytes.length, sha256:sha256(bytes), format};
  const indicators = {
    sshConfigurationMarker: has(bytes, 'dropbear') || has(bytes, 'sshd_config'),
    credentialConfigurationMarker: has(bytes, 'passwd') || has(bytes, 'shadow') || has(bytes, 'password='),
    webManagementMarker: has(bytes, 'uhttpd') || has(bytes, 'luci') || has(bytes, 'nginx.conf'),
  };
  let passport = createOfflinePassport(source, indicators);
  if (rawReaReport !== null) passport = attachReaElfEvidence(passport, rawReaReport);
  const archive = format === 'tar' ? tarSafety(bytes) : null;
  return Object.freeze({
    schemaVersion:1, kind:'apex.firmware-analysis',
    passport, archive,
    inspection:Object.freeze({method:'bounded-static-byte-inspection', decompressed:false, firmwareExecuted:false,
      credentialValuesReturned:false, networkOrHardwareContact:false}),
    limitations:Object.freeze([
      'Markers are byte-pattern observations, not confirmed accounts, passwords, running services or vulnerabilities.',
      format === 'gzip' || format === 'zip' || format === 'squashfs'
        ? 'Compressed filesystem contents were not decompressed or searched.'
        : 'Static bytes alone cannot establish runtime behaviour, device authenticity or root access.',
      'Source hash establishes observed byte identity, not firmware signature authenticity or hardware provenance.',
    ]),
  });
}

export function inspectFirmwareFile(path, rawReaReport = null) {
  if (typeof path !== 'string' || !path) throw new Error('Select a firmware file');
  const file = resolve(path);
  const fd = openSync(file, INPUT_FLAGS);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size < MIN_BYTES || before.size > MAX_BYTES) {
      throw new Error('Select a regular firmware file between 16 bytes and 64 MiB');
    }
    const bytes = Buffer.alloc(before.size + 1);
    let received = 0;
    while (received < bytes.length) {
      const count = readSync(fd, bytes, received, bytes.length - received, null);
      if (count === 0) break;
      received += count;
    }
    const after = fstatSync(fd);
    if (received !== before.size || after.size !== before.size || after.ino !== before.ino ||
        after.dev !== before.dev || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
      throw new Error('Firmware file changed during bounded read');
    }
    return inspectFirmwareBytes(bytes.subarray(0, received), basename(file), rawReaReport);
  } finally {
    closeSync(fd);
  }
}

export function compareFirmwareReports(a, b) {
  function report(value) {
    if (!value || value.schemaVersion !== 1 || value.kind !== 'apex.firmware-analysis') throw new Error('Unsupported analysis report');
    return parseDevicePassport(JSON.stringify(value.passport));
  }
  const first = report(a), second = report(b);
  const indicatorChanges = Object.keys(first.indicators).filter(key => first.indicators[key] !== second.indicators[key]);
  return Object.freeze({
    schemaVersion:1, kind:'apex.firmware-comparison', sourceDigests:Object.freeze([first.source.sha256, second.source.sha256]),
    sameBytes:first.source.sha256 === second.source.sha256,
    formatChanged:first.source.format !== second.source.format,
    changedIndicatorClasses:Object.freeze(indicatorChanges),
    rootAccess:'unknown',
    limitations:'Changed bytes or markers do not establish a security patch, exploitability or privilege access.',
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 && args.length !== 4) throw new Error('Usage: node tools/device-intelligence/inspect-firmware.mjs INPUT OUTPUT [--rea-report REA_JSON]');
  const [source, output, option, reportFile] = args;
  if (args.length === 4 && option !== '--rea-report') throw new Error('Unknown option');
  let rawRea = null;
  if (reportFile) {
    const fd = openSync(resolve(reportFile), INPUT_FLAGS);
    try {
      const info = fstatSync(fd);
      if (!info.isFile() || info.size < 1 || info.size > 262144) throw new Error('REA report exceeds import bound');
      const data = Buffer.alloc(info.size + 1);
      let total = 0;
      while (total < data.length) { const n = readSync(fd, data, total, data.length - total, null); if (n === 0) break; total += n; }
      if (total !== info.size) throw new Error('REA report changed size');
      rawRea = data.subarray(0, total).toString('utf8');
    } finally { closeSync(fd); }
  }
  const result = inspectFirmwareFile(source, rawRea);
  // Never overwrite prior evidence. The caller owns output location and must create its parent first.
  writeFileSync(resolve(output), JSON.stringify(result, null, 2) + '\n', {flag:'wx', mode:0o600});
  process.stdout.write(JSON.stringify({report:basename(output), artifactSha256:result.passport.source.sha256,
    format:result.passport.source.format, evidence:result.passport.evidence, targetExecuted:false}) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write('APEX firmware inspection failed: ' + error.message + '\n'); process.exitCode = 1; });
}
