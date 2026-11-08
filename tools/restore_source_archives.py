#!/usr/bin/env python3
"""Restore previously downloaded backup files; validate before installing a copy."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from source_archive_utils import extract_verified_archive, verify_checkout

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
    if relative.is_absolute() or not relative.parts or '..' in relative.parts:
        raise SystemExit('Unsafe destination')
    root = args.destination_root.resolve()
    destination = root / relative
    if any((root.joinpath(*relative.parts[:index])).is_symlink()
           for index in range(1, len(relative.parts) + 1)):
        raise SystemExit('Destination contains a symlink; refusing to overwrite')
    empty_placeholder = destination.is_dir() and not any(destination.iterdir())
    if destination.exists():
        if not empty_placeholder:
            try:
                verify_checkout(destination, row['commit'])
            except (ValueError, subprocess.SubprocessError) as error:
                raise SystemExit('Existing destination failed verification: ' + str(error))
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
        try:
            restored = extract_verified_archive(combined, temp, destination.name, row['commit'])
        except (ValueError, subprocess.SubprocessError) as error:
            raise SystemExit('Restored copy failed pinned-source verification: ' + str(error))
        if empty_placeholder:
            # rmdir refuses if another process has populated the placeholder.
            destination.rmdir()
        restored.rename(destination)
    print(row['id'] + ': restored and verified ' + row['commit'])
