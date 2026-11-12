#!/usr/bin/env python3
"""Generate Motormila production auth bootstrap values.

Prints:
  - AUTH_TOKEN_SECRET
  - AUTH_USERS JSON for an admin (bcrypt password hash)
  - Cloudflare Pages / Hugging Face checklist

Usage:
  python scripts/bootstrap_platform_auth.py --email you@example.com --password '...' --name 'Owner'
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import bcrypt  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Owner")
    parser.add_argument("--plan", default="enterprise", choices=["free", "pro", "enterprise"])
    parser.add_argument(
        "--auth-users-only",
        action="store_true",
        help="Print only AUTH_USERS (keep the existing AUTH_TOKEN_SECRET on HF).",
    )
    args = parser.parse_args()

    email = args.email.strip().lower()
    password_hash = bcrypt.hashpw(args.password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    users = [
        {
            "email": email,
            "password_hash": password_hash,
            "name": args.name.strip() or "Owner",
            "plan": args.plan,
            "subscription_status": "active" if args.plan != "free" else "none",
            "role": "admin",
        }
    ]
    auth_users = json.dumps(users, separators=(",", ":"))

    if args.auth_users_only:
        print(f"AUTH_USERS={auth_users}")
        print()
        print("Paste into Hugging Face Space secrets (do not rotate AUTH_TOKEN_SECRET).")
        print("Then Restart / Factory rebuild the Space.")
        print(f"Sign in at https://motormila.pages.dev/sign-in as {email}")
        return 0

    secret = secrets.token_urlsafe(48)

    print("=== Hugging Face Space secrets ===")
    print(f"AUTH_TOKEN_SECRET={secret}")
    print(f"AUTH_USERS={auth_users}")
    print("APP_ACCESS_ENFORCED=true")
    print("PRO_ACCESS_ENFORCED=true")
    print("PUBLIC_APP_ORIGIN=https://motormila.pages.dev")
    print()
    print("=== Cloudflare Pages project env (Production) ===")
    print("VITE_ENABLE_BACKEND_AUTH=true")
    print("VITE_API_URL=/api/v1")
    print()
    print("Optional email invites: set RESEND_API_KEY (+ RESEND_FROM) on HF.")
    print("Optional billing upgrades: set BILLING_WEBHOOK_SECRET on HF.")
    print()
    print("After saving secrets: restart HF Space, then push to main (Pages rebuilds on push).")
    print(f"Then sign in at https://motormila.pages.dev/sign-in as {email}")
    print("Admin console: https://motormila.pages.dev/motormila/admin")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
