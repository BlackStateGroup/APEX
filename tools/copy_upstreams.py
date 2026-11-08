#!/usr/bin/env python3
"""Copy pinned public upstreams without executing upstream code."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess

from source_archive_utils import create_archive, verify_checkout

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
        if folder.is_symlink() or (folder / '.git').is_symlink():
            raise ValueError('Existing source contains a Git or checkout symlink')
        with (ARCHIVES / (name + '.log')).open('a') as log:
            if not (folder / '.git').exists():
                if folder.is_symlink() or (folder.exists() and
                        (not folder.is_dir() or any(folder.iterdir()))):
                    raise ValueError('Existing non-Git folder: refusing to overwrite')
                folder.mkdir(exist_ok=True)
                command(['git', 'init', '--quiet'], folder, log)
                command(['git', 'remote', 'add', 'origin', 'https://github.com/' + project['repository'] + '.git'], folder, log)
            current = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=folder, capture_output=True, text=True)
            if current.returncode == 0:
                verify_checkout(folder, current.stdout.strip())
                if current.stdout.strip() != project['commit']:
                    raise ValueError('Existing checkout has a different commit; refusing to switch pins')
            elif any(entry.name != '.git' for entry in folder.iterdir()):
                raise ValueError('Unborn checkout contains local files; refusing to overwrite')
            if current.returncode != 0 or current.stdout.strip() != project['commit']:
                command(['git', '-c', 'core.hooksPath=/dev/null', 'fetch', '--depth=1', 'origin', project['commit']], folder, log)
                command(['git', '-c', 'core.hooksPath=/dev/null', 'checkout', '--no-overwrite-ignore', '--detach', project['commit']], folder, log)
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=folder, text=True).strip()
        verify_checkout(folder, project['commit'])
        tracked = subprocess.check_output(['git', 'ls-tree', '-r', 'HEAD'], cwd=folder, text=True).splitlines()
        submodules = [line.split('\t', 1)[1] for line in tracked if line.startswith('160000 ')]
        create_archive(folder, archive, name, project['commit'])
        with archive.open('rb') as source:
            digest = hashlib.file_digest(source, 'sha256').hexdigest()
        row = {'id': project['id'], 'repository': project['repository'], 'commit': head,
               'path': str(folder.relative_to(ROOT)), 'status': 'copied-and-verified',
               'trackedEntries': len(tracked), 'nestedSubmodulesNotInitialised': submodules,
               'history': 'shallow pinned checkout', 'archiveName': archive.name,
               'archiveBytes': archive.stat().st_size, 'archiveSha256': digest,
               'licences': [str(p.relative_to(folder)) for p in folder.iterdir() if any(x in p.name.lower() for x in ['licen', 'copying', 'copyright'])],
               'applicationCodeIntegrated': False}
        if project.get('runtimeDependency'):
            row['runtimeDependency'] = project['runtimeDependency']
        old = previous.get((project['repository'], head), {})
        if old.get('archiveSha256') == digest and old.get('backups'):
            row['backups'] = old['backups']
            row['backupStatus'] = old['backupStatus']
        else:
            row['backupStatus'] = 'pending-persistent-save'
        print(json.dumps({'id': row['id'], 'status': row['status'], 'files': len(tracked), 'archiveMiB': round(row['archiveBytes']/1048576, 1), 'nestedDependencies': len(submodules)}), flush=True)
        return row
    except Exception as error:
        row = {**previous.get((project['repository'], project['commit']), {}), 'id': project['id'], 'repository': project['repository'], 'commit': project['commit'], 'status': 'failed', 'error': str(error)}
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
            'scope': 'Actual pinned root-repository checkouts. nestedSubmodulesNotInitialised describes original archive snapshots; subsequent local expansion is recorded in nested-dependencies.json. Reference checkout files are not linked into APEX; explicit runtimeDependency entries describe separately pinned npm integrations.'}
(ROOT / 'research/source-imports.json').write_text(json.dumps(manifest, indent=2)+'\n')
if any(row['status'] != 'copied-and-verified' for row in rows):
    raise SystemExit(1)
