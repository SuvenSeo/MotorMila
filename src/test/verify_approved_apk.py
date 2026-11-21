"""Read-only artifact check; run alongside the mobileApp Vitest suite.

python src/test/verify_approved_apk.py <downloaded-apk> <Android-SDK/build-tools/version>
Uses Java from JAVA_HOME or PATH. Does not install, upload or approve anything.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path


def verify(apk: Path, tools: Path) -> None:
    manifest = json.loads((Path(__file__).resolve().parents[1] / "lib/approvedAndroidStable.json").read_text())
    release = manifest["approved"] if manifest["approved"] is not None else manifest["fallback"]
    with apk.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != release["sha256"] or apk.stat().st_size != release["bytes"]:
        raise ValueError(f"APK differs from manifest: {apk.stat().st_size} bytes, SHA-256 {digest}")

    java = str(Path(os.environ["JAVA_HOME"]) / "bin/java") if os.getenv("JAVA_HOME") else "java"
    signature = subprocess.check_output([
        java, "-jar", tools / "lib/apksigner.jar", "verify", "--print-certs", apk,
    ], text=True)
    signers = re.findall(r"^Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})$", signature, re.M)
    if signers != [manifest["signing_cert_sha256"]]:
        raise ValueError("APK not signed by the pinned MotorMila release certificate")

    aapt = tools / ("aapt.exe" if os.name == "nt" else "aapt")
    info = subprocess.check_output([aapt, "dump", "badging", apk], encoding="utf-8")
    identity = re.search(r"^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", info, re.M)
    if not identity or identity.groups() != ("lk.motormila.app", str(release["version_code"]), release["version"]):
        raise ValueError("Wrong package, versionCode or versionName")
    if "application-debuggable" in info or "sdkVersion:'26'" not in info.splitlines():
        raise ValueError("Debuggable build or minimum Android version differs from website")
    print(f"Verified {release['version']} ({release['version_code']}), {release['bytes']} bytes, SHA-256 {digest}, release signer {signers[0]}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("build_tools", type=Path)
    args = parser.parse_args()
    try:
        verify(args.apk.resolve(), args.build_tools.resolve())
    except (KeyError, OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Verification failed: {error}\n")
