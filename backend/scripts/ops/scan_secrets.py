"""Read-only secret scanner for git history.

Reports WHERE a secret-looking string appears (file path + commit) and WHICH
pattern matched. It never prints, logs, or partially reveals a matched value —
only a length and a SHA-256 prefix, which is enough to correlate two findings
without disclosing either.

Usage:
    python scripts/ops/scan_secrets.py            # scan all reachable history
    python scripts/ops/scan_secrets.py --commits 200
"""

from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
from collections import defaultdict

# (label, regex). Kept deliberately broad; false positives are expected and
# cheap, and a miss is what actually hurts before a repo goes public.
PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("aws_access_key_id", re.compile(r"\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b")),
    ("github_token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b")),
    ("github_pat", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{50,}\b")),
    ("slack_webhook", re.compile(r"https://hooks\.slack\.com/services/T[A-Za-z0-9/]{20,}")),
    ("postgres_url_creds", re.compile(r"postgres(?:ql)?://[^\s:/@]+:[^\s:/@]+@")),
    ("mysql_url_creds", re.compile(r"mysql://[^\s:/@]+:[^\s:/@]+@")),
    ("mongodb_url_creds", re.compile(r"mongodb(?:\+srv)?://[^\s:/@]+:[^\s:/@]+@")),
    ("supabase_url_creds", re.compile(r"supabase\.co|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.")),
    ("private_key_block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----")),
    ("stripe_secret", re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b")),
    ("resend_key", re.compile(r"\bre_[A-Za-z0-9_-]{30,}\b")),
    ("vercel_token", re.compile(r"\b[A-Za-z0-9]{24,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b")),
    ("hf_token", re.compile(r"\bhf_[A-Za-z0-9]{30,}\b")),
    ("openai_key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b")),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("generic_secret_assign", re.compile(
        r"(?i)\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret|"
        r"auth[_-]?token|password|passwd|private[_-]?key)\b\s*[:=]\s*[\"'][^\"'\n]{12,}[\"']"
    )),
    ("bearer_literal", re.compile(r"(?i)\bauthorization\s*[:=]\s*[\"']?(?:bearer|basic)\s+[A-Za-z0-9+/=._-]{20,}")),
    ("jwt_literal", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("sentry_dsn_creds", re.compile(r"https://[0-9a-f]{16,}@[A-Za-z0-9.-]+/[0-9]+\b")),
]

# Paths where a credential-shaped string is expected and not a leak.
BENIGN_PATH_HINTS = (
    "node_modules/",
    "package-lock.json",
    "pnpm-lock.yaml",
    "android/app/build/",
    ".venv/",
    "public/fonts/",
)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=False
    ).stdout


def fingerprint(value: str) -> str:
    """Non-reversible tag so repeat findings correlate without disclosure."""
    return hashlib.sha256(value.encode("utf-8", "replace")).hexdigest()[:10]


def is_benign(path: str) -> bool:
    return any(hint in path for hint in BENIGN_PATH_HINTS)


def scan_tree(ref: str) -> dict[tuple[str, str], list[str]]:
    """(label, path) -> fingerprints, for every tracked file at `ref`."""
    findings: dict[tuple[str, str], list[str]] = defaultdict(list)
    files = git("ls-tree", "-r", "--name-only", ref).splitlines()
    for path in files:
        if is_benign(path):
            continue
        blob = git("show", f"{ref}:{path}")
        if not blob:
            continue
        for label, pattern in PATTERNS:
            for match in pattern.findall(blob):
                findings[(label, path)].append(fingerprint(match))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commits", type=int, default=0, help="limit commits scanned (0 = all)")
    args = parser.parse_args()

    revs = git("rev-list", "--all").splitlines()
    if args.commits:
        revs = revs[: args.commits]

    print(f"Scanning {len(revs)} commits x {len(PATTERNS)} patterns (values never printed)\n")

    per_commit: dict[str, dict[tuple[str, str], list[str]]] = {}
    for rev in revs:
        hits = scan_tree(rev)
        if hits:
            subject = git("log", "-1", "--format=%ad %s", "--date=short", rev).strip()
            per_commit[rev] = hits
            for (label, path), prints in sorted(hits.items()):
                uniq = sorted(set(prints))
                print(f"  {rev[:8]}  {label:22s} {path}")
                print(f"            sha256:{','.join(uniq[:3])}{' …' if len(uniq) > 3 else ''} "
                      f"({len(uniq)} distinct)  |  {subject[:52]}")
    print(f"\nCommits with findings: {len(per_commit)} / {len(revs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
