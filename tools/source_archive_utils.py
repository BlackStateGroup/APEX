"""Pinned source checks and self-contained archives; never execute source code."""
from pathlib import Path
import os
import subprocess
import tarfile
import tempfile


def git(folder, *arguments):
    """Keep repository-supplied fsmonitor/hooks out of read-only verification."""
    return subprocess.check_output(
        ['git', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
         *arguments], cwd=folder, text=True, stderr=subprocess.PIPE,
        timeout=900).strip()


def verify_checkout(folder, commit, *, self_contained=False):
    folder = Path(folder)
    marker = folder / '.git'
    if folder.is_symlink() or marker.is_symlink() or not marker.exists():
        raise ValueError('Expected a Git checkout, not a placeholder or symlink')
    if Path(git(folder, 'rev-parse', '--show-toplevel')).resolve() != folder.resolve():
        raise ValueError('Git checkout root does not match the source directory')
    if git(folder, 'rev-parse', 'HEAD') != commit:
        raise ValueError('Checkout does not match the pinned commit')
    # Git status can trust index shortcuts even when the worktree bytes changed.
    # Refuse those states instead of mutating the caller's index during checking.
    index_entries = git(folder, 'ls-files', '-v', '-z').split('\0')
    if any(entry and (entry[0].islower() or entry[0] == 'S') for entry in index_entries):
        raise ValueError('Checkout index hides changes with assume-unchanged or skip-worktree')
    if git(folder, 'status', '--porcelain=v1', '--untracked-files=all',
           '--ignore-submodules=none'):
        raise ValueError('Checkout contains modified or untracked files; refusing to replace it')
    if self_contained:
        if not marker.is_dir():
            raise ValueError('Archive has an external Git metadata pointer')
        if (marker / 'commondir').exists() or (marker / 'objects/info/alternates').exists():
            raise ValueError('Archive depends on an external Git object database')
        git(folder, 'fsck', '--connectivity-only', '--no-reflogs')


def extract_verified_archive(archive_path, temporary_root, name, commit):
    """Extract under a fresh temporary directory, then verify independent Git data."""
    temporary_root = Path(temporary_root)
    with tarfile.open(archive_path, 'r:gz') as archive:
        members = archive.getmembers()
        if not members or any(
            not Path(member.name).parts or Path(member.name).parts[0] != name
            or Path(member.name).is_absolute() or '..' in Path(member.name).parts
            for member in members
        ):
            raise ValueError('Unexpected or unsafe archive root')
        archive.extractall(temporary_root, filter='data')
    restored = temporary_root / name
    verify_checkout(restored, commit, self_contained=True)
    return restored


def verify_archive(archive_path, name, commit):
    with tempfile.TemporaryDirectory(prefix='apex-archive-check-') as temporary:
        extract_verified_archive(archive_path, temporary, name, commit)


def create_archive(folder, archive_path, name, commit):
    """Snapshot a pin into independent Git storage before archiving.

    Fetching from the local checkout copies the objects even when the source is
    an absorbed submodule, linked worktree, or uses an alternate object store.
    Only the root's pinned tracked files are checked out; nested gitlinks remain
    uninitialised and no original checkout or existing archive is overwritten.
    """
    folder, archive_path = Path(folder), Path(archive_path)
    verify_checkout(folder, commit)
    if archive_path.exists():
        verify_archive(archive_path, name, commit)
        return
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='apex-archive-', dir=archive_path.parent) as temporary:
        temporary = Path(temporary)
        standalone = temporary / name
        standalone.mkdir()
        git(standalone, 'init', '--quiet')
        git(standalone, '-c', 'protocol.file.allow=always', 'fetch', '--quiet',
            '--no-tags', '--depth=1', str(folder.resolve()), commit)
        git(standalone, 'checkout', '--quiet', '--detach', commit)
        verify_checkout(standalone, commit, self_contained=True)
        staged_archive = temporary / 'source.tar.gz'
        with tarfile.open(staged_archive, 'w:gz', compresslevel=1) as output:
            output.add(standalone, arcname=name)
        verify_archive(staged_archive, name, commit)
        # Same-filesystem link publishes the complete file atomically and fails
        # if another writer already installed an archive. Never replace a backup.
        os.link(staged_archive, archive_path)
