"""Network-free regression tests for source provenance and archive recovery."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1] / 'tools'
sys.path.insert(0, str(TOOLS))
from source_archive_utils import create_archive, verify_checkout


class SourceArchivesTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='apex-source-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.environment = dict(os.environ, GIT_CONFIG_GLOBAL='/dev/null',
                                GIT_CONFIG_NOSYSTEM='1')
        self.project = self.root / 'apex'
        (self.project / 'tools').mkdir(parents=True)
        (self.project / 'research').mkdir()
        for filename in ['restore_source_archives.py', 'copy_upstreams.py', 'source_archive_utils.py']:
            shutil.copy(TOOLS / filename, self.project / 'tools' / filename)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.git(self.source, 'init', '--quiet')
        (self.source / 'README.md').write_text('Original source\n')
        (self.source / 'LICENSE').write_text('Fixture licence\n')
        self.git(self.source, 'add', '.')
        self.git(self.source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                 'commit', '--quiet', '-m', 'Fixture source')
        self.commit = self.git(self.source, 'rev-parse', 'HEAD')
        self.name = 'R01-test--source'
        self.archives = self.root / 'backups'
        self.archives.mkdir()
        self.archive = self.archives / 'source.tar.gz'
        with tarfile.open(self.archive, 'w:gz') as output:
            output.add(self.source, arcname=self.name)
        self.destination_root = self.root / 'destination'
        self.destination = self.destination_root / 'research/upstream-sources' / self.name
        self.write_manifest()

    def git(self, folder, *arguments):
        return subprocess.check_output(['git', *arguments], cwd=folder,
            env=self.environment, text=True, stderr=subprocess.PIPE).strip()

    def digest(self, path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def write_manifest(self, **updates):
        self.row = {'id': 'R01', 'repository': 'test/source', 'commit': self.commit,
            'path': 'research/upstream-sources/' + self.name,
            'archiveSha256': self.digest(self.archive),
            'backups': [{'filename': self.archive.name, 'sha256': self.digest(self.archive)}],
            **updates}
        (self.project / 'research/source-imports.json').write_text(json.dumps({'copies': [self.row]}))

    def restore(self):
        return subprocess.run([sys.executable, str(self.project / 'tools/restore_source_archives.py'),
            '--archive-dir', str(self.archives), '--destination-root', str(self.destination_root)],
            env=self.environment, text=True, capture_output=True, timeout=60)

    def assert_failed(self, result, reason):
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(reason, result.stderr)

    def test_restore_into_fresh_parent_repository_placeholder(self):
        self.destination.mkdir(parents=True)
        self.git(self.destination_root, 'init', '--quiet')
        (self.destination_root / 'parent.txt').write_text('Parent project')
        self.git(self.destination_root, 'add', 'parent.txt')
        self.git(self.destination_root, '-c', 'user.name=Fixture',
                 '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Parent')
        result = self.restore()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git(self.destination, 'rev-parse', 'HEAD'), self.commit)
        self.assertEqual((self.destination / 'LICENSE').read_text(), 'Fixture licence\n')

    def test_existing_clean_copy_is_retained(self):
        self.assertEqual(self.restore().returncode, 0)
        self.archive.unlink()
        result = self.restore()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('existing pinned copy retained', result.stdout)

    def test_dirty_existing_copy_is_rejected_without_overwrite(self):
        self.assertEqual(self.restore().returncode, 0)
        original = self.destination / 'README.md'
        original.write_text('Local edit\n')
        self.assert_failed(self.restore(), 'modified or untracked')
        self.assertEqual(original.read_text(), 'Local edit\n')

    def test_untracked_existing_file_is_not_hidden(self):
        self.assertEqual(self.restore().returncode, 0)
        (self.destination / 'local-notes.txt').write_text('Retain me')
        self.assert_failed(self.restore(), 'modified or untracked')

    def test_non_git_directory_cannot_inherit_parent_head(self):
        self.destination.mkdir(parents=True)
        self.git(self.destination_root, 'init', '--quiet')
        (self.destination / 'keep.txt').write_text('Keep')
        self.assert_failed(self.restore(), 'Expected a Git checkout')
        self.assertEqual((self.destination / 'keep.txt').read_text(), 'Keep')

    def test_symlink_destination_rejected(self):
        self.destination.parent.mkdir(parents=True)
        self.destination.symlink_to(self.source, target_is_directory=True)
        self.assert_failed(self.restore(), 'contains a symlink')

    def test_symlink_parent_rejected(self):
        self.destination_root.mkdir()
        (self.destination_root / 'research').symlink_to(self.root, target_is_directory=True)
        self.assert_failed(self.restore(), 'contains a symlink')

    def test_bad_part_hash_preserves_empty_placeholder(self):
        self.destination.mkdir(parents=True)
        self.write_manifest(backups=[{'filename': self.archive.name, 'sha256': '0' * 64}])
        self.assert_failed(self.restore(), 'Backup checksum mismatch')
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_bad_combined_hash_rejected(self):
        self.write_manifest(archiveSha256='0' * 64)
        self.assert_failed(self.restore(), 'Combined archive checksum mismatch')
        self.assertFalse(self.destination.exists())

    def test_split_archive_reassembled_in_manifest_order(self):
        payload = self.archive.read_bytes()
        parts = []
        for index, content in enumerate([payload[:len(payload)//2], payload[len(payload)//2:]]):
            path = self.archives / f'part-{index}'
            path.write_bytes(content)
            parts.append({'filename': path.name, 'sha256': self.digest(path)})
        self.write_manifest(backups=parts)
        result = self.restore()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_wrong_commit_archive_rejected(self):
        self.write_manifest(commit='0' * 40)
        self.assert_failed(self.restore(), 'pinned commit')
        self.assertFalse(self.destination.exists())

    def test_archive_path_traversal_rejected(self):
        with tarfile.open(self.archive, 'w:gz') as output:
            member = tarfile.TarInfo(self.name + '/../escaped.txt')
            member.size = 4
            output.addfile(member, io.BytesIO(b'nope'))
        self.write_manifest()
        self.assert_failed(self.restore(), 'unsafe archive root')
        self.assertFalse((self.destination.parent / 'escaped.txt').exists())

    def test_gitfile_archive_cannot_claim_independent_restoration(self):
        # Simulate Git's absorbed submodule layout: objects live outside source.
        external_git = self.root / 'external.git'
        (self.source / '.git').rename(external_git)
        (self.source / '.git').write_text('gitdir: ' + str(external_git) + '\n')
        with tarfile.open(self.archive, 'w:gz') as output:
            output.add(self.source, arcname=self.name)
        self.write_manifest()
        self.assert_failed(self.restore(), 'external Git metadata pointer')

    def test_snapshot_converts_absorbed_gitfile_to_independent_archive(self):
        external_git = self.root / 'external.git'
        (self.source / '.git').rename(external_git)
        (self.source / '.git').write_text('gitdir: ' + str(external_git) + '\n')
        new_archive = self.archives / 'independent.tar.gz'
        create_archive(self.source, new_archive, self.name, self.commit)
        self.archive = new_archive
        self.write_manifest()
        # The old objects are unavailable at restore time; no inherited state.
        external_git.rename(self.root / 'unavailable-original.git')
        result = self.restore()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.destination / '.git').is_dir())
        verify_checkout(self.destination, self.commit, self_contained=True)

    def test_existing_archive_identity_is_preserved(self):
        before = self.archive.read_bytes()
        create_archive(self.source, self.archive, self.name, self.commit)
        self.assertEqual(self.archive.read_bytes(), before)

    def test_modified_source_is_not_archived(self):
        (self.source / 'README.md').write_text('Not pinned')
        target = self.archives / 'new.tar.gz'
        with self.assertRaisesRegex(ValueError, 'modified or untracked'):
            create_archive(self.source, target, self.name, self.commit)
        self.assertFalse(target.exists())

    def test_assume_unchanged_source_is_not_trusted(self):
        self.git(self.source, 'update-index', '--assume-unchanged', 'README.md')
        (self.source / 'README.md').write_text('Hidden modification')
        with self.assertRaisesRegex(ValueError, 'index hides changes'):
            verify_checkout(self.source, self.commit)

    def test_skip_worktree_source_is_not_trusted(self):
        self.git(self.source, 'update-index', '--skip-worktree', 'README.md')
        (self.source / 'README.md').write_text('Hidden modification')
        with self.assertRaisesRegex(ValueError, 'index hides changes'):
            verify_checkout(self.source, self.commit)

    def test_archive_with_hidden_index_modification_is_rejected(self):
        self.git(self.source, 'update-index', '--assume-unchanged', 'README.md')
        (self.source / 'README.md').write_text('NOT THE PINNED SOURCE')
        with tarfile.open(self.archive, 'w:gz') as output:
            output.add(self.source, arcname=self.name)
        self.write_manifest()
        self.assert_failed(self.restore(), 'index hides changes')
        self.assertFalse(self.destination.exists())

    def test_importer_does_not_switch_existing_pin_or_overwrite_ignored_data(self):
        (self.source / '.gitignore').write_text('private.txt\n')
        self.git(self.source, 'add', '.gitignore')
        self.git(self.source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                 'commit', '--quiet', '-m', 'Old pin ignores private data')
        old_commit = self.git(self.source, 'rev-parse', 'HEAD')
        target = self.project / 'research/upstream-sources' / self.name
        target.parent.mkdir(parents=True)
        self.git(self.root, 'clone', '--quiet', str(self.source), str(target))
        (target / 'private.txt').write_text('LOCAL DATA TO PRESERVE')
        (self.source / 'private.txt').write_text('New tracked upstream content')
        self.git(self.source, 'add', '--force', 'private.txt')
        self.git(self.source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                 'commit', '--quiet', '-m', 'New pin tracks filename')
        new_commit = self.git(self.source, 'rev-parse', 'HEAD')
        project = {'id': 'R01', 'repository': 'test/source', 'commit': new_commit}
        (self.project / 'research/upstreams.json').write_text(json.dumps({'projects': [project]}))
        (self.project / 'research/source-additions.json').write_text('[]')
        result = subprocess.run([sys.executable, str(self.project / 'tools/copy_upstreams.py')],
            env=self.environment, text=True, capture_output=True, timeout=60)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('refusing to switch pins', result.stdout)
        self.assertEqual((target / 'private.txt').read_text(), 'LOCAL DATA TO PRESERVE')
        self.assertEqual(self.git(target, 'rev-parse', 'HEAD'), old_commit)

    def test_importer_accepts_empty_submodule_placeholder_offline(self):
        # Git URL rewrite points the exact expected upstream at a local fixture.
        # No network or upstream source execution is used by this test.
        local_bare = self.root / 'source.git'
        self.git(self.root, 'clone', '--bare', '--quiet', str(self.source), str(local_bare))
        project = {'id': 'R01', 'repository': 'test/source', 'commit': self.commit}
        (self.project / 'research/upstreams.json').write_text(json.dumps({'projects': [project]}))
        (self.project / 'research/source-additions.json').write_text('[]')
        target = self.project / 'research/upstream-sources' / self.name
        target.mkdir(parents=True)
        env = dict(self.environment, GIT_CONFIG_COUNT='2',
            GIT_CONFIG_KEY_0='url.' + local_bare.as_uri() + '.insteadOf',
            GIT_CONFIG_VALUE_0='https://github.com/test/source.git',
            GIT_CONFIG_KEY_1='protocol.file.allow', GIT_CONFIG_VALUE_1='always')
        result = subprocess.run([sys.executable, str(self.project / 'tools/copy_upstreams.py')],
            env=env, text=True, capture_output=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        manifest = json.loads((self.project / 'research/source-imports.json').read_text())
        self.assertEqual(manifest['copies'][0]['status'], 'copied-and-verified')
        self.assertEqual(manifest['copies'][0]['commit'], self.commit)

    def test_importer_preserves_ignored_files_in_unborn_checkout(self):
        target = self.project / 'research/upstream-sources' / self.name
        target.mkdir(parents=True)
        self.git(target, 'init', '--quiet')
        self.git(target, 'remote', 'add', 'origin', str(self.source))
        (target / '.git/info/exclude').write_text('README.md\n')
        (target / 'README.md').write_text('LOCAL DATA TO PRESERVE')
        project = {'id': 'R01', 'repository': 'test/source', 'commit': self.commit}
        (self.project / 'research/upstreams.json').write_text(json.dumps({'projects': [project]}))
        (self.project / 'research/source-additions.json').write_text('[]')
        result = subprocess.run([sys.executable, str(self.project / 'tools/copy_upstreams.py')],
            env=self.environment, text=True, capture_output=True, timeout=60)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Unborn checkout contains local files', result.stdout)
        self.assertEqual((target / 'README.md').read_text(), 'LOCAL DATA TO PRESERVE')


if __name__ == '__main__':
    unittest.main()
