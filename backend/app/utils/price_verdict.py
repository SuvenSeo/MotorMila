"""One price verdict for every surface (FMV card, deal badge, Trust Check, …).

Every price judgment Motormila shows for a listing is derived from ONE
reference value (the listing's FMV estimate, or the stored cohort median when
no FMV estimate is loaded) plus its confidence, through :func:`price_verdict`.
The same rules are ported 1:1 to the web (``src/lib/priceVerdict.ts``) and
Android (``core/price/PriceVerdict.kt``); the three share the constants below
and a shared fixture (``docs/price-verdict-fixtures.json``) so they cannot
drift apart.

A verdict is either ``ok`` (band + whole-number percent) or ``withheld`` with
a machine reason. We withhold rather than show something that looks fake:

* the asking price is not a full vehicle price (missing, placeholder like
  123456, below the category floor, lease/rent/monthly, parts/damaged ad);
* the reference is weak (no estimate, fewer than ``MIN_COMPS`` comparables,
  ``low``/``none`` confidence, a generic "Other" model bucket);
* the gap is implausible (more than ``MAX_PLAUSIBLE_GAP_PCT`` either way, or a
  power-of-ten ratio that signals a lakhs/millions unit slip);
* two estimates for the same listing point in opposite directions.

Thresholds (documented in docs/PRICE_VERDICT.md):
  below  ≤ −5 %   ·  above ≥ +8 %  ·  verify-first ≤ −35 %  ·  withheld beyond ±60 %
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional

# ── Bands ──────────────────────────────────────────────────────────────────
VERDICT_BELOW_PCT = 5.0
VERDICT_ABOVE_PCT = 8.0
VERIFY_BELOW_PCT = 35.0
# Beyond this gap (either way) the comparison itself is suspect: in a scan of
# 435 live listings every |gap| > 60 % case traced back to a wrong cohort
# (bike vs car in an "Other" bucket), a placeholder/part price or a broken
# estimate — never a genuine bargain or rip-off.
MAX_PLAUSIBLE_GAP_PCT = 60.0
MIN_COMPS = 5

# ── Price sanity ───────────────────────────────────────────────────────────
MAX_PLAUSIBLE_PRICE_LKR = 500_000_000.0
DEFAULT_PRICE_FLOOR_LKR = 100_000.0
# Lowest plausible *full* asking price per category. Below it the number is a
# deposit, a monthly instalment, a part or a typo.
PRICE_FLOOR_LKR: dict[str, float] = {
    "motorbikes": 50_000.0,
    "three-wheelers": 100_000.0,
    "tractors": 100_000.0,
    "cars": 300_000.0,
    "suvs": 300_000.0,
    "jeeps": 300_000.0,
    "vans": 300_000.0,
    "wagons": 300_000.0,
    "pickups": 300_000.0,
    "crew-cabs": 300_000.0,
    "lorries": 300_000.0,
    "lorries-trucks": 300_000.0,
    "trucks": 300_000.0,
    "buses": 300_000.0,
    "heavy-duty": 300_000.0,
}

GENERIC_MODELS = frozenset({"", "other", "others", "unknown", "n/a", "na", "-", "none", "any", "various"})

_PLACEHOLDER_RE = re.compile(r"^(?:1{6,}|1234(?:5(?:6(?:7(?:8(?:9)?)?)?)?)?|98765\d{0,4})$")

_LEASE_POSITIVE = [
    re.compile(p, re.I)
    for p in (
        r"\bleas(?:e|ing)\s*(?:-|\s)?\s*(?:take\s*-?\s*over|transfer)\b",
        r"\btake\s*-?\s*over\b",
        r"\bcan\s+be\s+taken\s+over\b",
        r"\bleas(?:e|ing)\s*settle(?:ment)?\b(?!d)",
        r"\bsettle\s+(?:the\s+)?leas(?:e|ing)\b",
        r"\b(?:ongoing|on-going|existing|running|current)\s+leas(?:e|ing)\b",
        r"\bcontinu(?:e|ing)\s+(?:the\s+|with\s+the\s+)?(?:existing\s+)?leas(?:e|ing)\b",
        r"\bbalance\b[^.\n]{0,40}?\binstal+ments?\b",
        r"\bremaining\s+(?:\d{1,3}\s+)?instal+ments?\b",
        r"\b(?:leas(?:e|ing)|loan|facility)\s+balance\b",
        r"\bbalance\s+(?:leas(?:e|ing)|loan)\b",
        r"\bleas(?:e|ing)\b[^.\n\d]{0,20}[\d,]{4,}(?:\.\d+)?\s*(?:/=)?\s*[x×*]\s*\d{1,3}\b",
    )
]
_LEASE_NEGATIVE = [
    re.compile(p, re.I)
    for p in (
        r"\bleas(?:e|ing)\s+(?:can\s+be\s+)?(?:arranged|facilit(?:y|ies)|available|options?)\b",
        r"\bleas(?:e|ing)\s+(?:is\s+)?(?:fully\s+)?(?:settled|cleared|closed|free)\b",
        r"\b(?:no|without)\s+leas(?:e|ing)\b",
    )
]
_RENT_RE = re.compile(
    r"\b(?:for\s+(?:rent|hire)|rent\s*-?\s*a\s*-?\s*(?:car|van|cab)|on\s+rent|rentals?|per\s+(?:month|day|week)|"
    r"monthly\s+(?:rent(?:al)?|payment|instal+ment)|daily\s+rental|down\s*-?\s*payment|instal+ments?\s+only)\b",
    re.I,
)
_PARTS_RE = re.compile(
    r"\b(?:(?:for|spare)\s+parts|parts\s+only|(?:body|engine|shell|chassis)\s+only|salvage|scrap(?:ped)?|wreck(?:ed)?|"
    r"breaking\s+for\s+parts|dismantl\w*|accidented|accident\s+(?:damaged?|vehicle|car|bike|repair)|"
    r"(?:fire|flood)\s*-?\s*damaged?|damaged\s+(?:vehicle|car|bike|van))\b",
    re.I,
)

REASON_GROUP = {
    "no_price": "price_unusable",
    "placeholder_price": "price_unusable",
    "below_price_floor": "price_unusable",
    "above_price_ceiling": "price_unusable",
    "lease_or_rent": "lease_or_rent",
    "parts_or_damaged": "parts_or_damaged",
    "no_reference": "insufficient_data",
    "thin_comps": "insufficient_data",
    "low_confidence": "insufficient_data",
    "generic_model": "insufficient_data",
    "implausible_gap": "inconsistent_data",
    "unit_mismatch": "inconsistent_data",
    "estimates_disagree": "inconsistent_data",
}


def _num(value: Any) -> Optional[float]:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def is_lease_takeover_text(*texts: Optional[str]) -> bool:
    text = " \n ".join(t for t in texts if isinstance(t, str) and t.strip())
    if not text:
        return False
    for neg in _LEASE_NEGATIVE:
        text = neg.sub(" ", text)
    return any(p.search(text) for p in _LEASE_POSITIVE)


def is_placeholder_price(price: float) -> bool:
    if price <= 0 or price != int(price):
        return False
    return bool(_PLACEHOLDER_RE.match(str(int(price))))


def is_generic_model(model: Optional[str]) -> bool:
    """A bucket like "Other" (many models mixed). Unknown (None) is not penalised."""
    if model is None:
        return False
    return model.strip().lower() in GENERIC_MODELS


def price_floor_lkr(category: Optional[str]) -> float:
    return PRICE_FLOOR_LKR.get((category or "").strip().lower(), DEFAULT_PRICE_FLOOR_LKR)


def is_unit_mismatch(a: float, b: float) -> bool:
    """Prices a power of ten apart (±4 %): the lakhs/millions/rupees slip."""
    if not (a > 0 and b > 0):
        return False
    ratio = max(a, b) / min(a, b)
    return any(abs(ratio / f - 1) <= 0.04 for f in (10, 100, 1_000, 10_000, 100_000, 1_000_000))


def asking_price_issue(
    asking: Any,
    *,
    category: Optional[str] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
    variant: Optional[str] = None,
) -> Optional[str]:
    """Why ``asking`` is not a usable full vehicle price, or None when it is."""
    price = _num(asking)
    if price is None or price <= 0:
        return "no_price"
    if is_placeholder_price(price):
        return "placeholder_price"
    if price < price_floor_lkr(category):
        return "below_price_floor"
    if price > MAX_PLAUSIBLE_PRICE_LKR:
        return "above_price_ceiling"
    if is_lease_takeover_text(title, variant, description):
        return "lease_or_rent"
    text = " ".join(t for t in (title, variant, description) if isinstance(t, str))
    if _RENT_RE.search(text):
        return "lease_or_rent"
    if _PARTS_RE.search(text):
        return "parts_or_damaged"
    return None


def _band(gap_pct: float) -> str:
    if gap_pct <= -VERDICT_BELOW_PCT:
        return "below"
    if gap_pct >= VERDICT_ABOVE_PCT:
        return "above"
    return "fair"


def withheld_verdict(reason: str, reference: Optional[float]) -> dict[str, Any]:
    return {
        "status": "withheld",
        "reason": reason,
        "reason_group": REASON_GROUP.get(reason, "insufficient_data"),
        "band": None,
        "gap_pct": None,
        "pct": None,
        "verify_first": False,
        "reference_lkr": reference,
    }


def price_verdict(
    asking: Any,
    reference: Any,
    *,
    comps: Optional[int] = None,
    confidence: Optional[str] = None,
    category: Optional[str] = None,
    model: Optional[str] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
    variant: Optional[str] = None,
    secondary_reference: Any = None,
) -> dict[str, Any]:
    """The single price verdict. ``gap_pct`` = (asking − reference) / reference × 100.

    ``comps``/``confidence`` unknown (``None``) are not penalised: listing
    cards only carry the stored cohort median, which the deal-score job
    already restricts to cohorts of ≥ 5 comparables.
    """
    ref = _num(reference)
    issue = asking_price_issue(asking, category=category, title=title, description=description, variant=variant)
    if issue:
        return withheld_verdict(issue, ref)
    price = float(asking)
    if ref is None or ref <= 0:
        return withheld_verdict("no_reference", None)
    if is_generic_model(model):
        return withheld_verdict("generic_model", ref)
    if comps is not None and int(comps) < MIN_COMPS:
        return withheld_verdict("thin_comps", ref)
    if (confidence or "").strip().lower() in {"low", "none"}:
        return withheld_verdict("low_confidence", ref)
    if is_unit_mismatch(price, ref):
        return withheld_verdict("unit_mismatch", ref)
    gap = (price - ref) / ref * 100.0
    if abs(gap) > MAX_PLAUSIBLE_GAP_PCT:
        return withheld_verdict("implausible_gap", ref)
    band = _band(gap)
    second = _num(secondary_reference)
    if second is not None and second > 0:
        gap2 = (price - second) / second * 100.0
        band2 = _band(gap2) if abs(gap2) <= MAX_PLAUSIBLE_GAP_PCT else None
        if band2 is not None and {band, band2} == {"below", "above"}:
            return withheld_verdict("estimates_disagree", ref)
    # Whole-number percent that never contradicts its band once rounded:
    # a 7.9 %-above "fair" never reads "8 %", a 5.0 %-below call never "4 %".
    pct = int(math.floor(abs(gap) + 0.5))  # half-up, same as JS Math.round / Kotlin
    if band == "fair":
        pct = min(pct, int((VERDICT_BELOW_PCT if gap < 0 else VERDICT_ABOVE_PCT) - 1))
    elif band == "below":
        pct = max(pct, int(VERDICT_BELOW_PCT))
    else:
        pct = max(pct, int(VERDICT_ABOVE_PCT))
    return {
        "status": "ok",
        "reason": None,
        "reason_group": None,
        "band": band,
        "gap_pct": round(gap, 2),
        "pct": pct,
        "verify_first": gap <= -VERIFY_BELOW_PCT,
        "reference_lkr": ref,
    }


def verdict_label(verdict: dict[str, Any]) -> Optional[str]:
    """English label for API consumers that print the verdict as-is."""
    if verdict.get("status") != "ok":
        return None
    band, pct = verdict.get("band"), verdict.get("pct")
    if verdict.get("verify_first"):
        return "Unusually low — verify first"
    if band == "below":
        return f"Priced {pct}% below typical"
    if band == "above":
        return f"Priced {pct}% above typical"
    return "Near the typical price"


def stored_signal_is_plausible(
    *,
    price_lkr: Any,
    market_median_lkr: Any,
    category: Optional[str] = None,
    model: Optional[str] = None,
    title: Optional[str] = None,
) -> bool:
    """Serve-time guard for the stored ``deal_score`` / ``market_median_lkr``.

    The deal-score job writes them from make/model/year cohorts; a cohort that
    mixes motorbikes and cars ("Honda Other 2026") or a placeholder price gives
    a "90 % below" score. Those rows are served without a score instead.
    """
    if market_median_lkr is None:
        return True
    v = price_verdict(price_lkr, market_median_lkr, category=category, model=model, title=title)
    return v["status"] == "ok"


def plausible_deal_score(row: Any) -> Optional[float]:
    """A row's stored ``deal_score`` when its comparison is plausible, else None.

    Accepts any object with ``price_lkr``/``market_median_lkr``/``deal_score``
    (+ optional ``vehicle_category``/``model``/``title``) — ORM rows or Row tuples.
    """
    score = _num(getattr(row, "deal_score", None))
    if score is None:
        return None
    median = getattr(row, "market_median_lkr", None)
    if median is None:
        # Narrow selects carry the score only; the score itself is the gap.
        return score if abs(score) <= MAX_PLAUSIBLE_GAP_PCT else None
    ok = stored_signal_is_plausible(
        price_lkr=getattr(row, "price_lkr", None),
        market_median_lkr=median,
        category=getattr(row, "vehicle_category", None),
        model=getattr(row, "model", None),
        title=getattr(row, "title", None),
    )
    return score if ok else None


def plausible_deal_score_sql(column):
    """SQL guard: stored score within ±MAX_PLAUSIBLE_GAP_PCT (ranked lists, counts)."""
    return column.between(-MAX_PLAUSIBLE_GAP_PCT, MAX_PLAUSIBLE_GAP_PCT)
