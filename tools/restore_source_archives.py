#!/usr/bin/env python3
"""Restore previously downloaded backup files; validate before installing a copy."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--archive-dir', type=Path, required=True)
parser.add_argument('--destination-root', type=Path, default=ROOT)
parser.add_argument('--id', help='Restore one source ID, e.g. R08')
args = parser.parse_args()
manifest = json.loads((ROOT / 'research/source-imports.json').read_text())
selected = [r for r in manifest['copies'] if not args.id or r['id'] == args.id]
if not selected:
    raise SystemExit('Unknown source ID')
for row in selected:
    relative = Path(row['path'])
    if relative.is_absolute() or '..' in relative.parts:
        raise SystemExit('Unsafe destination')
    destination = args.destination_root / relative
    if destination.exists():
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=destination, text=True).strip()
        if head != row['commit']:
            raise SystemExit('Existing destination has a different commit; refusing to overwrite')
        print(row['id'] + ': existing pinned copy retained')
        continue
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='apex-restore-', dir=destination.parent) as temp:
        temp = Path(temp)
        combined = temp / 'source.tar.gz'
        with combined.open('wb') as output:
            for backup in row['backups']:
                if Path(backup['filename']).name != backup['filename']:
                    raise SystemExit('Unsafe backup filename')
                source = args.archive_dir / backup['filename']
                with source.open('rb') as f:
                    digest = hashlib.file_digest(f, 'sha256').hexdigest()
                if digest != backup['sha256']:
                    raise SystemExit('Backup checksum mismatch: ' + backup['filename'])
                with source.open('rb') as f:
                    shutil.copyfileobj(f, output)
        with combined.open('rb') as f:
            if hashlib.file_digest(f, 'sha256').hexdigest() != row['archiveSha256']:
                raise SystemExit('Combined archive checksum mismatch')
        with tarfile.open(combined, 'r:gz') as archive:
            if any(Path(member.name).parts[0] != destination.name for member in archive.getmembers()):
                raise SystemExit('Unexpected archive root')
            archive.extractall(temp, filter='data')
        restored = temp / destination.name
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=restored, text=True).strip()
        dirty = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=restored, text=True).strip()
        if head != row['commit'] or dirty:
            raise SystemExit('Restored copy failed pinned-source verification')
        restored.rename(destination)
    print(row['id'] + ': restored and verified ' + row['commit'])
