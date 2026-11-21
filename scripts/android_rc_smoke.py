"""Cold-launch a digest-pinned direct APK on an explicitly named disposable AVD.

Refuses physical devices and unexpected existing installs. The script never clears
app data, uninstalls a package, clicks update prompts, or touches the network.
Use --upgrade-from with the installed versionName for an in-place upgrade check.
"""
import argparse
import hashlib
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = 'lk.motormila.app'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('adb', 'server', 'serial', 'avd', 'apk', 'sha256', 'version', 'home-label', 'out'):
        p.add_argument('--' + name, required=True)
    p.add_argument('--upgrade-from')
    args = p.parse_args()
    if not re.fullmatch(r'emulator-\d+', args.serial) or not args.server.isdigit() or args.server == '5037':
        p.error('Use an isolated adb server and emulator serial.')
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    apk = Path(args.apk).resolve(strict=True)
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    if digest != args.sha256.lower():
        p.error('APK digest mismatch.')
    adb = [args.adb, '-P', args.server, '-s', args.serial]

    def call(*cmd, check=True, timeout=35):
        return subprocess.run([*adb, *cmd], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              timeout=timeout, check=check).stdout

    def text(*cmd, **kw):
        return call(*cmd, **kw).decode('utf-8', errors='replace').strip()

    def version():
        dump = text('shell', 'dumpsys', 'package', PKG)
        m = re.search(r'^\s*versionName=(\S+)', dump, re.M)
        return m.group(1) if m else None

    assert text('emu', 'avd', 'name').splitlines()[0] == args.avd, 'Wrong AVD'
    assert text('shell', 'getprop', 'ro.kernel.qemu') == '1', 'Not an emulator'
    assert text('shell', 'getprop', 'sys.boot_completed') == '1', 'Boot incomplete'
    assert version() == args.upgrade_from, 'Unexpected initial package/version; refusing install'
    install = text('install', *(['-r'] if args.upgrade_from else []), str(apk), timeout=120)
    assert 'Success' in install and version() == args.version, 'APK install/version failed'
    activity = text('shell', 'cmd', 'package', 'resolve-activity', '--brief', PKG).splitlines()[-1]
    assert activity.startswith(PKG + '/'), 'No launcher activity'
    evidence = {'apk': apk.name, 'sha256': digest, 'version': args.version, 'upgradeFrom': args.upgrade_from,
                'api': text('shell', 'getprop', 'ro.build.version.sdk'), 'avd': args.avd, 'launches': []}
    for i in range(1, 3):
        text('shell', 'am', 'force-stop', PKG)
        text('logcat', '-b', 'crash', '-c')
        text('shell', 'am', 'start', '-W', '-n', activity)
        deadline = time.monotonic() + 60
        matched = False
        while time.monotonic() < deadline:
            # A new process can die while Android still says its launch succeeded.
            time.sleep(2)
            if text('shell', 'pidof', PKG, check=False):
                raw = text('exec-out', 'uiautomator', 'dump', '/dev/tty', check=False)
                start, end = raw.find('<hierarchy'), raw.rfind('</hierarchy>')
                if start >= 0 and end > start:
                    root = ET.fromstring(raw[start:end + len('</hierarchy>')])
                    matched = any(n.get('package') == PKG and args.home_label.casefold() in
                                  (n.get('text', '') + ' ' + n.get('content-desc', '')).casefold()
                                  for n in root.iter('node'))
                    if matched:
                        break
        time.sleep(2)
        pid = text('shell', 'pidof', PKG, check=False)
        resumed = [line.strip() for line in text('shell', 'dumpsys', 'activity', 'activities').splitlines()
                   if 'resumedactivity' in line.lower() and PKG + '/' in line]
        crash = text('logcat', '-d', '-b', 'crash')
        (out / f'launch-{i}.png').write_bytes(call('exec-out', 'screencap', '-p'))
        row = {'try': i, 'home': matched, 'pid': pid, 'resumed': resumed, 'packageCrash': PKG in crash}
        evidence['launches'].append(row)
        (out / 'smoke.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
        if not (matched and pid and resumed and PKG not in crash):
            raise SystemExit(f'Launch {i} failed: {row}')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    main()
