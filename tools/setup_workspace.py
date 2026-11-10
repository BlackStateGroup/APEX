#!/usr/bin/env python3
"""Prepare APEX and its pinned research roots without changing source manifests."""
import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile

from source_archive_utils import git, verify_checkout

ROOT = Path(__file__).resolve().parent.parent


def manifest_rows(root):
    rows = json.loads((root / 'research/source-imports.json').read_text())['copies']
    seen = set()
    for row in rows:
        if (not re.fullmatch(r'R[0-9]{2}', row['id']) or row['id'] in seen
                or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', row['repository'])
                or not re.fullmatch(r'[0-9a-f]{40}', row['commit'])):
            raise ValueError('Invalid or duplicate pinned source identity')
        expected = 'research/upstream-sources/' + row['id'] + '-' + row['repository'].replace('/', '--')
        if row['path'] != expected:
            raise ValueError('Source path does not match its registered identity')
        seen.add(row['id'])
    return rows


def source_path(root, row):
    root = root.resolve()
    relative = Path(row['path'])
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Unsafe source path')
    for n in range(1, len(relative.parts) + 1):
        if root.joinpath(*relative.parts[:n]).is_symlink():
            raise ValueError('Source destination contains a symlink')
    return root / relative


def fetch_pinned(destination, row, log):
    environment = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_LFS_SKIP_SMUDGE': '1'}
    prefix = ['git', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
              '-c', 'protocol.file.allow=never', '-c', 'protocol.ext.allow=never',
              '-c', 'submodule.recurse=false']
    url = 'https://github.com/' + row['repository'] + '.git'
    with log.open('w') as output:
        for args in [['init', '--quiet'], ['remote', 'add', 'origin', url],
                     ['fetch', '--no-tags', '--depth=1', 'origin', row['commit']],
                     ['checkout', '--no-overwrite-ignore', '--detach', row['commit']]]:
            subprocess.run(prefix + args, cwd=destination, env=environment,
                           stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                           check=True, timeout=900)


def ensure_source(root, row, *, check_only=False, fetcher=fetch_pinned):
    destination = source_path(root, row)
    empty = destination.is_dir() and not any(destination.iterdir())
    if destination.exists() and not empty:
        verify_checkout(destination, row['commit'])
        method = 'existing-verified'
    else:
        if check_only:
            raise ValueError('Pinned source is not materialised')
        destination.parent.mkdir(parents=True, exist_ok=True)
        log = root / 'build/workspace-setup' / (row['id'] + '.log')
        log.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='apex-fetch-', dir=destination.parent) as temp:
            staged = Path(temp) / destination.name
            staged.mkdir()
            fetcher(staged, row, log)
            verify_checkout(staged, row['commit'], self_contained=True)
            # Refuse a destination populated while the fetch was running.
            if destination.exists():
                if not empty or not destination.is_dir() or destination.is_symlink():
                    raise ValueError('Source destination changed during fetch')
                destination.rmdir()
            staged.rename(destination)
        method = 'fetched-exact-pin'
    entries = git(destination, 'ls-tree', '-r', 'HEAD').splitlines()
    return {'id': row['id'], 'repository': row['repository'], 'commit': row['commit'],
            'path': row['path'], 'state': 'verified', 'method': method,
            'trackedEntries': len(entries),
            'rootGitlinks': sum(line.startswith('160000 ') for line in entries),
            'nestedSourcesVerified': False}


def command(args, root, name):
    print(name, flush=True)
    log = root / 'build/workspace-setup' / (name + '.log')
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open('w') as output:
        subprocess.run(args, cwd=root, stdin=subprocess.DEVNULL, stdout=output,
                       stderr=output, check=True, timeout=1800)
    return {'check': name, 'state': 'passed', 'log': str(log.relative_to(root))}


def save_receipt(root, receipt):
    destination = root / 'build/workspace-setup.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=destination.parent, delete=False) as f:
        json.dump(receipt, f, indent=2); f.write('\n'); temporary = Path(f.name)
    temporary.replace(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive-dir', type=Path, help='Use the 32 original backup parts instead of GitHub fetches')
    parser.add_argument('--check', action='store_true', help='Check existing sources/dependencies without fetching or installing')
    parser.add_argument('--sources-only', action='store_true', help='Prepare/check sources without installing app dependencies')
    parser.add_argument('--verify', action='store_true', help='Also run full host tests and iOS/Android/web exports')
    parser.add_argument('--jobs', type=int, default=4, choices=range(1, 9))
    args = parser.parse_args()
    if sys.version_info < (3, 12):
        parser.error('Python 3.12 or later is required')
    if args.check and args.archive_dir:
        parser.error('--check cannot restore archives')
    rows = manifest_rows(ROOT)
    receipt = {'schema': 'apex.workspace-setup.v1', 'observedAt': datetime.now(timezone.utc).isoformat(),
               'host': {'system': platform.system(), 'machine': platform.machine()},
               'requestedMode': 'sources-only' if args.sources_only else 'sources-and-app',
               'checkOnly': args.check,
               'sourceManifestSha256': hashlib.sha256((ROOT / 'research/source-imports.json').read_bytes()).hexdigest(),
               'sources': [], 'checks': [], 'failures': [],
               'scope': 'Pinned root source trees and APEX dependencies; not all upstream dependencies or platform SDKs.'}
    try:
        if not shutil.which('git'):
            raise ValueError('Install Git before setup')
        if args.archive_dir:
            receipt['checks'].append(command([sys.executable, 'tools/restore_source_archives.py',
                '--archive-dir', str(args.archive_dir.resolve())], ROOT, 'restore-archives'))
        def source(row):
            try:
                result = ensure_source(ROOT, row, check_only=args.check or bool(args.archive_dir))
                print(row['id'] + ': verified ' + row['commit'][:12], flush=True)
                return result
            except (OSError, ValueError, subprocess.SubprocessError) as error:
                return {'id': row['id'], 'state': 'failed', 'error': str(error)}
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
            receipt['sources'] = list(pool.map(source, rows))
        receipt['failures'].extend(r['id'] + ': ' + r['error'] for r in receipt['sources'] if r['state'] == 'failed')
        if not args.sources_only:
            if not shutil.which('node') or not shutil.which('npm'):
                raise ValueError('Install Node 24 and npm before app dependency setup')
            version = subprocess.check_output(['node', '--version'], text=True).strip()
            if not re.fullmatch(r'v24\.[0-9]+\.[0-9]+', version):
                raise ValueError('APEX requires Node 24.x; found ' + version)
            for path in [ROOT, ROOT / 'tools/reverse-engineering']:
                if (path / 'node_modules').is_symlink():
                    raise ValueError('Refusing to replace shared dependency symlink: ' + str(path / 'node_modules'))
                prefix = ['npm'] + ([] if path == ROOT else ['--prefix', str(path)])
                command_args = ['ls', '--depth=0'] if args.check else ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
                if path != ROOT and not args.check:
                    command_args.append('--omit=optional')
                name = 'app-dependencies' if path == ROOT else 'rea-dependencies'
                receipt['checks'].append(command(prefix + command_args, ROOT, name))
            for name in ['typecheck', 'inventory:check'] + (['test', 'build'] if args.verify else []):
                receipt['checks'].append(command(['npm', 'run', name], ROOT, name.replace(':', '-')))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        receipt['failures'].append(str(error))
    receipt['ready'] = not receipt['failures'] and len(receipt['sources']) == len(rows)
    save_receipt(ROOT, receipt)
    print(json.dumps({'ready': receipt['ready'], 'verifiedSources': sum(r['state'] == 'verified' for r in receipt['sources']),
                      'failures': receipt['failures'], 'receipt': 'build/workspace-setup.json'}), flush=True)
    return 0 if receipt['ready'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
