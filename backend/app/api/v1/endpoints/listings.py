from fastapi import APIRouter, Depends, Header, Query, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, load_only
from sqlalchemy import String, cast, func, desc, and_, or_
from typing import Optional, List, Dict, Any, Annotated
from statistics import median
from datetime import datetime, timedelta, timezone
from app.utils.time import utc_now
import ipaddress
import json
import math
import re
import socket
import time
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from db.session import get_db
from db.models import CarListing, VehiclePriceHistory, live_listing_filter
from app.services.nhtsa_specs import fetch_models_for_make as _nhtsa_fetch_models
from app.services.safety_research import combined_research
from app.services.geo_service import enrich_listing
from app.utils.history_report import build_history_report
from app.utils.fmv import predict_listing_fmv
from app.utils.price_history import summarize_price_history
from app.utils.make_canonical import canonicalize_make, canonicalize_model, compact_key
from app.utils.vehicle_category import category_sql_filter, resolve_browse_category
from app.utils.thumbnail_urls import upgrade_thumbnail_url
from app.api.v1.endpoints.auth import (
    PRO_PLANS,
    get_current_auth_payload,
    resolve_live_session,
    verify_token,
)
from app.utils.plan_limits import (
    FREE_LISTINGS_MAX_PAGE,
    FREE_LISTINGS_MAX_SIZE,
    FREE_PRICE_DROPS_LIMIT,
    FREE_SIMILAR_LIMIT,
    is_free_browse_plan,
)
from app.models.schemas import (
    CarListingRead,
    ListingsResponse,
    ListingSearchSuggestion,
    CustomVehicleEstimateRequest,
    CustomVehicleEstimateResponse,
    ComparableVehicle,
    HistoryReportResponse,
    PriceDropsResponse,
    PriceHistoryResponse,
    SellerProfileResponse,
)
from app.services.rate_limit import RateLimiter

_listings_rate_limiter = RateLimiter(max_requests=300, window_seconds=60)

router = APIRouter(dependencies=[Depends(_listings_rate_limiter)])


def _request_live_access(
    request: Optional[Request] = None,
    authorization: Optional[str] = None,
    db: Optional[Session] = None,
) -> tuple[Optional[str], Optional[str]]:
    """Return (plan, role) from a live session when possible; else JWT plan only."""
    auth_value = authorization if isinstance(authorization, str) else None
    bearer = (auth_value or "").removeprefix("Bearer ").strip()
    token = bearer
    if not token and request is not None:
        cookies = getattr(request, "cookies", None) or {}
        token = str(cookies.get("mm_session") or "").strip()
    if not token:
        return None, None
    payload = verify_token(token)
    if not payload:
        return None, None
    if db is not None:
        try:
            live = resolve_live_session(payload, db)
            return str(live.get("plan") or "free").lower(), str(live.get("role") or "user").lower()
        except Exception:
            return None, None
    return str(payload.get("plan") or "free").strip().lower(), str(payload.get("role") or "user").strip().lower()


def _request_plan(request: Optional[Request] = None, authorization: Optional[str] = None) -> Optional[str]:
    plan, _role = _request_live_access(request, authorization, db=None)
    return plan


def _is_free_browse_plan(plan: Optional[str], role: Optional[str] = None) -> bool:
    if plan is None:
        # Anonymous public-browse callers get free-teaser limits (no Pro signals).
        return True
    return is_free_browse_plan(plan, role=role)


SOURCE_LABELS = {
    "ikman": "Ikman",
    "riyasewana": "Riyasewana",
    "autolanka": "AutoLanka",
    "autodirect": "AutoDirect",
    "patpat": "Patpat",
    "autostream": "AutoStream",
    "carshop": "Carshop",
    "saleme": "SaleMe",
    "riyahub": "Riyahub",
    "dimo": "Cars at DIMO",
}

IMAGE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}

MIN_REASONABLE_PRICE_LKR = 100_000
MAX_PROXY_IMAGE_BYTES = 5 * 1024 * 1024
MAX_DETAIL_HTML_BYTES = 1 * 1024 * 1024
MAX_FETCH_REDIRECTS = 3


MODEL_ALIAS_GROUPS = (
    {"vitz", "yaris"},
    {"vezel", "hrv", "hr-v"},
)


def _normalize_image_url(base_url: Optional[str], candidate: Optional[str]) -> Optional[str]:
    raw = str(candidate or "").strip()
    if not raw or raw.startswith("data:"):
        return None
    try:
        # Some sources store a tiny grid crop (ikman: 142x107). Their CDN
        # serves a larger variant from the same path, so every thumbnail URL
        # is upgraded before it reaches the UI or the proxy download.
        return upgrade_thumbnail_url(urljoin(base_url or "", raw))
    except Exception:
        return None


def _is_public_network_address(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return not (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _is_safe_external_fetch_url(value: Optional[str]) -> bool:
    raw = str(value or "").strip()
    if not raw:
        return False

    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        return False

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if not hostname or hostname == "localhost" or hostname.endswith(".localhost"):
        return False

    try:
        ipaddress.ip_address(hostname)
        return _is_public_network_address(hostname)
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except OSError:
        return False

    addresses = {info[4][0] for info in infos if info and info[4]}
    return bool(addresses) and all(_is_public_network_address(address) for address in addresses)


class SSRFSafeTransport(httpx.HTTPTransport):
    def handle_request(self, request: httpx.Request, *args, **kwargs):
        url = request.url
        host = url.host
        
        try:
            ip = ipaddress.ip_address(host)
            if not _is_public_network_address(str(ip)):
                raise httpx.ConnectError("Blocked unsafe IP connection (SSRF Prevention)")
        except ValueError:
            try:
                infos = socket.getaddrinfo(host, url.port or (443 if url.scheme == "https" else 80), type=socket.SOCK_STREAM)
                addresses = {info[4][0] for info in infos if info and info[4]}
            except OSError as e:
                raise httpx.ConnectError(f"DNS resolution failed for {host}") from e
                
            if not addresses:
                raise httpx.ConnectError(f"No IP addresses resolved for {host}")
                
            for addr in addresses:
                if not _is_public_network_address(addr):
                    raise httpx.ConnectError(f"Blocked unsafe resolved address {addr} (SSRF Prevention)")
            
            resolved_ip = list(addresses)[0]
            request.url = request.url.copy_with(host=resolved_ip)
            request.extensions["sni_hostname"] = host
            request.headers["Host"] = host

        return super().handle_request(request, *args, **kwargs)


def _checked_get(client: httpx.Client, url: str, *, timeout: float) -> httpx.Response:
    current = url
    for _ in range(MAX_FETCH_REDIRECTS + 1):
        if not _is_safe_external_fetch_url(current):
            raise ValueError("unsafe external fetch URL")

        response = client.get(current, timeout=timeout)
        if response.is_redirect:
            location = response.headers.get("location")
            if not location:
                return response
            current = urljoin(str(response.url), location)
            continue
        return response

    raise ValueError("too many redirects while fetching external URL")


def _compact(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    compacted = (
        str(value)
        .strip()
        .lower()
        .replace("-", "")
        .replace("_", "")
        .replace(" ", "")
        .replace(".", "")
    )
    return compacted or None


def _build_model_alias_lookup() -> dict[str, set[str]]:
    lookup: dict[str, set[str]] = {}
    for group in MODEL_ALIAS_GROUPS:
        compact_group = {_token for _token in (_compact(name) for name in group) if _token}
        for token in compact_group:
            lookup[token] = compact_group
    return lookup


MODEL_ALIAS_LOOKUP = _build_model_alias_lookup()


def _compact_expr(column):
    return func.lower(
        func.replace(
            func.replace(
                func.replace(
                    func.replace(func.coalesce(column, ""), "-", ""),
                    "_",
                    "",
                ),
                " ",
                "",
            ),
            ".",
            "",
        )
    )


def _canonical_source(value: Optional[str]) -> Optional[str]:
    token = _compact(value)
    if not token:
        return None
    if token.startswith("ikman"):
        return "ikman"
    if token.startswith("riyasewana"):
        return "riyasewana"
    if token in {"autolanka", "autolankacom", "autolankasite", "autolankalk"}:
        return "autolanka"
    if token.startswith("autodirect"):
        return "autodirect"
    if token.startswith("patpat"):
        return "patpat"
    if token.startswith("autostream"):
        return "autostream"
    if token.startswith("carshop"):
        return "carshop"
    if token in {"saleme", "salemelk"}:
        return "saleme"
    if token in {"riyahub", "riyahublk"}:
        return "riyahub"
    if token in {"dimo", "carsatdimo", "dimoautomobiles"}:
        return "dimo"
    return token


def _canonical_fuel(value: Optional[str]) -> Optional[str]:
    token = _compact(value)
    if not token:
        return None
    if token in {"petrol", "gasoline", "gas"}:
        return "petrol"
    if token in {"diesel", "d"}:
        return "diesel"
    if token in {"electric", "ev", "battery"}:
        return "electric"
    if token in {"pluginhybrid", "pluginelectrichybrid", "phev"}:
        return "pluginhybrid"
    if "hybrid" in token:
        return "hybrid"
    return token


def _canonical_transmission(value: Optional[str]) -> Optional[str]:
    token = _compact(value)
    if not token:
        return None
    if token in {"automatic", "auto", "tiptronic"}:
        return "automatic"
    if token in {"manual", "stick"}:
        return "manual"
    if token in {"cvt", "continuouslyvariabletransmission"}:
        return "cvt"
    return token


def _canonical_condition(value: Optional[str]) -> Optional[str]:
    token = _compact(value)
    if not token:
        return None
    if token in {"brandnew", "new", "unregistered", "zerokm", "zeromileage"}:
        return "brand_new"
    if token in {"reconditioned", "recon", "recondition"}:
        return "reconditioned"
    if token in {"used", "preowned", "secondhand", "secondowner"}:
        return "used"
    return token


_BODY_TYPE_ALIASES: dict[str, frozenset[str]] = {
    "suv": frozenset({"suv", "sportutilityvehicle", "sportsutilityvehicle"}),
    "hatchback": frozenset({"hatchback", "hatch"}),
    "sedan": frozenset({"sedan", "saloon"}),
    "pickup": frozenset({"pickup", "doublecab", "singlecab", "truck"}),
    "van": frozenset({"van", "minivan"}),
    "mpv": frozenset({"mpv"}),
    "crossover": frozenset({"crossover", "cuv"}),
    "wagon": frozenset({"wagon", "estate"}),
    "coupe": frozenset({"coupe"}),
    "convertible": frozenset({"convertible", "cabriolet"}),
    "jeep": frozenset({"jeep", "4x4", "fourwheel", "fourwheeldrive"}),
    "mini": frozenset({"mini", "micro", "keicar", "citycar", "compact"}),
    "luxury": frozenset({"luxury", "premium"}),
    "motorcycle": frozenset({"motorcycle", "motorbike", "scooter", "bike"}),
}

_LUXURY_MAKES = frozenset(
    {
        "mercedes",
        "mercedesbenz",
        "bmw",
        "audi",
        "lexus",
        "landrover",
        "porsche",
        "jaguar",
        "bentley",
        "maserati",
        "ferrari",
        "lamborghini",
        "rollsroyce",
        "astonmartin",
        "cadillac",
        "infiniti",
        "genesis",
    }
)


def _canonical_body_type(value: Optional[str]) -> Optional[str]:
    token = _compact(value)
    if not token:
        return None
    for canonical, aliases in _BODY_TYPE_ALIASES.items():
        if token == canonical or token in aliases:
            return canonical
    return token


def _body_type_clause(body_type: Optional[str]):
    canonical = _canonical_body_type(body_type)
    if not canonical:
        return None

    aliases = sorted(_BODY_TYPE_ALIASES.get(canonical, frozenset({canonical})) | {canonical})
    body_match = _compact_expr(CarListing.body_type).in_(aliases)

    if canonical == "luxury":
        return or_(
            body_match,
            _compact_expr(CarListing.make).in_(sorted(_LUXURY_MAKES)),
            CarListing.title.ilike("%luxury%"),
            CarListing.title.ilike("%premium%"),
        )

    if canonical == "jeep":
        return or_(
            body_match,
            func.lower(func.coalesce(CarListing.vehicle_category, "")).in_(["jeeps", "jeep"]),
            CarListing.title.ilike("% jeep %"),
            CarListing.title.ilike("jeep %"),
            CarListing.title.ilike("% jeep"),
        )

    if canonical == "mini":
        return or_(
            body_match,
            func.lower(func.coalesce(CarListing.make, "")).in_(["mini", "micro"]),
            CarListing.title.ilike("%mini cooper%"),
            CarListing.title.ilike("% city car%"),
        )

    return body_match


def _is_missing_value(value: Optional[str]) -> bool:
    token = _compact(value)
    return token in {None, "na", "n/a", "unknown", "none", "nil", "notspecified", "notavailable", "other"}


def _pick_mode(values: List[str]) -> Optional[str]:
    counts: dict[str, int] = {}
    first_seen: dict[str, int] = {}

    for index, raw in enumerate(values):
        value = str(raw or "").strip()
        if not value:
            continue
        counts[value] = counts.get(value, 0) + 1
        first_seen.setdefault(value, index)

    if not counts:
        return None

    return sorted(
        counts.keys(),
        key=lambda key: (counts[key], -first_seen[key], len(key)),
        reverse=True,
    )[0]


def _extract_mileage_from_text(text: str) -> Optional[int]:
    if not text:
        return None

    match = re.search(r"\b(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(km|kms|kilometers?)\b", text, flags=re.IGNORECASE)
    if not match:
        return None

    try:
        value = int(str(match.group(1)).replace(",", ""))
    except ValueError:
        return None

    if 100 <= value <= 1_500_000:
        return value
    return None


def _infer_listing_hints_from_text(row: CarListing) -> Dict[str, Any]:
    text = " ".join(
        part
        for part in [
            str(getattr(row, "title", "") or ""),
            str(getattr(row, "url", "") or ""),
            str(getattr(row, "raw_location", "") or ""),
            str(getattr(row, "make", "") or ""),
            str(getattr(row, "model", "") or ""),
        ]
        if part
    ).lower()

    condition = None
    if re.search(r"\b(brand\s*new|new\s*vehicle|unregistered|zero\s*km|zero\s*mileage)\b", text):
        condition = "brand_new"
    elif re.search(r"\b(reconditioned|recon|recondition)\b", text):
        condition = "reconditioned"
    elif re.search(r"\b(used|pre\s*owned|second\s*hand|second\s*owner)\b", text):
        condition = "used"

    transmission = None
    if re.search(r"\btiptronic\b", text):
        transmission = "automatic"
    elif re.search(r"\bcvt\b", text):
        transmission = "cvt"
    elif re.search(r"\bmanual\b|\bstick\b", text):
        transmission = "manual"
    elif re.search(r"\bautomatic\b|\bauto\b", text):
        transmission = "automatic"

    fuel_type = None
    if re.search(r"\b(plugin\s*hybrid|phev)\b", text):
        fuel_type = "pluginhybrid"
    elif re.search(r"\bhybrid\b", text):
        fuel_type = "hybrid"
    elif re.search(r"\b(electric|\bev\b)\b", text):
        fuel_type = "electric"
    elif re.search(r"\bdiesel\b", text):
        fuel_type = "diesel"
    elif re.search(r"\b(petrol|gasoline)\b", text):
        fuel_type = "petrol"

    body_type = None
    if re.search(r"\b(suv|sport\s*utility\s*vehicle)\b", text):
        body_type = "suv"
    elif re.search(r"\b(crossover|cuv)\b", text):
        body_type = "crossover"
    elif re.search(r"\bhatch\s*back\b|\bhatchback\b", text):
        body_type = "hatchback"
    elif re.search(r"\b(sedan|saloon)\b", text):
        body_type = "sedan"
    elif re.search(r"\b(pickup|double\s*cab|single\s*cab|truck)\b", text):
        body_type = "pickup"
    elif re.search(r"\b(mpv|minivan)\b", text):
        body_type = "mpv"
    elif re.search(r"\bvan\b", text):
        body_type = "van"
    elif re.search(r"\bwagon\b", text):
        body_type = "wagon"
    elif re.search(r"\bcoupe\b", text):
        body_type = "coupe"
    elif re.search(r"\b(jeep|4[\s\-]?x[\s\-]?4)\b", text):
        body_type = "jeep"
    elif re.search(r"\b(luxury|premium)\b", text):
        body_type = "luxury"
    elif re.search(r"\b(mini\s*cooper|city\s*car|kei\s*car)\b", text):
        body_type = "mini"

    return {
        "condition": _canonical_condition(condition),
        "transmission": _canonical_transmission(transmission),
        "fuel_type": _canonical_fuel(fuel_type),
        "body_type": _canonical_body_type(body_type),
        "mileage": _extract_mileage_from_text(text),
    }


def _derive_peer_defaults(peer_rows: List[CarListing], target_year: Optional[int]) -> Dict[str, Any]:
    if not peer_rows:
        return {
            "condition": None,
            "transmission": None,
            "fuel_type": None,
            "body_type": None,
            "mileage": None,
        }

    if target_year is None:
        near_rows = peer_rows
    else:
        near_rows = [
            row
            for row in peer_rows
            if getattr(row, "year", None) is not None and abs(int(getattr(row, "year", 0)) - int(target_year)) <= 2
        ]

    if not near_rows:
        near_rows = peer_rows

    def _mode(rows: List[CarListing], attr: str, normalizer) -> Optional[str]:
        values = [normalizer(getattr(item, attr, None)) for item in rows]
        normalized = [value for value in values if value]
        return _pick_mode(normalized)

    condition = _mode(near_rows, "condition", _canonical_condition) or _mode(peer_rows, "condition", _canonical_condition)
    transmission = _mode(near_rows, "transmission", _canonical_transmission) or _mode(peer_rows, "transmission", _canonical_transmission)
    fuel_type = _mode(near_rows, "fuel_type", _canonical_fuel) or _mode(peer_rows, "fuel_type", _canonical_fuel)
    body_type = _mode(near_rows, "body_type", _canonical_body_type) or _mode(peer_rows, "body_type", _canonical_body_type)

    near_mileages = [int(getattr(item, "mileage")) for item in near_rows if getattr(item, "mileage", None) and int(getattr(item, "mileage")) > 0]
    all_mileages = [int(getattr(item, "mileage")) for item in peer_rows if getattr(item, "mileage", None) and int(getattr(item, "mileage")) > 0]
    mileage_pool = near_mileages if near_mileages else all_mileages
    inferred_mileage = int(round(median(mileage_pool))) if mileage_pool else None

    return {
        "condition": condition,
        "transmission": transmission,
        "fuel_type": fuel_type,
        "body_type": body_type,
        "mileage": inferred_mileage,
    }


def _peer_rows_for_listing(
    db: Session,
    listing: CarListing,
    cache: Dict[tuple[str, str], List[CarListing]],
) -> List[CarListing]:
    make_key = str(getattr(listing, "make", "") or "").strip().lower()
    model_key = str(getattr(listing, "model", "") or "").strip().lower()
    if not make_key or not model_key:
        return []

    cache_key = (make_key, model_key)
    if cache_key in cache:
        return cache[cache_key]

    rows = (
        db.query(CarListing)
        .filter(
            CarListing.id != listing.id,
            live_listing_filter(),
            func.lower(CarListing.make) == make_key,
            func.lower(CarListing.model) == model_key,
        )
        .order_by(desc(CarListing.first_seen_at))
        .limit(220)
        .all()
    )
    cache[cache_key] = rows
    return rows


def _enrich_listing_fields(
    listing: CarListing,
    db: Session,
    peer_cache: Dict[tuple[str, str], List[CarListing]],
) -> None:
    hints = _infer_listing_hints_from_text(listing)
    peer_rows = _peer_rows_for_listing(db, listing, peer_cache)
    peer_defaults = _derive_peer_defaults(peer_rows, getattr(listing, "year", None))

    resolved_condition = _canonical_condition(getattr(listing, "condition", None))
    if not resolved_condition:
        resolved_condition = hints.get("condition") or peer_defaults.get("condition")

    resolved_transmission = _canonical_transmission(getattr(listing, "transmission", None))
    if not resolved_transmission:
        resolved_transmission = hints.get("transmission") or peer_defaults.get("transmission")

    resolved_fuel = _canonical_fuel(getattr(listing, "fuel_type", None))
    if not resolved_fuel:
        resolved_fuel = hints.get("fuel_type") or peer_defaults.get("fuel_type")

    resolved_body = _canonical_body_type(getattr(listing, "body_type", None))
    if not resolved_body:
        resolved_body = hints.get("body_type") or peer_defaults.get("body_type")

    current_mileage = getattr(listing, "mileage", None)
    mileage_missing = current_mileage is None or int(current_mileage or 0) <= 0
    stale_year = bool(getattr(listing, "year", None) and int(getattr(listing, "year")) <= utc_now().year - 2)

    resolved_mileage = int(current_mileage) if not mileage_missing else None
    if mileage_missing:
        hinted_mileage = hints.get("mileage")
        peer_mileage = peer_defaults.get("mileage")
        if hinted_mileage and hinted_mileage > 0:
            resolved_mileage = int(hinted_mileage)
        elif stale_year and resolved_condition != "brand_new" and peer_mileage and peer_mileage > 0:
            resolved_mileage = int(peer_mileage)
        elif resolved_condition == "brand_new":
            resolved_mileage = 0

    listing.condition = resolved_condition or listing.condition
    listing.transmission = resolved_transmission or listing.transmission
    listing.fuel_type = resolved_fuel or listing.fuel_type
    listing.body_type = resolved_body or listing.body_type
    if resolved_mileage is not None:
        listing.mileage = resolved_mileage


def _model_alias_tokens(value: Optional[str]) -> set[str]:
    raw_value = str(value or "").strip().lower()
    token = _compact(value)
    if not token or not raw_value:
        return set()

    alias_group = MODEL_ALIAS_LOOKUP.get(token)
    if alias_group:
        return set(alias_group)

    raw_tokens = [
        _compact(part)
        for part in (
            raw_value.replace("-", " ").replace("_", " ").replace(".", " ").split()
        )
    ]
    for part_token in raw_tokens:
        if not part_token:
            continue
        part_alias_group = MODEL_ALIAS_LOOKUP.get(part_token)
        if part_alias_group:
            return set(part_alias_group)

    for alias_token, alias_values in MODEL_ALIAS_LOOKUP.items():
        if alias_token in token:
            return set(alias_values)

    return {token}


def _model_clause(value: Optional[str]):
    aliases = _model_alias_tokens(value)
    if not aliases:
        return None

    expr = _compact_expr(CarListing.model)
    if len(aliases) == 1:
        token = next(iter(aliases))
        return or_(expr == token, expr.like(f"%{token}%"))

    return or_(*[expr.like(f"%{alias}%") for alias in sorted(aliases)])


def _model_match_rank(candidate_model: Optional[str], requested_model: Optional[str]) -> int:
    requested = _compact(requested_model)
    candidate = _compact(candidate_model)
    if not requested or not candidate:
        return 0

    if candidate == requested:
        return 2

    aliases = _model_alias_tokens(requested_model)
    if any(candidate == alias or alias in candidate for alias in aliases):
        return 1
    return 0


def _comparable_sort_key(row: CarListing, requested_model: Optional[str]) -> tuple[int, float, float]:
    rank = _model_match_rank(getattr(row, "model", None), requested_model)
    deal_score = float(row.deal_score) if row.deal_score is not None else -9999.0
    first_seen = getattr(row, "first_seen_at", None)
    first_seen_ts = first_seen.timestamp() if first_seen is not None else 0.0
    return (rank, deal_score, first_seen_ts)


def _fuel_clause(value: str):
    expr = _compact_expr(CarListing.fuel_type)
    key = _canonical_fuel(value)
    if not key:
        return None
    if key == "hybrid":
        return or_(
            expr == "hybrid",
            expr == "pluginhybrid",
            expr.like("%hybrid%"),
        )
    if key == "pluginhybrid":
        return or_(
            expr == "pluginhybrid",
            expr.like("%plugin%hybrid%"),
            expr.like("%phev%"),
        )
    return or_(expr == key, expr.like(f"%{key}%"))


def _transmission_clause(value: str):
    expr = _compact_expr(CarListing.transmission)
    key = _canonical_transmission(value)
    if not key:
        return None
    if key == "automatic":
        return or_(
            expr == "automatic",
            expr == "auto",
            expr == "tiptronic",
            expr.like("%tiptronic%"),
        )
    if key == "manual":
        return or_(expr == "manual", expr == "stick")
    if key == "cvt":
        return or_(
            expr == "cvt",
            expr.like("%cvt%"),
            expr.like("%continuouslyvariable%"),
        )
    return or_(expr == key, expr.like(f"%{key}%"))


def _search_filter_tokens(value: str) -> List[str]:
    normalized = " ".join(str(value or "").strip().split()).lower()
    if not normalized:
        return []
    return [token for token in re.split(r"\s+", normalized) if token][:8]


def _optional_text_param(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.strip().split())
    return normalized or None


@router.get("", response_model=ListingsResponse)
def search_listings(
    request: Request,
    keyword: Optional[str] = Query(None, alias="q", max_length=120),
    source: Optional[str] = None,
    make: Optional[str] = None,
    model: Optional[str] = None,
    year_min: Optional[int] = None,
    year_max: Optional[int] = None,
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
    mileage_max: Optional[int] = None,
    fuel_type: Optional[str] = None,
    transmission: Optional[str] = None,
    condition: Optional[str] = None,
    body_type: Optional[str] = None,
    district: Optional[str] = None,
    vehicle_category: Optional[str] = Query(
        None,
        description=(
            "Browse category filter: cars (default homepage), motorbikes, "
            "three-wheelers, vans, buses, lorries, heavy-duty, tractors, "
            "bicycles, boats, others."
        ),
        max_length=40,
    ),
    price_availability: str = Query("priced", pattern="^(priced|unavailable)$"),
    sort: str = Query("newest", pattern="^(newest|deal_score|price_asc|price_desc|mileage_asc)$"),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    keyword_text = _optional_text_param(keyword)
    if price_availability not in {"priced", "unavailable"}:
        price_availability = "priced"
    if sort not in {"newest", "deal_score", "price_asc", "price_desc", "mileage_asc"}:
        sort = "newest"
    if not isinstance(page, int) or page < 1:
        page = 1
    if not isinstance(size, int) or size < 1:
        size = 10
    size = min(size, 100)

    plan, role = _request_live_access(request, authorization, db)
    free_browse = _is_free_browse_plan(plan, role)
    if free_browse:
        # Free teaser: first page only, capped page size, no deal-score sort.
        page = min(page, FREE_LISTINGS_MAX_PAGE)
        size = min(size, FREE_LISTINGS_MAX_SIZE)
        if sort == "deal_score":
            sort = "newest"

    q = (
        db.query(CarListing)
        .options(
            load_only(
                CarListing.id,
                CarListing.source,
                CarListing.source_id,
                CarListing.url,
                CarListing.title,
                CarListing.make,
                CarListing.model,
                CarListing.year,
                CarListing.price_lkr,
                CarListing.mileage,
                CarListing.fuel_type,
                CarListing.transmission,
                CarListing.engine_capacity,
                CarListing.condition,
                CarListing.body_type,
                CarListing.vehicle_category,
                CarListing.district,
                CarListing.city,
                CarListing.thumbnail_url,
                CarListing.scraped_at,
                CarListing.first_seen_at,
                CarListing.last_seen_at,
                CarListing.deal_score,
                CarListing.market_median_lkr,
                CarListing.is_outlier,
            )
        )
        .filter(live_listing_filter())
    )

    browse_category = None
    if isinstance(vehicle_category, str):
        browse_category = resolve_browse_category(vehicle_category)
    category_clause = category_sql_filter(CarListing, browse_category)
    if category_clause is not None:
        q = q.filter(category_clause)

    if price_availability == "unavailable":
        q = q.filter(or_(CarListing.price_lkr.is_(None), CarListing.price_lkr <= 0))
    else:
        # Cars keep the higher floor; bikes/tuks/etc. can be priced lower.
        min_price = (
            MIN_REASONABLE_PRICE_LKR
            if browse_category in {None, "cars", "car"}
            else 25_000
        )
        q = q.filter(
            CarListing.price_lkr.isnot(None),
            CarListing.price_lkr >= min_price,
        )

    for token in _search_filter_tokens(keyword_text or ""):
        like_pattern = f"%{token}%"
        clauses = [
            CarListing.make.ilike(like_pattern),
            CarListing.model.ilike(like_pattern),
            CarListing.title.ilike(like_pattern),
            CarListing.source_id.ilike(like_pattern),
        ]
        if token.isdigit():
            clauses.append(cast(CarListing.year, String).ilike(like_pattern))
        q = q.filter(or_(*clauses))

    if source:
        normalized_source = _canonical_source(source)
        if normalized_source:
            q = q.filter(_compact_expr(CarListing.source) == normalized_source)

    if make:
        q = q.filter(CarListing.make.ilike(f"%{make}%"))
    if model:
        q = q.filter(CarListing.model.ilike(f"%{model}%"))
    if year_min:
        q = q.filter(CarListing.year >= year_min)
    if year_max:
        q = q.filter(CarListing.year <= year_max)
    if price_min:
        q = q.filter(CarListing.price_lkr >= price_min)
    if price_max:
        q = q.filter(CarListing.price_lkr <= price_max)
    if mileage_max:
        q = q.filter(CarListing.mileage <= mileage_max)
    if fuel_type:
        fuel_filter = _fuel_clause(fuel_type)
        if fuel_filter is not None:
            q = q.filter(fuel_filter)
    if transmission:
        transmission_filter = _transmission_clause(transmission)
        if transmission_filter is not None:
            q = q.filter(transmission_filter)
    if condition:
        normalized_condition = _compact(condition)
        if normalized_condition:
            q = q.filter(_compact_expr(CarListing.condition) == normalized_condition)
    if body_type:
        body_clause = _body_type_clause(body_type)
        if body_clause is not None:
            q = q.filter(body_clause)
    if district:
        normalized_district = " ".join(district.strip().lower().replace("-", " ").split())
        district_slug = normalized_district.replace(" ", "-")
        district_expr = func.lower(func.replace(CarListing.district, "-", " "))
        raw_location_expr = func.lower(func.replace(CarListing.raw_location, "-", " "))
        q = q.filter(
            or_(
                district_expr.ilike(f"%{normalized_district}%"),
                raw_location_expr.ilike(f"%{normalized_district}%"),
                func.lower(CarListing.url).ilike(f"%-for-sale-{district_slug}%"),
            )
        )

    # Sorting
    if price_availability == "unavailable" and sort in {"deal_score", "price_asc", "price_desc"}:
        sort = "newest"

    if sort == "newest":
        q = q.order_by(desc(CarListing.first_seen_at))
    elif sort == "deal_score":
        q = q.filter(CarListing.deal_score.isnot(None)).order_by(desc(CarListing.deal_score))
    elif sort == "price_asc":
        q = q.order_by(CarListing.price_lkr.asc())
    elif sort == "price_desc":
        q = q.order_by(CarListing.price_lkr.desc())
    elif sort == "mileage_asc":
        q = q.order_by(CarListing.mileage.asc())

    count_q = q._clone()
    total = count_q.order_by(None).with_entities(func.count(CarListing.id)).scalar() or 0
    items = q.offset((page - 1) * size).limit(size).all()

    if free_browse:
        # Keep layout data, hide Pro pricing signals from free responses.
        for item in items:
            item.deal_score = None
            item.market_median_lkr = None

    return ListingsResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total > 0 else 0,
    )


@router.get("/price-drops", response_model=PriceDropsResponse)
def get_price_drops(
    request: Request,
    days: int = Query(7, ge=1, le=30),
    limit: int = Query(20, ge=1, le=50),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Biggest recorded price cuts in the window, live listings only.

    A cut is a history point lower than the immediately-preceding tracked
    price for the same vehicle (LAG window over vehicle_price_history).
    """
    plan, role = _request_live_access(request, authorization, db)
    if _is_free_browse_plan(plan, role):
        limit = min(limit, FREE_PRICE_DROPS_LIMIT)

    cutoff = utc_now() - timedelta(days=days)

    prev_price = (
        func.lag(VehiclePriceHistory.price_lkr)
        .over(
            partition_by=VehiclePriceHistory.vehicle_id,
            order_by=(VehiclePriceHistory.scraped_at, VehiclePriceHistory.id),
        )
        .label("prev_price")
    )
    ordered = (
        db.query(
            VehiclePriceHistory.vehicle_id.label("vehicle_id"),
            VehiclePriceHistory.price_lkr.label("new_price"),
            VehiclePriceHistory.scraped_at.label("dropped_at"),
            prev_price,
        )
    ).subquery("ordered_history")

    drops = (
        db.query(
            ordered.c.vehicle_id,
            ordered.c.new_price,
            ordered.c.prev_price,
            ordered.c.dropped_at,
        )
        .filter(
            ordered.c.prev_price.isnot(None),
            ordered.c.new_price < ordered.c.prev_price,
            ordered.c.dropped_at >= cutoff,
        )
        .subquery("drops")
    )

    rows = (
        db.query(
            CarListing,
            drops.c.new_price,
            drops.c.prev_price,
            drops.c.dropped_at,
        )
        .join(drops, drops.c.vehicle_id == CarListing.id)
        .filter(live_listing_filter(), CarListing.is_duplicate == False)  # noqa: E712
        .order_by(desc((drops.c.prev_price - drops.c.new_price) / drops.c.prev_price))
        .limit(limit)
        .all()
    )

    items = []
    seen_ids: set[int] = set()
    for listing, new_price, prev, dropped_at in rows:
        if listing.id in seen_ids:
            continue  # keep only each vehicle's largest cut in the window
        seen_ids.add(listing.id)
        prev_f = float(prev)
        new_f = float(new_price)
        items.append(
            {
                "listing": listing,
                "previous_price_lkr": prev_f,
                "new_price_lkr": new_f,
                "drop_pct": round((prev_f - new_f) / prev_f * 100, 1),
                "dropped_at": dropped_at,
            }
        )

    return {"items": items, "window_days": days}


@router.get("/sources")
def get_sources(db: Session = Depends(get_db)):
    source_expr = _compact_expr(CarListing.source)
    rows = (
        db.query(source_expr.label("source_key"), func.count(CarListing.id).label("count"))
        .filter(live_listing_filter(), CarListing.source.isnot(None))
        .group_by(source_expr)
        .order_by(desc("count"))
        .all()
    )

    counts: dict[str, int] = {}
    for row in rows:
        source_key = _canonical_source(str(row.source_key or ""))
        if not source_key:
            continue
        counts[source_key] = counts.get(source_key, 0) + int(row.count or 0)

    return [
        {
            "source": key,
            "label": SOURCE_LABELS.get(key, key.replace("-", " ").title()),
            "count": value,
        }
        for key, value in sorted(counts.items(), key=lambda item: item[1], reverse=True)
    ]

@router.get("/sitemap-ids")
def get_sitemap_listing_ids(
    limit: Annotated[int, Query(ge=1, le=20000)] = 5000,
    offset: Annotated[int, Query(ge=0)] = 0,
    db: Session = Depends(get_db),
):
    """Recent listing IDs + content-change timestamps for sitemap generation.

    ``content_updated_at`` is preferred (price / status changes only). Falls
    back to ``first_seen_at`` then ``last_seen_at`` for legacy rows.
    """
    rows = (
        db.query(
            CarListing.id,
            CarListing.content_updated_at,
            CarListing.first_seen_at,
            CarListing.last_seen_at,
        )
        .filter(live_listing_filter(), CarListing.is_duplicate == False)
        .order_by(desc(CarListing.last_seen_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": int(row.id),
            "content_updated_at": (
                row.content_updated_at.isoformat() if row.content_updated_at else None
            ),
            "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
            "first_seen_at": row.first_seen_at.isoformat() if row.first_seen_at else None,
        }
        for row in rows
    ]


@router.get("/sitemap-count")
def get_sitemap_listing_count(db: Session = Depends(get_db)):
    """Total clean listings available for chunked sitemap generation."""
    total = (
        db.query(func.count(CarListing.id))
        .filter(live_listing_filter(), CarListing.is_duplicate == False)
        .scalar()
    )
    return {"total": int(total or 0), "page_size": 5000}

@router.get("/makes")
def get_makes(db: Session = Depends(get_db)):
    results = (
        db.query(CarListing.make, func.count(CarListing.id).label("count"))
        .filter(live_listing_filter(), CarListing.make.isnot(None))
        .group_by(CarListing.make)
        .order_by(desc("count"))
        .all()
    )
    # Fold duplicate/typo spellings ("Bmw"/"BMW", "Mitshubishi") into one
    # brand and drop junk rows ("Test", "2018", "Other brand") so the public
    # make combobox never offers a scraped typo as a car brand.
    merged: Dict[str, int] = {}
    for r in results:
        canonical = canonicalize_make(r.make)
        if not canonical:
            continue
        merged[canonical] = merged.get(canonical, 0) + int(r.count or 0)
    return [
        {"make": make, "count": count}
        for make, count in sorted(merged.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


@router.get("/models")
def get_models(make: str, db: Session = Depends(get_db)):
    canonical_make = canonicalize_make(make)
    if not canonical_make:
        return []

    # Always resolve every stored spelling of the brand, not just the exact one
    # the caller typed — otherwise "Toyota" and "toyota" return different model
    # lists and the valuation dropdown silently loses models.
    variants = [
        r.make
        for r in (
            db.query(CarListing.make)
            .filter(live_listing_filter(), CarListing.make.isnot(None))
            .distinct()
            .all()
        )
        if canonicalize_make(r.make) == canonical_make
    ]
    if not variants:
        return []

    results = (
        db.query(CarListing.model, func.count(CarListing.id).label("count"))
        .filter(CarListing.make.in_(variants), live_listing_filter())
        .group_by(CarListing.model)
        .order_by(desc("count"))
        .all()
    )

    merged: Dict[str, Dict[str, int]] = {}
    for r in results:
        model = canonicalize_model(r.model)
        if not model:
            continue
        # Merge case variants ("Wira"/"wira") under one canonical key.
        key = compact_key(model)
        bucket = merged.get(key)
        if bucket is None:
            merged[key] = {"model": model, "count": int(r.count or 0)}
        else:
            if int(r.count or 0) > bucket["count"]:
                bucket["model"] = model
            bucket["count"] += int(r.count or 0)
    return [
        {"model": bucket["model"], "count": bucket["count"]}
        for bucket in sorted(merged.values(), key=lambda b: (-b["count"], b["model"]))
    ]


@router.get("/nhtsa-models")
def get_nhtsa_models(make: str = Query(..., min_length=1, max_length=100)):
    """Return NHTSA vPIC catalog models for a manufacturer (public, cached 5 min)."""
    rows = _nhtsa_fetch_models(make)
    return {"make": make, "count": len(rows), "models": rows}


def _search_suggestion_score(row: CarListing, normalized_query: str, query_tokens: List[str]) -> int:
    make = str(getattr(row, "make", "") or "").strip().lower()
    model = str(getattr(row, "model", "") or "").strip().lower()
    title = str(getattr(row, "title", "") or "").strip().lower()
    make_model = " ".join(part for part in [make, model] if part).strip()

    score = 0

    if make_model and make_model == normalized_query:
        score += 180
    elif make_model and make_model.startswith(normalized_query):
        score += 150
    elif make_model and normalized_query in make_model:
        score += 110

    if model and model.startswith(normalized_query):
        score += 70
    elif model and normalized_query in model:
        score += 45

    if make and make.startswith(normalized_query):
        score += 40
    elif make and normalized_query in make:
        score += 28

    if title and normalized_query in title:
        score += 22

    if query_tokens and all(token in make_model for token in query_tokens if token):
        score += 35

    if getattr(row, "price_lkr", None) is not None:
        score += 4

    return score


def search_listing_suggestions(q: str, limit: int, db: Session) -> List[dict]:
    normalized_query = " ".join(str(q or "").strip().split()).lower()
    if not normalized_query:
        return []

    query_tokens = [token for token in normalized_query.split(" ") if token]
    like_pattern = f"%{normalized_query}%"

    rows = (
        db.query(CarListing)
        .filter(
            live_listing_filter(),
            or_(
                CarListing.make.ilike(like_pattern),
                CarListing.model.ilike(like_pattern),
                CarListing.title.ilike(like_pattern),
            ),
        )
        .order_by(desc(CarListing.first_seen_at))
        .limit(max(limit * 8, 50))
        .all()
    )

    ranked_rows = sorted(
        rows,
        key=lambda row: (
            _search_suggestion_score(row, normalized_query, query_tokens),
            (
                getattr(row, "first_seen_at", None).timestamp()
                if getattr(row, "first_seen_at", None) is not None
                else 0.0
            ),
        ),
        reverse=True,
    )

    suggestions: List[dict] = []

    for row in ranked_rows:
        make = str(getattr(row, "make", "") or "").strip()
        model = str(getattr(row, "model", "") or "").strip()
        year = getattr(row, "year", None)
        if not make or not model or year is None:
            continue

        price_value = getattr(row, "price_lkr", None)
        suggestions.append(
            {
                "id": int(getattr(row, "id")),
                "make": make,
                "model": model,
                "year": int(year),
                "district": getattr(row, "district", None),
                "price_lkr": float(price_value) if price_value is not None else None,
                "source": str(getattr(row, "source", "") or "").strip(),
                "thumbnail_url": getattr(row, "thumbnail_url", None),
                "url": getattr(row, "url", None),
            }
        )

        if len(suggestions) >= limit:
            break

    return suggestions


@router.get("/search-suggestions", response_model=List[ListingSearchSuggestion])
def get_search_suggestions(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
):
    return search_listing_suggestions(q=q, limit=limit, db=db)

@router.get("/estimate")
def estimate_price(
    make: str,
    model: str,
    year: int,
    mileage: Optional[int] = None,
    condition: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Price estimator: returns market range for a given make/model/year."""
    q = db.query(
        func.avg(CarListing.price_lkr).label("avg"),
        func.min(CarListing.price_lkr).label("min"),
        func.max(CarListing.price_lkr).label("max"),
        func.count(CarListing.id).label("count"),
    ).filter(
        CarListing.make.ilike(make),
        CarListing.model.ilike(model),
        CarListing.year == year,
        live_listing_filter(),
        CarListing.price_lkr.isnot(None),
    )
    if condition:
        q = q.filter(CarListing.condition == condition)

    result = q.first()

    if not result or result.count == 0:
        raise HTTPException(status_code=404, detail="Not enough data to estimate price for this vehicle.")

    avg = float(result.avg)
    # P25/P75 approximation (±15% of mean)
    return {
        "make": make,
        "model": model,
        "year": year,
        "estimated_price_lkr": round(avg, 2),
        "price_range_low": round(avg * 0.85, 2),
        "price_range_high": round(avg * 1.15, 2),
        "min_seen_lkr": round(float(result.min), 2),
        "max_seen_lkr": round(float(result.max), 2),
        "comparable_listings": result.count,
    }


def _percentile(sorted_values: List[float], ratio: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    position = (len(sorted_values) - 1) * ratio
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return float(sorted_values[lower])
    lower_value = float(sorted_values[lower])
    upper_value = float(sorted_values[upper])
    return lower_value + (upper_value - lower_value) * (position - lower)


def _adjust_price_for_mileage(
    price_lkr: float,
    target_mileage_km: Optional[int],
    comparable_mileage_km: Optional[int],
) -> float:
    base_price = max(float(price_lkr), 0.0)
    if target_mileage_km is None or comparable_mileage_km is None:
        return round(base_price, 2)

    # Keep calibration conservative: cap mileage impact to +/-20%.
    mileage_delta = float(target_mileage_km) - float(comparable_mileage_km)
    adjustment_ratio = (mileage_delta / 100_000.0) * 0.06
    adjustment_ratio = max(min(adjustment_ratio, 0.20), -0.20)
    adjusted = base_price * (1.0 - adjustment_ratio)
    return round(max(adjusted, 0.0), 2)


def _is_high_quality_comparable(row: CarListing, payload: CustomVehicleEstimateRequest) -> bool:
    if getattr(row, "price_lkr", None) is None:
        return False

    if payload.model and _model_match_rank(getattr(row, "model", None), payload.model) == 0:
        return False

    row_year = getattr(row, "year", None)
    if payload.year is not None and (row_year is None or abs(int(row_year) - int(payload.year)) > 2):
        return False

    if payload.mileage_km is not None:
        row_mileage = getattr(row, "mileage", None)
        if row_mileage is not None and abs(int(row_mileage) - int(payload.mileage_km)) > 120_000:
            return False

    return True


def _filter_high_quality_rows(
    rows: List[CarListing],
    payload: CustomVehicleEstimateRequest,
    min_count: int = 2,
) -> List[CarListing]:
    filtered = [row for row in rows if _is_high_quality_comparable(row, payload)]
    if len(filtered) >= min_count:
        return filtered

    # Prefer relevance over volume: if at least one model-aligned comparable exists,
    # keep that subset rather than reintroducing unrelated rows.
    if payload.model and filtered:
        return filtered

    return rows


def _calibrated_price_points(rows: List[CarListing], payload: CustomVehicleEstimateRequest) -> List[float]:
    prices: List[float] = []
    for row in rows:
        row_price = getattr(row, "price_lkr", None)
        if row_price is None:
            continue
        prices.append(
            _adjust_price_for_mileage(
                float(row_price),
                target_mileage_km=payload.mileage_km,
                comparable_mileage_km=getattr(row, "mileage", None),
            )
        )
    return sorted(prices)


def _vehicle_filter_query(
    db: Session,
    payload: CustomVehicleEstimateRequest,
    looseness: int = 0,
    relax_model: bool = False,
    ignore_optional: bool = False,
    ignore_district: bool = False,
):
    q = db.query(CarListing).filter(
        live_listing_filter(),
        CarListing.price_lkr.isnot(None),
    )

    if payload.make:
        q = q.filter(CarListing.make.ilike(f"%{payload.make}%"))
    if payload.model and not relax_model:
        model_filter = _model_clause(payload.model)
        if model_filter is not None:
            q = q.filter(model_filter)
    if payload.year:
        q = q.filter(CarListing.year.between(payload.year - looseness, payload.year + looseness))
    if payload.condition and not ignore_optional:
        condition_key = _compact(payload.condition)
        if condition_key:
            q = q.filter(_compact_expr(CarListing.condition) == condition_key)
    if payload.transmission and not ignore_optional:
        transmission_filter = _transmission_clause(payload.transmission)
        if transmission_filter is not None:
            q = q.filter(transmission_filter)
    if payload.fuel_type and not ignore_optional:
        fuel_filter = _fuel_clause(payload.fuel_type)
        if fuel_filter is not None:
            q = q.filter(fuel_filter)
    if payload.body_type and not ignore_optional:
        body_clause = _body_type_clause(payload.body_type)
        if body_clause is not None:
            q = q.filter(body_clause)
    if payload.district and not ignore_district:
        normalized_district = " ".join(payload.district.strip().lower().replace("-", " ").split())
        district_slug = normalized_district.replace(" ", "-")
        district_expr = func.lower(func.replace(CarListing.district, "-", " "))
        q = q.filter(
            or_(
                district_expr.ilike(f"%{normalized_district}%"),
                func.lower(CarListing.url).ilike(f"%-for-sale-{district_slug}%"),
            )
        )

    return q


@router.post("/custom-estimate", response_model=CustomVehicleEstimateResponse)
def estimate_custom_vehicle(payload: CustomVehicleEstimateRequest, db: Session = Depends(get_db)):
    strategies = [
        {"looseness": 0, "relax_model": False, "ignore_optional": False, "ignore_district": False, "label": "exact match"},
        {"looseness": 0, "relax_model": False, "ignore_optional": False, "ignore_district": True, "label": "no-district match"},
        {"looseness": 0, "relax_model": False, "ignore_optional": True, "ignore_district": True, "label": "make-model-year match"},
        {"looseness": 1, "relax_model": True, "ignore_optional": True, "ignore_district": True, "label": "make-level match"},
        {"looseness": 3, "relax_model": True, "ignore_optional": True, "ignore_district": True, "label": "broader market match"},
    ]

    chosen_rows = []
    chosen_label = "exact match"
    for strategy in strategies:
        query = _vehicle_filter_query(
            db,
            payload,
            looseness=strategy["looseness"],
            relax_model=strategy["relax_model"],
            ignore_optional=strategy["ignore_optional"],
            ignore_district=strategy["ignore_district"],
        )
        rows = query.order_by(desc(CarListing.deal_score), desc(CarListing.first_seen_at)).limit(60).all()
        if payload.model:
            rows = sorted(rows, key=lambda row: _comparable_sort_key(row, payload.model), reverse=True)
        chosen_rows = rows[:30]
        if len(chosen_rows) >= 2:
            chosen_label = strategy["label"]
            break
        if not chosen_rows:
            chosen_label = strategy["label"]

    if not chosen_rows:
        raise HTTPException(status_code=404, detail="Not enough comparable listings for this custom vehicle.")

    quality_rows = _filter_high_quality_rows(chosen_rows, payload, min_count=2)
    prices = _calibrated_price_points(quality_rows, payload)
    if not prices:
        raise HTTPException(status_code=404, detail="Not enough comparable listings for this custom vehicle.")

    med = float(median(prices))
    low = _percentile(prices, 0.25) if len(prices) >= 4 else round(med * 0.9, 2)
    high = _percentile(prices, 0.75) if len(prices) >= 4 else round(med * 1.1, 2)
    comparable_count = len(prices)
    quality_ratio = comparable_count / max(len(chosen_rows), 1)

    if comparable_count >= 12:
        confidence = "high"
    elif comparable_count >= 5:
        confidence = "medium"
    else:
        confidence = "low"

    if quality_ratio < 0.55 and confidence == "high":
        confidence = "medium"
    if quality_ratio < 0.35 and confidence in {"high", "medium"}:
        confidence = "low"

    asking = payload.asking_price_lkr
    delta_pct = None
    verdict = "Add an asking price to compare against the market band."
    verdict_label = "Price not provided"

    if asking is not None and med > 0:
        delta_pct = round(((asking - med) / med) * 100, 1)
        if asking <= low:
            verdict_label = "Good value"
            verdict = "This asking price sits below the current market band and looks competitive."
        elif asking <= high:
            verdict_label = "Fair price"
            verdict = "This asking price is within the expected market band for comparable listings."
        else:
            verdict_label = "Above market"
            verdict = "This asking price is above the current market band and may need negotiation."

    comparables = [
        ComparableVehicle(
            id=row.id,
            title=row.title or f"{row.make} {row.model} ({row.year})",
            price_lkr=float(row.price_lkr) if row.price_lkr is not None else None,
            district=row.district,
            deal_score=float(row.deal_score) if row.deal_score is not None else None,
            detail_url=f"/listing/{row.id}",
            external_url=row.url,
        )
        for row in quality_rows[:6]
    ]

    mileage_note = "mileage-adjusted" if payload.mileage_km is not None else "raw-price"
    screened_count = len(quality_rows)

    return CustomVehicleEstimateResponse(
        vehicle_label=f"{payload.make} {payload.model} ({payload.year})",
        estimated_low_lkr=round(low, 2),
        estimated_median_lkr=round(med, 2),
        estimated_high_lkr=round(high, 2),
        comparable_count=comparable_count,
        confidence=confidence,
        verdict=verdict,
        verdict_label=verdict_label,
        delta_pct=delta_pct,
        methodology=(
            f"{chosen_label}; quality-screened {screened_count}/{len(chosen_rows)} listings "
            f"with {mileage_note} calibration from {comparable_count} comparables."
        ),
        comparables=comparables,
    )


def _source_display_name(source: Optional[str]) -> str:
    key = str(source or "").strip().lower()
    return SOURCE_LABELS.get(key) or (str(source).strip() if source else "the original listing site")


@router.get("/{listing_id}/seller-profile", status_code=410)
def get_seller_profile(listing_id: int, db: Session = Depends(get_db)):
    """Retired: MotorMila no longer fetches or republishes seller contact data.

    Seller names, phone and WhatsApp numbers are personal data (PDPA No. 9 of
    2022). Buyers are sent to the source listing to contact the seller.
    See docs/legal/data-sourcing.md.
    """
    listing = db.query(CarListing).filter(CarListing.id == listing_id).first()
    source = getattr(listing, "source", None) if listing else None
    source_url = str(getattr(listing, "url", "") or "") if listing else ""
    label = _source_display_name(source)
    return JSONResponse(
        status_code=410,
        content={
            "detail": f"Contact the seller on {label}",
            "source": source or None,
            "source_url": source_url or None,
        },
    )


@router.get("/{listing_id}/thumbnail-proxy", status_code=410)
def get_listing_thumbnail_proxy(listing_id: int):
    """Retired: MotorMila does not download or re-serve source photos.

    Images are only linked to their original host with a source credit.
    """
    return JSONResponse(
        status_code=410,
        content={"detail": "Thumbnail proxy retired; images are linked from the source site."},
    )


@router.get("/{listing_id}/fmv")
def get_listing_fmv(listing_id: int, db: Session = Depends(get_db)):
    """Fair Market Value — OLS multi-feature model with median fallback."""
    listing = db.query(CarListing).filter(CarListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")

    return predict_listing_fmv(db, listing)


@router.get("/{listing_id}/safety-research")
def get_listing_safety_research(listing_id: int, db: Session = Depends(get_db)):
    """US NHTSA + ProblemsByVin research card. Never fails the listing page."""
    listing = db.query(CarListing).filter(CarListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")
    return combined_research(
        year=listing.year,
        make=listing.make,
        model=listing.model,
        db=db,
        listing_id=listing.id,
    )


@router.get("/{listing_id}/geo")
def get_listing_geo(listing_id: int, db: Session = Depends(get_db)):
    """Geocoded ad-location pin. Never mutates raw_location; never 500s the listing page."""
    listing = db.query(CarListing).filter(CarListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")
    return enrich_listing(db, listing)


@router.get("/{listing_id}/price-history", response_model=PriceHistoryResponse)
def get_listing_price_history(listing_id: int, db: Session = Depends(get_db)):
    listing = db.query(CarListing).filter(CarListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")

    rows = (
        db.query(VehiclePriceHistory)
        .filter(VehiclePriceHistory.vehicle_id == listing_id)
        .order_by(VehiclePriceHistory.scraped_at.asc())
        .all()
    )

    points = [
        {"price_lkr": float(row.price_lkr), "scraped_at": row.scraped_at}
        for row in rows
    ]
    summary = summarize_price_history(points)

    return {
        "listing_id": listing_id,
        "points": points,
        **summary,
    }

@router.get("/{listing_id}/history-report", response_model=HistoryReportResponse)
def get_listing_history_report(listing_id: int, db: Session = Depends(get_db)):
    """Per-vehicle dossier: price trajectory, days-on-market, cross-source
    relistings, and fraud signals (odometer inconsistency, multi-listing)."""
    listing = db.query(CarListing).filter(CarListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")
    return build_history_report(db, listing)


@router.get("/{listing_id}", response_model=CarListingRead)
def get_listing(
    listing_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    listing = db.query(CarListing).filter(CarListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")
    plan, role = _request_live_access(request, authorization, db)
    if _is_free_browse_plan(plan, role):
        listing.deal_score = None
        listing.market_median_lkr = None
    return listing

@router.get("/{listing_id}/similar", response_model=List[CarListingRead])
def get_similar_listings(
    listing_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    listing = db.query(CarListing).filter(CarListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")

    # Simple similarity: same make, similar price range (+/- 20%), exclude self.
    # Listings without a usable price fall back to same make+model instead of a
    # price band (float(None) previously crashed this endpoint with a 500).
    filters = [
        CarListing.id != listing_id,
        CarListing.make == listing.make,
        live_listing_filter(),
    ]

    base_price = float(listing.price_lkr) if listing.price_lkr is not None else 0.0
    if base_price > 0:
        filters.append(CarListing.price_lkr.between(base_price * 0.8, base_price * 1.2))
    else:
        filters.append(CarListing.model == listing.model)

    plan, role = _request_live_access(request, authorization, db)
    free_browse = _is_free_browse_plan(plan, role)
    limit = FREE_SIMILAR_LIMIT if free_browse else 6

    similar = (
        db.query(CarListing)
        .filter(*filters)
        .limit(limit)
        .all()
    )

    if free_browse:
        for row in similar:
            row.deal_score = None
            row.market_median_lkr = None

    return similar
