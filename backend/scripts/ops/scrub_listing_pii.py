"""One-off: strip seller phone numbers / emails from existing scraped listing titles.

New rows are already cleaned at ingest (``CarCleaner.normalize_listing_payload``
-> ``app.utils.pii.clean_listing_title``). This script back-fills rows that
were stored before that change, and blanks any ``contact_name`` /
``contact_phone`` on *scraped* rows (first-party ``motormila_user`` listings
are left alone).

It talks to an explicit database URL only, defaults to a dry run, and refuses
to touch a non-SQLite database unless ``--allow-remote`` is passed. Do not run
it against production without a backup and a dry run first.

Usage (from ``backend/``):
  python scripts/ops/scrub_listing_pii.py --database-url sqlite:///motormila.db
  python scripts/ops/scrub_listing_pii.py --database-url sqlite:///motormila.db --apply
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import create_engine, text  # noqa: E402

from app.utils.pii import clean_listing_title, contains_contact_info  # noqa: E402

BATCH = 2000


def scrub(database_url: str, *, apply: bool, title_max_chars: int = 200) -> dict:
    engine = create_engine(database_url)
    scanned = changed = contacts_cleared = 0
    examples: list[tuple[int, str]] = []
    last_id = 0
    with engine.connect() as conn:
        while True:
            rows = conn.execute(
                text(
                    "SELECT id, title, contact_name, contact_phone FROM car_listings "
                    "WHERE id > :last AND (source IS NULL OR source <> 'motormila_user') "
                    "ORDER BY id LIMIT :lim"
                ),
                {"last": last_id, "lim": BATCH},
            ).fetchall()
            if not rows:
                break
            for row in rows:
                scanned += 1
                last_id = row.id
                title = row.title or ""
                new_title = clean_listing_title(title, max_chars=title_max_chars) if title else title
                needs_title = bool(title) and new_title != title
                needs_contact = bool(row.contact_name or row.contact_phone)
                if needs_title:
                    changed += 1
                    if len(examples) < 5 and contains_contact_info(title):
                        examples.append((row.id, new_title[:80]))
                if needs_contact:
                    contacts_cleared += 1
                if apply and (needs_title or needs_contact):
                    conn.execute(
                        text(
                            "UPDATE car_listings SET title = :title, contact_name = NULL, "
                            "contact_phone = NULL WHERE id = :id"
                        ),
                        {"title": new_title if needs_title else title, "id": row.id},
                    )
        if apply:
            conn.commit()
        else:
            conn.rollback()
    return {
        "scanned": scanned,
        "titles_changed": changed,
        "contacts_cleared": contacts_cleared,
        "applied": apply,
        "examples_after": examples,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--apply", action="store_true", help="persist changes (default: dry run)")
    parser.add_argument("--allow-remote", action="store_true", help="permit a non-SQLite URL")
    parser.add_argument("--title-max-chars", type=int, default=200)
    args = parser.parse_args(argv)

    if not args.database_url.startswith("sqlite") and not args.allow_remote:
        print("Refusing non-SQLite database without --allow-remote (take a backup first).", file=sys.stderr)
        return 2
    result = scrub(args.database_url, apply=args.apply, title_max_chars=args.title_max_chars)
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
