"""Server-side free soft-limit helpers stay in sync with the product ceilings."""

from app.utils.plan_limits import (
    FREE_EV_MODELS_LIMIT,
    FREE_PULSE_LIMIT,
    FREE_TRENDS_MONTHS,
    FREE_VEHICLE_NEWS_LIMIT,
    PRO_PLANS,
    is_free_browse_plan,
    take_last_months,
)


def test_pro_plans_include_dealer():
    assert "dealer" in PRO_PLANS
    assert "pro" in PRO_PLANS
    assert "enterprise" in PRO_PLANS


def test_is_free_browse_plan_matrix():
    assert is_free_browse_plan("free") is True
    assert is_free_browse_plan("pro") is False
    assert is_free_browse_plan("dealer") is False
    assert is_free_browse_plan("enterprise") is False
    assert is_free_browse_plan("free", role="admin") is False
    # Anonymous callers get free-tier teaser limits — omitting auth must not
    # unlock Pro-depth data.
    assert is_free_browse_plan(None) is True


def test_free_ceiling_constants():
    assert FREE_PULSE_LIMIT == 6
    assert FREE_TRENDS_MONTHS == 6
    assert FREE_EV_MODELS_LIMIT == 3
    assert FREE_VEHICLE_NEWS_LIMIT == 2
    assert take_last_months([1, 2, 3, 4, 5, 6, 7, 8], 6) == [3, 4, 5, 6, 7, 8]
