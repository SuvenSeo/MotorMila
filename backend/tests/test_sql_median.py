"""Tests for app.utils.sql_median — the median path behind the dealer, B2B,
and Pro listing endpoints.

Covers dialect detection, the SQL percentile expression contract, and the
Python fallback used on SQLite with its min-value filter and rounding.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("ALLOW_SQLITE_FALLBACK", "true")

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.utils import sql_median  # noqa: E402
from app.utils.sql_median import (  # noqa: E402
    median_price_expr,
    median_price_for_query,
    python_median,
    supports_percentile,
)
from db.models import Base, CarListing  # noqa: E402


def test_supports_percentile_by_dialect():
    engine = create_engine("sqlite:///:memory:")
    session = sessionmaker(bind=engine)()
    assert supports_percentile(session) is False

    postgres_db = MagicMock()
    postgres_db.bind.dialect.name = "postgresql"
    assert supports_percentile(postgres_db) is True


def test_median_price_expr_dialect_contract():
    engine = create_engine("sqlite:///:memory:")
    session = sessionmaker(bind=engine)()
    assert median_price_expr(session, CarListing.price_lkr) is None

    postgres_db = MagicMock()
    postgres_db.bind.dialect.name = "postgresql"
    expr = median_price_expr(postgres_db, CarListing.price_lkr)
    assert expr is not None
    assert expr.name == "median_price"


def test_python_median_filters_and_rounds():
    assert python_median([1.0, 2.0, 3.0, 4.0]) == 2.5
    assert python_median([1_000_000, None, 2_000_000, 3_000_000]) == 2_000_000.0

    # min_value filter drops below-threshold prices.
    assert python_median([1.0, 10.0, 20.0], min_value=5.0) == 15.0

    # Results are rounded to two decimals.
    assert python_median([1.234, 2.346]) == 1.79

    assert python_median([]) is None
    assert python_median([None, 1.0], min_value=5.0) is None


def _dt() -> datetime:
    return datetime(2026, 4, 1, tzinfo=timezone.utc)


def _listing(source_id: str, price_lkr: int | None) -> CarListing:
    now = _dt()
    return CarListing(
        source="ikman",
        source_id=source_id,
        scraped_at=now,
        first_seen_at=now,
        last_seen_at=now,
        make="Toyota",
        model="Vitz",
        year=2018,
        price_lkr=price_lkr,
        district="Colombo",
        city="Colombo",
        title=f"Toyota Vitz {source_id}",
        url=f"https://example.com/{source_id}",
    )


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_median_price_for_query_sqlite_uses_python_fallback():
    db = _session()
    db.add_all(
        [
            _listing("a", 5_000_000),
            _listing("b", 6_000_000),
            _listing("c", None),
            _listing("d", 50_000),
        ]
    )
    db.commit()

    query = db.query(CarListing).filter(CarListing.district == "Colombo")
    median = median_price_for_query(db, query, CarListing.price_lkr, min_value=100_000)

    assert median == 5_500_000.0
    assert median_price_for_query(db, query.filter(CarListing.make == "Suzuki"), CarListing.price_lkr) is None


def test_median_price_for_query_postgres_uses_sql_expr():
    db = MagicMock()
    db.bind.dialect.name = "postgresql"

    query = MagicMock()
    query.with_entities.return_value.scalar.return_value = 5_000_000.123

    assert median_price_for_query(db, query, CarListing.price_lkr) == 5_000_000.12

    query.with_entities.return_value.scalar.return_value = None
    assert median_price_for_query(db, query, CarListing.price_lkr) is None
