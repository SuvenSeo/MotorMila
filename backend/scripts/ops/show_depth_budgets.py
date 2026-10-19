"""Read-only summary of the per-category page budget each scraper will use.

Prints the resolved budget at the dump script's real 120-page default, so the
removal of the old hard-coded 25-page ceiling is easy to confirm without
reading code.

    python scripts/ops/show_depth_budgets.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.scrapers.auto_lanka_site import AutoLankaSiteScraper  # noqa: E402
from app.scrapers.hitad import HitadScraper  # noqa: E402
from app.scrapers.page_budget import secondary_page_budget  # noqa: E402
from app.scrapers.patpat import PatpatScraper  # noqa: E402
from app.scrapers.riyahub import RiyahubScraper  # noqa: E402
from app.scrapers.saleme import SaleMeScraper  # noqa: E402

DUMP_DEFAULT_PAGES = 120
OLD_HARD_CEILING = 25


def main() -> int:
    budget = int(os.getenv("SCRAPE_MAX_PAGES", DUMP_DEFAULT_PAGES))
    print(f"per-source page budget: {budget}")
    print(f"secondary_page_budget({budget}) = {secondary_page_budget(budget)} (old hard ceiling: {OLD_HARD_CEILING})")
    print()
    print(f"{'source':12s} {'entry points':>13s} {'pages each':>11s}  {'total urls':>10s}")
    rows = [
        ("riyahub", RiyahubScraper(db=None)._build_page_url_groups(budget)),
        ("saleme", SaleMeScraper(db=None)._build_page_url_groups(budget)),
        ("dimo", __import__("app.scrapers.dimo", fromlist=["DimoScraper"]).DimoScraper(db=None)._build_page_url_groups(budget)),
        ("carshop", __import__("app.scrapers.carshop", fromlist=["CarshopScraper"]).CarshopScraper(db=None)._build_page_url_groups(budget)),
    ]
    for name, groups in rows:
        per = sorted({len(group) for group in groups})
        total = sum(len(group) for group in groups)
        shown = str(per[0]) if len(per) == 1 else f"{per[0]}-{per[-1]}"
        print(f"{name:12s} {len(groups):>13d} {shown:>11s}  {total:>10d}")

    print()
    print(f"{'source':12s} {'secondary category':24s} {'pages':>6s}")
    print(f"{'hitad':12s} {'motorbikes':24s} {HitadScraper._page_budget_for_category('motorbikes', budget):>6d}")
    print(f"{'auto-lanka':12s} {'Motorbikes':24s} {AutoLankaSiteScraper._page_budget_for_type('Motorbikes', budget):>6d}")
    print(f"{'patpat':12s} {'bike':24s} {PatpatScraper._page_budget_for_category('bike', budget):>6d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
