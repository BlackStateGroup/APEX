#!/usr/bin/env python3
"""Build the same portable C peer/Ed25519 sources used by the lab firmware."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--sanitize', action='store_true')
args = parser.parse_args()
base = root / 'firmware/lab_signed_read'
pin = json.loads((base / 'vendor/PIN.json').read_text())
for name, digest in pin['sha256'].items():
    if hashlib.sha256((base / 'vendor' / name).read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Vendored source hash mismatch: {name}')
out = root / 'build'
out.mkdir(exist_ok=True)
flags = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic']
flags += ['-O1', '-g', '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-no-pie'] if args.sanitize else ['-O2']
for directory in [root / 'firmware/core', base, base / 'vendor']:
    flags += ['-I', str(directory)]
sources = [root / 'firmware/core/apex.c', base / 'lab_peer.c',
           base / 'vendor/monocypher.c', base / 'vendor/monocypher-ed25519.c']
suffix = '-san' if args.sanitize else ''
for name, source in [('apex-lab-peer', base / 'host_peer.c'), ('apex-lab-unit', root / 'tests/lab_signed_read_test.c')]:
    subprocess.run(['gcc', *flags, *map(str, sources), str(source), '-o', str(out / (name + suffix))], check=True)
subprocess.run([str(out / ('apex-lab-unit' + suffix))], check=True)
for mode in ['off', 'on']:
    target = out / ('apex-lab-sdk-' + mode + suffix)
    definitions = ['-DCONFIG_APEX_SIGNED_READ_LAB_OPT_IN=1'] if mode == 'on' else []
    subprocess.run(['gcc', *flags, '-I', str(root / 'tests/lab-sdk-stubs'), *definitions,
                    *(map(str, sources) if mode == 'on' else []), str(root / 'tests/lab_sdk_startup_test.c'), '-o', str(target)], check=True)
    subprocess.run([str(target)], check=True)
print('Built portable signed-read peer with pinned Monocypher 4.0.2' + (' (ASan/UBSan).' if args.sanitize else '.'))
