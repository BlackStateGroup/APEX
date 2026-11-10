import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from setup_workspace import ensure_source, manifest_rows


def git(root, *args):
    return subprocess.check_output(['git', '-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=APEX test', '-c', 'user.email=fixture@example.invalid',
        *args], cwd=root, stderr=subprocess.PIPE, text=True).strip()


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'workspace'; self.root.mkdir()
        self.source = Path(self.temp.name) / 'owned-source'; self.source.mkdir()
        git(self.source, 'init', '--quiet')
        (self.source / 'source.txt').write_text('fixed fixture\n')
        git(self.source, 'add', 'source.txt'); git(self.source, 'commit', '-qm', 'fixture')
        self.pin = git(self.source, 'rev-parse', 'HEAD')
        self.row = {'id': 'R01', 'repository': 'owner/fixture', 'commit': self.pin,
                    'path': 'research/upstream-sources/R01-owner--fixture'}
        self.destination = self.root / self.row['path']

    def copy(self, staged, row, log):
        subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', 'clone', '--no-local',
            '--quiet', str(self.source), str(staged)], check=True, capture_output=True)

    def test_fresh_pin_is_staged_verified_and_retained_on_repeat(self):
        first = ensure_source(self.root, self.row, fetcher=self.copy)
        self.assertEqual(first['method'], 'fetched-exact-pin')
        self.assertEqual(first['trackedEntries'], 1)
        def unexpected(*_): self.fail('A verified existing source must not be fetched again')
        second = ensure_source(self.root, self.row, fetcher=unexpected)
        self.assertEqual(second['method'], 'existing-verified')
        self.assertEqual((self.destination / 'source.txt').read_text(), 'fixed fixture\n')

    def test_modified_or_untracked_existing_source_is_never_replaced(self):
        ensure_source(self.root, self.row, fetcher=self.copy)
        (self.destination / 'source.txt').write_text('local work')
        with self.assertRaisesRegex(ValueError, 'modified or untracked'):
            ensure_source(self.root, self.row, fetcher=self.copy)
        self.assertEqual((self.destination / 'source.txt').read_text(), 'local work')
        (self.destination / 'source.txt').write_text('fixed fixture\n')
        (self.destination / 'notes.txt').write_text('keep me')
        with self.assertRaisesRegex(ValueError, 'modified or untracked'):
            ensure_source(self.root, self.row, fetcher=self.copy)
        self.assertEqual((self.destination / 'notes.txt').read_text(), 'keep me')

    def test_wrong_fetch_pin_never_becomes_a_source(self):
        bad = {**self.row, 'commit': '0' * 40}
        with self.assertRaisesRegex(ValueError, 'pinned commit'):
            ensure_source(self.root, bad, fetcher=self.copy)
        self.assertFalse(self.destination.exists())

    def test_destination_populated_during_fetch_is_preserved(self):
        self.destination.mkdir(parents=True)
        def race(staged, row, log):
            self.copy(staged, row, log)
            (self.destination / 'notes.txt').write_text('concurrent work')
        with self.assertRaises(OSError):
            ensure_source(self.root, self.row, fetcher=race)
        self.assertEqual((self.destination / 'notes.txt').read_text(), 'concurrent work')

    def test_check_mode_does_not_fetch_or_create_missing_sources(self):
        with self.assertRaisesRegex(ValueError, 'not materialised'):
            ensure_source(self.root, self.row, check_only=True, fetcher=self.copy)
        self.assertFalse(self.destination.exists())

    def test_symlink_destination_and_invalid_manifests_are_rejected(self):
        (self.root / 'research').symlink_to(self.source, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            ensure_source(self.root, self.row, fetcher=self.copy)
        (self.root / 'research').unlink(); (self.root / 'research').mkdir()
        manifest = self.root / 'research/source-imports.json'
        for rows in [[self.row, self.row], [{**self.row, 'path': '../outside'}],
                     [{**self.row, 'repository': 'https://other/fixture'}]]:
            manifest.write_text(json.dumps({'copies': rows}))
            with self.assertRaises(ValueError): manifest_rows(self.root)
        manifest.write_text(json.dumps({'copies': [self.row]}))
        self.assertEqual(manifest_rows(self.root), [self.row])


if __name__ == '__main__':
    unittest.main()
