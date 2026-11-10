#!/usr/bin/env node
// Sign fixtures with the actual portable C firmware, then execute the same
// verifier source used by the Expo bindings. No hardware or permanent keys.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encode, FrameDecoder } from '../packages/protocol/index.ts';
import { accessorySignedReadTranscript } from '../packages/core/accessory-trust.ts';

const mode = process.argv[2];
if (!['--java', '--swift'].includes(mode) || process.argv.length !== 3) throw Error('Use --java or --swift');
const root = resolve(import.meta.dirname, '..'), temp = mkdtempSync(join(tmpdir(), 'apex-native-trust-'));
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { cwd: root, timeout: 120000, ...options });
  if (r.error || r.status !== 0) throw Error(`${command} failed: ${r.stderr?.toString() ?? r.error}`);
  return r.stdout;
}
try {
  run('python3', ['tools/build_lab_signed_read.py']);
  const keydir = join(temp, 'key');
  run(process.execPath, ['tools/provision_lab_signed_read.mjs', '--generate-new-lab-key', keydir, 'Ephemeral native test']);
  const { publicKeyHex } = JSON.parse(readFileSync(join(keydir, 'public-key.json'), 'utf8'));
  const key = Buffer.from(publicKeyHex, 'hex'), cases = [];
  const add = (expected, k, m, s) => cases.push([expected ? '1' : '0', ...[k, m, s].map(b => Buffer.from(b).toString('hex') || '-')].join(' '));
  for (const [op, length] of [[1,0],[2,0],[3,0],[3,128]]) {
    const payload = new Uint8Array(36 + length); payload.set([1,op]); payload.set(randomBytes(32),2); payload[34] = length; payload.set(randomBytes(length),36);
    const q = {kind:1, opcode:0x70, id:cases.length+1, payload};
    const wire = run(join(root,'build/apex-lab-peer'), ['--lab-opt-in',join(keydir,'lab-key-partition.bin')], {input:encode(q)});
    let reply; new FrameDecoder(f => { if (reply) throw Error('Duplicate reply'); reply = f; }).push(wire);
    if (!reply) throw Error('Missing C signature');
    const message = accessorySignedReadTranscript(publicKeyHex,q,reply.payload), signature = reply.payload.subarray(-64);
    add(true,key,message,signature);
    const changed = message.slice(); changed[0] ^= 1; add(false,key,changed,signature);
    const sig = signature.slice(); sig[0] ^= 1; add(false,key,message,sig);
    add(false,randomBytes(32),message,signature);
    add(false,key.subarray(1),message,signature);
    add(false,key,message,signature.subarray(1));
    add(false,key,new Uint8Array(524),signature);
    add(false,key,new Uint8Array(),signature);
  }
  const fixtures = join(temp,'cases.txt'); writeFileSync(fixtures,cases.join('\n')+'\n');
  const out = join(root,'build','native-trust'); mkdirSync(out,{recursive:true});
  if (mode === '--java') {
    run(process.env.APEX_JAVAC || 'javac', ['-d',out,'modules/apex-trust/android/src/main/java/expo/modules/apextrust/Ed25519Verifier.java','tests/native-trust/NativeTrustCheck.java']);
    process.stdout.write(run(process.env.APEX_JAVA || 'java',['-cp',out,'NativeTrustCheck',fixtures]));
  } else {
    run('swiftc',['modules/apex-trust/ios/Ed25519Verifier.swift','tests/native-trust/main.swift','-o',join(out,'swift-check')]);
    process.stdout.write(run(join(out,'swift-check'),[fixtures]));
  }
} finally { rmSync(temp,{recursive:true,force:true}); }
