import { writeFileSync } from 'node:fs';
import { resolve,basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readBoundedFirmwareFile, detectFirmwareFormat } from './inspect-firmware.mjs';
import { inspectFirmwareStructure } from './firmware-structure.mjs';

/**
 * Separate, additive static structure report. It does not alter the v1 Device
 * Passport schema or its mobile import rules. A later reviewed adapter may
 * link this document by source SHA-256, never by a file name or model guess.
 */
export function inspectOwnedFirmwareStructureFile(path) {
  const { bytes,name }=readBoundedFirmwareFile(path);
  const structure=inspectFirmwareStructure(bytes);
  return Object.freeze({
    schemaVersion:1,
    kind:'apex.firmware-structure',
    source:Object.freeze({
      name,
      bytes:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      format:detectFirmwareFormat(bytes),
    }),
    structure,
    inspection:Object.freeze({method:'bounded-static-header-inspection',
      targetExecuted:false,networkContact:false,decompressed:false,extracted:false}),
    limitations:Object.freeze([
      'Structure offsets are interpreted from supplied bytes only, not live hardware.',
      'CRC, magic bytes and plausible sizes do not establish signed firmware integrity.',
      'This report does not establish administrator authentication, exploitability or root access.',
    ]),
  });
}

async function main() {
  const args=process.argv.slice(2);
  if(args.length!==2)throw new Error('Usage: node tools/device-intelligence/inspect-structure.mjs INPUT OUTPUT');
  const [input,output]=args;
  const report=inspectOwnedFirmwareStructureFile(input);
  writeFileSync(resolve(output),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({
    output:basename(output),sha256:report.source.sha256,format:report.source.format,
    structure:report.structure?.kind??'unsupported',targetExecuted:false,
  })+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(e=>{process.stderr.write('APEX structure inspection failed: '+e.message+'\n');process.exitCode=1;});
}
