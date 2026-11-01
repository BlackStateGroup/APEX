#!/usr/bin/env python3
"""Copy pinned public upstreams without executing upstream code."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / 'research/upstream-sources'
ARCHIVES = ROOT.parent / 'source-archives'
SOURCES.mkdir(exist_ok=True, parents=True)
ARCHIVES.mkdir(exist_ok=True, parents=True)
original = json.loads((ROOT / 'research/upstreams.json').read_text())['projects']
additional = json.loads((ROOT / 'research/source-additions.json').read_text())
projects = original + additional
previous_path = ROOT / 'research/source-imports.json'
previous = json.loads(previous_path.read_text()).get('copies', []) if previous_path.exists() else []
previous = {(r['repository'], r['commit']): r for r in previous}

def command(args, cwd, log):
    subprocess.run(args, cwd=cwd, stdout=log, stderr=log, check=True, timeout=900)

def copy(project):
    name = project['id'] + '-' + project['repository'].replace('/', '--')
    folder = SOURCES / name
    archive = ARCHIVES / ('APEX-' + name + '-' + project['commit'][:12] + '.tar.gz')
    try:
        with (ARCHIVES / (name + '.log')).open('a') as log:
            if not (folder / '.git').exists():
                if folder.exists():
                    raise ValueError('Existing non-Git folder: refusing to overwrite')
                folder.mkdir()
                command(['git', 'init', '--quiet'], folder, log)
                command(['git', 'remote', 'add', 'origin', 'https://github.com/' + project['repository'] + '.git'], folder, log)
            current = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=folder, capture_output=True, text=True)
            if current.returncode != 0 or current.stdout.strip() != project['commit']:
                command(['git', '-c', 'core.hooksPath=/dev/null', 'fetch', '--depth=1', 'origin', project['commit']], folder, log)
                command(['git', '-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', project['commit']], folder, log)
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=folder, text=True).strip()
        if head != project['commit']:
            raise ValueError('Commit mismatch')
        tracked = subprocess.check_output(['git', 'ls-tree', '-r', 'HEAD'], cwd=folder, text=True).splitlines()
        submodules = [line.split('\t', 1)[1] for line in tracked if line.startswith('160000 ')]
        status = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=folder, text=True)
        if status.strip():
            raise ValueError('Checkout differs from pinned commit')
        if not archive.exists():
            temporary = archive.with_suffix('.partial')
            with tarfile.open(temporary, 'w:gz', compresslevel=1) as output:
                output.add(folder, arcname=name)
            temporary.rename(archive)
        digest = hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest()
        row = {'id': project['id'], 'repository': project['repository'], 'commit': head,
               'path': str(folder.relative_to(ROOT)), 'status': 'copied-and-verified',
               'trackedEntries': len(tracked), 'nestedSubmodulesNotInitialised': submodules,
               'history': 'shallow pinned checkout', 'archiveName': archive.name,
               'archiveBytes': archive.stat().st_size, 'archiveSha256': digest,
               'licences': [str(p.relative_to(folder)) for p in folder.iterdir() if any(x in p.name.lower() for x in ['licen', 'copying', 'copyright'])],
               'applicationCodeIntegrated': False}
        old = previous.get((project['repository'], head), {})
        if old.get('archiveSha256') == digest and old.get('backups'):
            row['backups'] = old['backups']
            row['backupStatus'] = old['backupStatus']
        else:
            row['backupStatus'] = 'pending-persistent-save'
        print(json.dumps({'id': row['id'], 'status': row['status'], 'files': len(tracked), 'archiveMiB': round(row['archiveBytes']/1048576, 1), 'nestedDependencies': len(submodules)}), flush=True)
        return row
    except Exception as error:
        row = {'id': project['id'], 'repository': project['repository'], 'commit': project['commit'], 'status': 'failed', 'error': str(error)}
        print(json.dumps(row), flush=True)
        return row

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    futures = [pool.submit(copy, project) for project in projects]
    rows = []
    for future in concurrent.futures.as_completed(futures):
        rows.append(future.result())
        (ROOT / 'research/source-import-progress.json').write_text(json.dumps(sorted(rows, key=lambda x:x['id']), indent=2)+'\n')
manifest = {'schemaVersion': 1, 'date': '2026-11-01', 'sourceRoot': 'research/upstream-sources',
            'copies': sorted(rows, key=lambda x:x['id']),
            'unresolvedEarlierConversation': ['Unnamed Android SDR visualisation repository', 'Unnamed vehicle/industrial communication repository', 'Unnamed accessory firmware repository'],
            'scope': 'Actual pinned root-repository checkouts. Nested submodules are explicitly enumerated; upstream code is not linked into the APEX application.'}
(ROOT / 'research/source-imports.json').write_text(json.dumps(manifest, indent=2)+'\n')
if any(row['status'] != 'copied-and-verified' for row in rows):
    raise SystemExit(1)
