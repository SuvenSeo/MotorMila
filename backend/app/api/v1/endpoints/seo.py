"""SEO hub sitemap + route manifest (TRACK B2-C, additive only).

Serves the indexable hub surface for crawlers:
  GET /api/v1/seo/sitemap-index.xml   -> sitemapindex (cars / districts /
                                         compare + the static listing chunks)
  GET /api/v1/seo/sitemap-cars.xml
  GET /api/v1/seo/sitemap-districts.xml
  GET /api/v1/seo/sitemap-compare.xml
  GET /api/v1/seo/route-manifest      -> JSON feed for scripts/generate-routes.ts

lastmod is truncated to the hour (hourly recompute granularity) so crawlers
revisit on a stable cadence. Reads aggregates/distincts only — never touches
market_stats_cache.
"""

import re
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from db.models import CarListing, PriceAggregate, live_listing_filter
from db.session import get_db

router = APIRouter()

SITE_ORIGIN = "https://motormila.pages.dev"
COMPARE_SLUG_PATTERN = re.compile(r"^\d+(?:-vs-\d+){0,3}$")
MANIFEST_CAP = 500


def _slugify(value: Optional[str]) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)


def _hourly_lastmod() -> str:
    return datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0).strftime(
        "%Y-%m-%dT%H:%M:%S+00:00"
    )


def _xml_response(xml: str, found: bool = True) -> Response:
    return Response(
        content=xml,
        media_type="application/xml",
        headers={
            "Cache-Control": (
                "public, s-maxage=3600, stale-while-revalidate=86400"
                if found
                else "public, s-maxage=300"
            )
        },
    )


def _car_rows(db: Session):
    """Distinct (make, model) pairs with listing volume, richest first."""
    return (
        db.query(
            PriceAggregate.make,
            PriceAggregate.model,
            func.sum(PriceAggregate.listing_count).label("volume"),
        )
        .group_by(PriceAggregate.make, PriceAggregate.model)
        .order_by(desc("volume"))
        .limit(MANIFEST_CAP)
        .all()
    )


def _year_rows(db: Session):
    return (
        db.query(PriceAggregate.make, PriceAggregate.model, PriceAggregate.year)
        .filter(PriceAggregate.year.isnot(None))
        .group_by(PriceAggregate.make, PriceAggregate.model, PriceAggregate.year)
        .order_by(PriceAggregate.make, PriceAggregate.model, desc(PriceAggregate.year))
        .limit(MANIFEST_CAP)
        .all()
    )


def _district_rows(db: Session):
    return (
        db.query(CarListing.district, func.count(CarListing.id).label("volume"))
        .filter(live_listing_filter(), CarListing.district.isnot(None))
        .group_by(CarListing.district)
        .order_by(desc("volume"))
        .all()
    )


def _car_urls(db: Session) -> list[str]:
    urls: list[str] = []
    for row in _car_rows(db):
        make, model = _slugify(row.make), _slugify(row.model)
        if make and model:
            urls.append(f"{SITE_ORIGIN}/cars/{make}/{model}")
    return urls


def _car_year_urls(db: Session) -> list[str]:
    urls: list[str] = []
    for row in _year_rows(db):
        make, model = _slugify(row.make), _slugify(row.model)
        try:
            year = int(row.year)
        except (TypeError, ValueError):
            continue
        if make and model and 1980 <= year <= datetime.now(timezone.utc).year + 1:
            urls.append(f"{SITE_ORIGIN}/cars/{make}/{model}/{year}")
    return urls


def _district_urls(db: Session) -> list[str]:
    urls: list[str] = []
    for row in _district_rows(db):
        district = _slugify(row.district)
        if district:
            urls.append(f"{SITE_ORIGIN}/locations/{district}")
    return urls


def _compare_slugs(db: Session, limit: int = 50) -> list[str]:
    """Example canonical compare slugs from the newest live listing ids.

    Sitemap carries a bounded sample (not the full combinatorial space);
    share links for any other pair still resolve via the slug route.
    """
    ids = [
        int(row.id)
        for row in (
            db.query(CarListing.id)
            .filter(live_listing_filter())
            .order_by(desc(CarListing.last_seen_at))
            .limit(limit * 2)
            .all()
        )
        if int(row.id) > 0
    ]
    slugs: list[str] = []
    for first, second in zip(ids[::2], ids[1::2]):
        pair = sorted({first, second})
        if len(pair) == 2:
            slug = f"{pair[0]}-vs-{pair[1]}"
            if COMPARE_SLUG_PATTERN.match(slug):
                slugs.append(slug)
        if len(slugs) >= limit:
            break
    return slugs


def _render_urlset(urls: list[str], lastmod: str) -> str:
    entries = "\n".join(
        f"  <url>\n    <loc>{url}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>"
        for url in urls
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n</urlset>"
    )


@router.get("/sitemap-index.xml")
def get_seo_sitemap_index():
    lastmod = _hourly_lastmod()
    children = [
        f"{SITE_ORIGIN}/api/v1/seo/sitemap-cars.xml",
        f"{SITE_ORIGIN}/api/v1/seo/sitemap-districts.xml",
        f"{SITE_ORIGIN}/api/v1/seo/sitemap-compare.xml",
    ]
    entries = "\n".join(
        f"  <sitemap>\n    <loc>{loc}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </sitemap>"
        for loc in children
    )
    return _xml_response(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n</sitemapindex>"
    )


@router.get("/sitemap-cars.xml")
def get_seo_sitemap_cars(db: Session = Depends(get_db)):
    urls = (_car_urls(db) + _car_year_urls(db))[:MANIFEST_CAP]
    return _xml_response(_render_urlset(urls, _hourly_lastmod()), found=bool(urls))


@router.get("/sitemap-districts.xml")
def get_seo_sitemap_districts(db: Session = Depends(get_db)):
    urls = _district_urls(db)[:MANIFEST_CAP]
    return _xml_response(_render_urlset(urls, _hourly_lastmod()), found=bool(urls))


@router.get("/sitemap-compare.xml")
def get_seo_sitemap_compare(db: Session = Depends(get_db)):
    lastmod = _hourly_lastmod()
    urls = [f"{SITE_ORIGIN}/compare/{slug}" for slug in _compare_slugs(db)]
    return _xml_response(_render_urlset(urls, lastmod), found=bool(urls))


@router.get("/route-manifest")
def get_seo_route_manifest(
    limit: Annotated[int, Query(ge=1, le=500)] = 500,
    db: Session = Depends(get_db),
):
    """JSON feed consumed by scripts/generate-routes.ts (capped at 500)."""
    urls: list[dict] = []
    for loc in _car_urls(db):
        _, _, make, model = loc.replace(SITE_ORIGIN, "").split("/")
        urls.append({"path": f"/cars/{make}/{model}", "kind": "make-model"})
    for loc in _car_year_urls(db):
        _, _, make, model, year = loc.replace(SITE_ORIGIN, "").split("/")
        urls.append(
            {"path": f"/cars/{make}/{model}/{year}", "kind": "make-model-year", "year": int(year)}
        )
    for loc in _district_urls(db):
        district = loc.rsplit("/", 1)[-1]
        urls.append({"path": f"/locations/{district}", "kind": "district", "district": district})
    for slug in _compare_slugs(db):
        urls.append({"path": f"/compare/{slug}", "kind": "compare", "slug": slug})
    urls = urls[:limit]
    counts: dict[str, int] = {"total": len(urls)}
    for row in urls:
        counts[row["kind"]] = counts.get(row["kind"], 0) + 1
    return {"generated_at": _hourly_lastmod(), "source": "backend", "counts": counts, "urls": urls}
