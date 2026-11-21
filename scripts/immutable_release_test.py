"""Offline checks: python -B scripts/immutable_release_test.py (PyYAML and boto3)."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError
import yaml

import immutable_release as release

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/android-release.yml'


class WorkflowTest(unittest.TestCase):
    def test_no_overwrite_paths(self):
        workflow = WORKFLOW.read_text()
        for unsafe in ('--clobber', 'upload_snapshots_r2.py', 'gh release edit'):
            with self.subTest(unsafe=unsafe):
                self.assertNotIn(unsafe, workflow, f'stable workflow still uses {unsafe}')

    def test_channel_guard(self):
        steps = yaml.safe_load(WORKFLOW.read_text())['jobs']['publish-apk']['steps']
        channel = next(s['run'] for s in steps if s.get('id') == 'channel')
        artifact = next(i for i, s in enumerate(steps) if s.get('uses', '').startswith('actions/upload-artifact@'))
        self.assertNotIn('if', steps[artifact])
        self.assertTrue(steps[artifact + 1:])
        for step in steps[artifact + 1:]:
            self.assertEqual(step['if'], "steps.channel.outputs.stable == 'true'")
            self.assertFalse(step.get('continue-on-error'))
        with tempfile.TemporaryDirectory() as tmp:
            cwd = Path(tmp)
            (cwd / 'app').mkdir()
            for event, version, ref, stable in (
                ('workflow_dispatch', '2.0.0-rc1', 'heads/test', 'false'),
                ('workflow_dispatch', '2.0.0', 'tags/android-v2.0.0', 'false'),
                ('push', '2.0.0', 'tags/android-v2.0.0', 'true'),
                ('push', '2.0.0-rc1', 'tags/android-v2.0.0-rc1', None),
                ('push', '2.0.0', 'tags/android-v2.0.1', None),
            ):
                with self.subTest(event=event, version=version, ref=ref):
                    (cwd / 'out').write_text('')
                    (cwd / 'app/build.gradle.kts').write_text(f'versionName = "{version}"\n')
                    result = subprocess.run([os.getenv('BASH_EXE', 'bash'), '-c', channel], cwd=cwd, env={
                        **os.environ, 'GITHUB_OUTPUT': 'out', 'GITHUB_REF': f'refs/{ref}', 'GITHUB_EVENT_NAME': event,
                    })
                    self.assertEqual(result.returncode == 0, stable is not None)
                    outputs = (cwd / 'out').read_text().splitlines()
                    self.assertEqual(outputs, [f'stable={stable}', f'version={version}'] if stable else [])


# Exercise the production entry point; only SDK transport and git/gh are faked.
class PublicationTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.apk = Path(tmp.name) / 'motormila-2.0.0.apk'
        self.output = Path(tmp.name) / 'manifest.json'
        self.data = b'local signed APK fixture'
        self.apk.write_bytes(self.data)
        self.digest = hashlib.sha256(self.data).hexdigest()
        self.tag = 'android-v2.0.0'
        self.repo = 'owner/test'
        self.old = release.manifest_for('1.0.0', 1, 'a' * 64, [])
        self.previous = [self.old, self.old]
        self.r2 = self.github = None
        self.race = {}
        self.writes = []
        self.has_release = True
        self.asset_state = 'uploaded'
        self.legacy = False
        self.enterContext(patch.dict(os.environ, {
            'GITHUB_REPOSITORY': self.repo, 'GITHUB_SHA': 'fixture', 'GITHUB_REF_NAME': self.tag,
            'GITHUB_REF': f'refs/tags/{self.tag}', 'GITHUB_EVENT_NAME': 'push',
            'R2_ACCOUNT_ID': 'a' * 32, 'R2_ACCESS_KEY_ID': 'test', 'R2_SECRET_ACCESS_KEY': 'test',
        }, clear=True))
        target = {'Bucket': 'motormila-snapshots', 'Key': 'app/' + self.apk.name}

        def s3_error(code, status):
            return ClientError({'Error': {'Code': code}, 'ResponseMetadata': {'HTTPStatusCode': status}}, 'fixture')

        def get_object(**kwargs):
            self.assertEqual(kwargs, target)
            if self.r2 is None:
                raise s3_error('NoSuchKey', 404)
            return {'Body': io.BytesIO(self.r2)}

        def put_object(Body, **kwargs):
            self.assertEqual(kwargs, {**target, 'ContentType': 'application/vnd.android.package-archive', 'IfNoneMatch': '*'})
            self.writes.append('R2')
            self.r2 = self.race.get('R2', self.r2)
            if self.r2 is not None:
                raise s3_error('PreconditionFailed', 412)
            self.r2 = Body.read()

        self.s3 = Mock(get_object=Mock(side_effect=get_object), put_object=Mock(side_effect=put_object))
        self.client = self.enterContext(patch.object(release.boto3, 'client', return_value=self.s3))

        def read(args):
            for old, dest in zip(self.previous, release.MANIFESTS):
                if args == ['git', 'show', f'FETCH_HEAD:{dest}']:
                    return json.dumps(old).encode()
            prefix = ['gh', 'api', '--paginate', '--slurp']
            if args == [*prefix, f'repos/{self.repo}/releases?per_page=100']:
                items = [{'id': 3, 'tag_name': self.tag, 'draft': False, 'prerelease': False}] if self.has_release else []
            elif args == [*prefix, f'repos/{self.repo}/releases/3/assets?per_page=100']:
                items = [] if self.github is None else [{
                    'name': self.apk.name, 'id': 7, 'state': self.asset_state,
                    'digest': None if self.legacy else 'sha256:' + hashlib.sha256(self.github).hexdigest(),
                }]
            elif args == ['gh', 'api', '-H', 'Accept: application/octet-stream', f'repos/{self.repo}/releases/assets/7']:
                return self.github
            else:
                self.fail(f'unexpected read: {args}')
            return json.dumps([[], items]).encode()  # match on a later page

        def gh_write(args):
            self.assertEqual(args[:2], ['gh', 'release'])
            self.assertEqual(args[-2:], ['--repo', self.repo])
            if self.has_release:
                self.assertEqual(args[2:-2], ['upload', self.tag, str(self.apk)])
            else:
                self.assertEqual(args[2:5], ['create', self.tag, str(self.apk)])
                self.assertIn('--verify-tag', args)
                self.has_release = True
            self.writes.append('GitHub')
            self.github = self.race.get('GitHub', self.github)
            if self.github is not None:
                return subprocess.CompletedProcess(args, 1)  # duplicate rejected, not replaced
            self.github = self.apk.read_bytes()
            return subprocess.CompletedProcess(args, 0)

        self.read = self.enterContext(patch.object(subprocess, 'check_output', side_effect=read))
        self.enterContext(patch.object(subprocess, 'run', side_effect=gh_write))

    def publish(self):
        release.main(self.apk, 40, self.output)

    def test_prior_collision_on_either_store_mutates_nothing(self):
        for r2, gh in ((None, b'prior'), (b'prior', None), (self.data, b'prior'), (b'prior', self.data)):
            with self.subTest(r2=r2, gh=gh):
                self.r2, self.github = r2, gh
                with self.assertRaisesRegex(ValueError, 'expected SHA-256'):
                    self.publish()
                self.assertEqual(self.writes, [])
                self.assertFalse(self.output.exists())

    def test_missing_or_matching_combinations_and_rerun(self):
        for r2, gh, exists, writes in (
            (None, None, False, ['R2', 'GitHub']), (self.data, None, True, ['GitHub']),
            (None, self.data, True, ['R2']), (self.data, self.data, True, []),
        ):
            with self.subTest(r2=r2, gh=gh):
                self.r2, self.github, self.has_release = r2, gh, exists
                self.previous = [self.old, self.old]
                self.publish()
                self.assertEqual(self.writes, writes)
                fresh = json.loads(self.output.read_bytes())
                self.assertEqual(fresh['sha256'], self.digest)
                self.assertEqual(fresh['tag'], self.tag)
                self.previous = [fresh, fresh]
                self.output.unlink()
                self.writes.clear()
                self.publish()
                self.assertEqual(self.writes, [])
                self.assertFalse(self.output.exists())

    def test_race_requires_matching_winner(self):
        for where in ('R2', 'GitHub'):
            for winner in (self.data, b'other bytes'):
                with self.subTest(where=where, winner=winner):
                    self.r2 = self.github = None
                    self.race = {where: winner}
                    self.writes.clear()
                    if winner == self.data:
                        self.publish()
                        self.assertTrue(self.output.is_file())
                        self.output.unlink()
                    else:
                        with self.assertRaisesRegex(ValueError, 'expected SHA-256'):
                            self.publish()
                        self.assertFalse(self.output.exists())
                        self.assertEqual(self.r2 if where == 'R2' else self.github, winner)
                        if where == 'R2':
                            self.assertNotIn('GitHub', self.writes)

    def test_prior_manifest_digest_checked_before_any_create(self):
        self.previous[1] = release.manifest_for('2.0.0', 40, '0' * 64, self.previous)
        with self.assertRaisesRegex(ValueError, 'prior manifest disagrees'):
            self.publish()
        self.assertFalse(self.output.exists())
        self.assertEqual(self.writes, [])

    def test_unknown_r2_or_github_state_is_not_absence(self):
        get = self.s3.get_object.side_effect
        for code, status in [('AccessDenied', 403), ('NoSuchBucket', 404), ('InternalError', 500)]:
            self.s3.get_object.side_effect = ClientError({'Error': {'Code': code}, 'ResponseMetadata': {'HTTPStatusCode': status}}, 'GetObject')
            with self.assertRaises(ClientError):
                self.publish()
        self.s3.get_object.side_effect = get
        self.github = self.data
        self.asset_state = 'starter'
        with self.assertRaisesRegex(ValueError, 'not uploaded'):
            self.publish()
        read = self.read.side_effect

        def inaccessible(args):
            if args[0] == 'gh':
                raise subprocess.CalledProcessError(1, args)
            return read(args)

        self.read.side_effect = inaccessible
        with self.assertRaises(subprocess.CalledProcessError):
            self.publish()
        self.assertFalse(self.output.exists())
        self.assertEqual(self.writes, [])

    def test_legacy_asset_download_compares_bytes(self):
        self.legacy = True
        self.github = b'prior'
        with self.assertRaisesRegex(ValueError, 'expected SHA-256'):
            self.publish()
        self.assertEqual(self.writes, [])
        self.github = self.data
        self.publish()
        self.assertEqual(self.writes, ['R2'])

    def test_unsupported_conditional_put_never_uploads_to_github(self):
        self.s3.put_object.side_effect = ClientError({
            'Error': {'Code': 'NotImplemented'}, 'ResponseMetadata': {'HTTPStatusCode': 501},
        }, 'PutObject')
        with self.assertRaises(ClientError):
            self.publish()
        self.s3.put_object.assert_called_once()
        self.assertFalse(self.output.exists())
        self.assertEqual(self.writes, [])

    def test_missing_after_github_write_never_yields_manifest(self):
        with patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
            with self.assertRaisesRegex(ValueError, 'GitHub: expected SHA-256'):
                self.publish()
        self.assertEqual(self.r2, self.data)
        self.assertFalse(self.output.exists())
        self.writes.clear()
        self.publish()  # repair the interrupted pair with the original bytes
        self.assertEqual(self.writes, ['GitHub'])
        self.assertTrue(self.output.exists())

    def test_api_token_only_fails_closed(self):
        del os.environ['R2_SECRET_ACCESS_KEY']
        os.environ['CLOUDFLARE_API_TOKEN'] = 'test'
        with self.assertRaisesRegex(ValueError, 'no token fallback'):
            self.publish()
        self.client.assert_not_called()
        self.assertEqual(self.writes, [])
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
