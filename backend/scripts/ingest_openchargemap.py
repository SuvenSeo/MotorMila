#!/usr/bin/env python3
"""Refresh the Sri Lanka Open Charge Map cache.

Usage (from backend/):
  ALLOW_SQLITE_FALLBACK=true OPENCHARGEMAP_API_KEY=… .venv/bin/python scripts/ingest_openchargemap.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("ALLOW_SQLITE_FALLBACK", "true")

from db.session import SessionLocal, init_db  # noqa: E402
from app.services.openchargemap import ingest_lk_stations_best_effort  # noqa: E402


def main() -> int:
    init_db()
    db = SessionLocal()
    try:
        result = ingest_lk_stations_best_effort(db)
        print(result)
        status = result.get("status")
        return 0 if status in {"success", "skipped"} else 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
