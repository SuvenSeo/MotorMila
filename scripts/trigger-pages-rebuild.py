#!/usr/bin/env python3
"""Trigger a Cloudflare Pages rebuild of motormila.pages.dev.

Retries the latest production ``github:push`` deployment of the Pages
project ``motormila`` via the Cloudflare API, polls until the retried build
succeeds, then verifies the live snapshot files the build was supposed to
pull from R2 (``scripts/sync-snapshots-from-r2.mjs`` runs first in the build).

Why a retry instead of a direct upload: ad-hoc ``wrangler pages deploy``
uploads are forbidden for this project — only ``github:push`` builds may
reach production. A retry re-runs the last pushed commit's build, and the
build pulls the fresh R2 snapshots, so no new commit is needed after an
R2 snapshot refresh.

Env:
  CLOUDFLARE_API_TOKEN     token with Pages:Edit on the account
  CLOUDFLARE_ACCOUNT_ID    Cloudflare account id
  PAGES_PROJECT            Pages project name (default: motormila)
  SITE_URL                 live site origin (default: https://motormila.pages.dev)
  REBUILD_TIMEOUT_SECONDS  poll budget (default: 900)

Exit code 0 only when the retried deployment reaches success AND both
live snapshot files return HTTP 200.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

API_BASE = "https://api.cloudflare.com/client/v4"
PROJECT = os.environ.get("PAGES_PROJECT", "motormila")
SITE_URL = os.environ.get("SITE_URL", "https://motormila.pages.dev").rstrip("/")
TIMEOUT_SECONDS = int(os.environ.get("REBUILD_TIMEOUT_SECONDS", "900"))
POLL_INTERVAL_SECONDS = 20


def api(method: str, path: str, body: dict | None = None) -> dict:
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    if not token or not account:
        raise SystemExit("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must both be set")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API_BASE}/accounts/{account}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise SystemExit(f"Cloudflare API {method} {path} failed: HTTP {exc.code}: {detail}")
    if not payload.get("success"):
        raise SystemExit(f"Cloudflare API {method} {path} failed: {payload.get('errors')}")
    return payload["result"]


def latest_production_push_deployment() -> dict:
    deployments = api("GET", f"/pages/projects/{PROJECT}/deployments?per_page=25")
    production = [d for d in deployments if d.get("environment") == "production"]
    if not production:
        raise SystemExit("no production deployments found for project " + PROJECT)
    push = [d for d in production if (d.get("deployment_trigger") or {}).get("type") == "github:push"]
    chosen = push[0] if push else production[0]
    trigger = (chosen.get("deployment_trigger") or {}).get("type", "unknown")
    print(f"latest production deployment: {chosen['id']} "
          f"(trigger={trigger}, commit={chosen.get('deployment_trigger', {}).get('metadata', {}).get('commit_hash', '?')[:8]})")
    if not push:
        print("WARNING: no github:push production deployment found; retrying latest production deployment instead")
    return chosen


def wait_for_success(deployment_id: str) -> dict:
    deadline = time.time() + TIMEOUT_SECONDS
    while True:
        deployment = api("GET", f"/pages/projects/{PROJECT}/deployments/{deployment_id}")
        stage = deployment.get("latest_stage") or {}
        status = stage.get("status")
        print(f"deployment {deployment_id}: stage={stage.get('name')} status={status}")
        if status == "success":
            return deployment
        if status in ("failure", "cancelled"):
            raise SystemExit(f"deployment {deployment_id} ended with status={status}")
        if time.time() > deadline:
            raise SystemExit(f"deployment {deployment_id} did not succeed within {TIMEOUT_SECONDS}s")
        time.sleep(POLL_INTERVAL_SECONDS)


def check_live(path: str) -> None:
    url = f"{SITE_URL}{path}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            resp.read(1024)
            status = resp.status
    except urllib.error.HTTPError as exc:
        status = exc.code
    print(f"live check {url}: HTTP {status}")
    if status != 200:
        raise SystemExit(f"live check failed: {url} returned HTTP {status}")


def main() -> int:
    source = latest_production_push_deployment()
    result = api("POST", f"/pages/projects/{PROJECT}/deployments/{source['id']}/retry")
    new_id = result["id"]
    print(f"retry started: new deployment {new_id} (source {source['id']})")
    deployment = wait_for_success(new_id)
    print(f"deployment {new_id} succeeded "
          f"(commit={deployment.get('deployment_trigger', {}).get('metadata', {}).get('commit_hash', '?')[:8]})")
    check_live("/snapshots/latest/manifest.json")
    check_live("/snapshots/latest/stats-summary.json")
    print(f"OK: {SITE_URL} rebuilt from R2 snapshots (deployment {new_id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
