"""Publish one stable, versioned direct APK without replacing existing bytes."""
import hashlib
import json
import os
import re
import subprocess
import sys
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

MANIFESTS = ('android/latest-release.json', 'public/app/latest-release.json')
PUBLIC_APP = 'https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/app'


def sha256(stream):
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(chunk)
    return digest.hexdigest()


class R2:
    name = 'R2'

    def __init__(self, apk):
        account = os.getenv('R2_ACCOUNT_ID', '')
        key, secret = os.getenv('R2_ACCESS_KEY_ID'), os.getenv('R2_SECRET_ACCESS_KEY')
        if not (re.fullmatch('[0-9a-fA-F]{32}', account) and key and secret):
            raise ValueError('Stable publication requires R2 S3 account/key/secret for conditional PutObject; no token fallback')
        self.s3 = boto3.client('s3', region_name='auto', aws_access_key_id=key,
                               aws_secret_access_key=secret, endpoint_url=f'https://{account}.r2.cloudflarestorage.com',
                               config=Config(request_checksum_calculation='when_required'))
        self.target = {'Bucket': 'motormila-snapshots', 'Key': f'app/{apk.name}'}
        self.apk = apk

    def digest(self):
        try:
            obj = self.s3.get_object(**self.target)
        except ClientError as exc:
            if exc.response['Error']['Code'] == 'NoSuchKey' and exc.response['ResponseMetadata']['HTTPStatusCode'] == 404:
                return None
            raise
        with closing(obj['Body']) as stream:
            return sha256(stream)

    def create(self):
        # Only this single-part S3 operation: R2 evaluates If-None-Match at commit.
        # https://developers.cloudflare.com/r2/reference/consistency/#conditional-writes
        with self.apk.open('rb') as stream:
            try:
                self.s3.put_object(**self.target, Body=stream, IfNoneMatch='*',
                                   ContentType='application/vnd.android.package-archive')
            except ClientError as exc:
                if exc.response['ResponseMetadata']['HTTPStatusCode'] not in (409, 412):
                    raise
                # Concurrent writer: publish() must verify the winner, not retry a plain PUT.


class GitHub:
    name = 'GitHub'

    def __init__(self, tag, apk):
        self.tag, self.apk = tag, apk
        self.repo = os.environ['GITHUB_REPOSITORY']

    def pages(self, path):
        out = subprocess.check_output(['gh', 'api', '--paginate', '--slurp', f'repos/{self.repo}/{path}?per_page=100'])
        pages = json.loads(out)
        if not isinstance(pages, list) or not pages or not all(isinstance(page, list) for page in pages):
            raise ValueError(f'Unrecognized GitHub listing for {path}')
        return (item for page in pages for item in page)

    def digest(self):
        # Authenticated listing includes drafts; errors (including 403/404) are NOT absence.
        releases = [r for r in self.pages('releases') if r['tag_name'] == self.tag]
        self.has_release = bool(releases)
        if not releases:
            return None
        release, = releases   # ambiguous tag is not safe to publish
        if release['draft'] or release['prerelease']:
            raise ValueError(f'{self.tag}: refusing to promote a draft/prerelease')
        assets = [a for a in self.pages(f"releases/{release['id']}/assets") if a['name'] == self.apk.name]
        if not assets:
            if release.get('immutable'):
                raise ValueError(f'{self.tag}: cannot add missing APK to an immutable release')
            return None
        asset, = assets
        if asset['state'] != 'uploaded':
            raise ValueError(f'{self.apk.name}: existing GitHub asset is not uploaded')
        digest = asset.get('digest')
        if digest is None:  # older assets may predate server-computed digest metadata
            data = subprocess.check_output(['gh', 'api', '-H', 'Accept: application/octet-stream',
                                            f"repos/{self.repo}/releases/assets/{asset['id']}"])
            return hashlib.sha256(data).hexdigest()
        if not re.fullmatch('sha256:[0-9a-f]{64}', digest):
            raise ValueError(f'{self.apk.name}: unrecognized GitHub asset digest')
        return digest.removeprefix('sha256:')

    def create(self):
        # GitHub rejects duplicate asset names. Never delete an asset or edit existing notes.
        if self.has_release:
            args = ['upload', self.tag, str(self.apk)]
        else:
            args = ['create', self.tag, str(self.apk), '--verify-tag', '--title',
                    f"Motormila Android {self.tag.removeprefix('android-v')}", '--notes',
                    f"Signed MotorMila direct APK (`lk.motormila.app`), built from `{os.environ['GITHUB_SHA']}`.\n\n"
                    'Download the APK, enable **Install unknown apps**, and open the file.']
        # A duplicate upload or lost response can still leave exactly the desired bytes.
        result = subprocess.run(['gh', 'release', *args, '--repo', self.repo])
        if result.returncode:
            print('GitHub create did not report success; checking for an identical published asset.', file=sys.stderr)


def check(store, expected, *, missing_ok=False):
    actual = store.digest()
    if actual == expected:
        return True
    if actual is None and missing_ok:
        return False
    raise ValueError(f'{store.name}: expected SHA-256 {expected}, found {actual or "no APK"}; refusing publication')


def publish(expected, r2, github):
    # Finish BOTH read-only checks before the first create. R2 is the first claim
    # for all writers. No cross-service transaction: an interrupted create is
    # recovered by the next run with the same bytes, not by deleting its peer.
    stores = (r2, github)
    present = [check(s, expected, missing_ok=True) for s in stores]
    for store, exists in zip(stores, present):
        if not exists:
            store.create()
            check(store, expected)  # required even on 412 / duplicate / ambiguous response
    for store in stores:
        check(store, expected)  # gate the updater on both final identities


def manifest_for(version, code, digest, previous):
    tag = f'android-v{version}'
    url = f'{PUBLIC_APP}/motormila-{version}.apk'
    identity = dict(version=version, version_code=code, apk_url=url, sha256=digest, tag=tag)
    timestamp = None
    for old in previous:
        if old['version'] == version or old['tag'] == tag or old['apk_url'] == url:
            if not all(old[k] == v for k, v in identity.items()):
                raise ValueError(f'{tag}: prior manifest disagrees with candidate (prior SHA-256 {old["sha256"]}, candidate {digest})')
            timestamp = old['published_at']
        elif old['version_code'] >= code:
            raise ValueError(f'{tag}: would reuse or roll back the current stable version code')
    return {**identity, 'published_at': timestamp or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}


def main(apk, version_code, output):
    tag = os.environ['GITHUB_REF_NAME']
    if (os.environ['GITHUB_EVENT_NAME'] != 'push' or os.environ['GITHUB_REF'] != f'refs/tags/{tag}'
            or not re.fullmatch(r'android-v[0-9]+\.[0-9]+\.[0-9]+', tag)):
        raise ValueError('Stable publication requires a numeric tag push')
    version = tag.removeprefix('android-v')
    if apk.name != f'motormila-{version}.apk':
        raise ValueError('Staged APK name does not match the release tag')
    with apk.open('rb') as stream:
        digest = sha256(stream)
    previous = [json.loads(subprocess.check_output(['git', 'show', f'FETCH_HEAD:{p}'])) for p in MANIFESTS]
    manifest = manifest_for(version, version_code, digest, previous)
    publish(digest, R2(apk), GitHub(tag, apk))
    print(f'Verified {apk.name} on R2 and GitHub: {digest}')
    if all(old == manifest for old in previous):
        print('Both updater manifests already match; no update needed.')
    else:
        output.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main(Path(sys.argv[1]), int(sys.argv[2]), Path(sys.argv[3]))
