from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import re

from app.utils.thumbnail_urls import parse_image_list, upgrade_thumbnail_url


def _upgrade_thumbnail(value: Optional[str]) -> Optional[str]:
    """Pydantic validator shared by every schema that carries a card image."""
    return upgrade_thumbnail_url(value)


def _parse_gallery(value) -> Optional[List[str]]:
    """The DB stores ``CarListing.images`` as a JSON string; the API serves a list."""
    urls = parse_image_list(value)
    if not urls:
        return None
    return [upgrade_thumbnail_url(url) or url for url in urls]


class CarListingBase(BaseModel):
    source: str
    source_id: str
    url: str
    title: Optional[str] = None
    make: str
    model: str
    year: Optional[int] = None
    price_lkr: Optional[Decimal] = None
    mileage: Optional[int] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    engine_capacity: Optional[int] = None
    condition: Optional[str] = None
    body_type: Optional[str] = None
    vehicle_category: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    thumbnail_url: Optional[str] = None
    images: Optional[List[str]] = None

    @field_validator("thumbnail_url")
    @classmethod
    def _upgrade_thumbnail_url(cls, value: Optional[str]) -> Optional[str]:
        return _upgrade_thumbnail(value)

    @field_validator("images", mode="before")
    @classmethod
    def _parse_gallery_images(cls, value) -> Optional[List[str]]:
        return _parse_gallery(value)

class CarListingRead(CarListingBase):
    id: int
    scraped_at: datetime
    first_seen_at: datetime
    last_seen_at: datetime
    deal_score: Optional[Decimal] = None
    market_median_lkr: Optional[Decimal] = None
    is_outlier: bool
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)

class ListingsResponse(BaseModel):
    items: List[CarListingRead]
    total: int
    page: int
    size: int
    pages: int


class ListingSearchSuggestion(BaseModel):
    id: int
    make: str
    model: str
    year: int
    district: Optional[str] = None
    price_lkr: Optional[float] = None
    source: str
    thumbnail_url: Optional[str] = None
    url: Optional[str] = None

    @field_validator("thumbnail_url")
    @classmethod
    def _upgrade_suggestion_thumbnail(cls, value: Optional[str]) -> Optional[str]:
        return _upgrade_thumbnail(value)

class StatsSummary(BaseModel):
    total_listings: int
    avg_price_lkr: Optional[float] = None
    price_change_mom: Optional[float] = None  # Month over month
    good_deals_count: int
    listings_this_week: int
    districts_covered: int
    district_count: Optional[int] = None
    source_count: int = 0
    last_updated: Optional[datetime] = None

class DistrictPrice(BaseModel):
    district: str
    count: int
    avg_price_lkr: float
    median_price_lkr: float


class SegmentPerformancePoint(BaseModel):
    segment: str
    listing_count: int
    avg_price_lkr: float
    change_pct_30d: Optional[float] = None


class TrendingModelPoint(BaseModel):
    make: str
    model: str
    listing_count: int
    avg_price_lkr: float
    movement_pct: Optional[float] = None
    thumbnail_url: Optional[str] = None

    @field_validator("thumbnail_url")
    @classmethod
    def _upgrade_trending_thumbnail(cls, value: Optional[str]) -> Optional[str]:
        return _upgrade_thumbnail(value)


class HotDealPoint(BaseModel):
    id: int
    make: str
    model: str
    year: Optional[int] = None
    district: Optional[str] = None
    source: str
    price_lkr: float
    deal_score: float
    thumbnail_url: Optional[str] = None

    @field_validator("thumbnail_url")
    @classmethod
    def _upgrade_hot_deal_thumbnail(cls, value: Optional[str]) -> Optional[str]:
        return _upgrade_thumbnail(value)


class DashboardInsightsResponse(BaseModel):
    new_listings_24h: int
    segment_performance: List[SegmentPerformancePoint]
    trending_models: List[TrendingModelPoint]
    hot_deals: List[HotDealPoint]


class DistrictTopModel(BaseModel):
    make: str
    model: str
    listing_count: int
    avg_price_lkr: float


class DistrictQuickInsightResponse(BaseModel):
    district: str
    listing_count: int
    avg_price_lkr: Optional[float] = None
    median_price_lkr: Optional[float] = None
    change_pct_30d: Optional[float] = None
    top_models: List[DistrictTopModel]


class FeedbackCreate(BaseModel):
    category: str = Field(default="general", min_length=2, max_length=30)
    route: Optional[str] = Field(default=None, max_length=500)
    message: str = Field(min_length=8, max_length=2000)
    email: Optional[str] = Field(default=None, max_length=255)


class FeedbackRead(BaseModel):
    id: int
    category: str
    route: Optional[str] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnalyticsEventCreate(BaseModel):
    event: str = Field(min_length=1, max_length=120)
    properties: Optional[dict] = None
    session_id: Optional[str] = Field(default=None, max_length=64)


class AnalyticsEventRead(BaseModel):
    id: int
    event: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProListingSample(BaseModel):
    id: int
    title: str
    make: str
    model: str
    year: Optional[int] = None
    price_lkr: Optional[float] = None
    district: Optional[str] = None
    source: str
    deal_score: Optional[float] = None
    thumbnail_url: Optional[str] = None
    detail_url: Optional[str] = None
    external_url: Optional[str] = None
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None


class ProBreakdownPoint(BaseModel):
    label: str
    count: int
    share_pct: float
    avg_price_lkr: Optional[float] = None
    latest_seen_at: Optional[datetime] = None


class ProTrendPoint(BaseModel):
    month: str
    avg_price_lkr: Optional[float] = None
    median_price_lkr: Optional[float] = None
    listing_count: int


class ProMetric(BaseModel):
    label: str
    value: str
    detail: Optional[str] = None


class ProMarketSnapshot(BaseModel):
    generated_at: datetime
    total_listings: int
    avg_price_lkr: Optional[float] = None
    median_price_lkr: Optional[float] = None
    min_price_lkr: Optional[float] = None
    max_price_lkr: Optional[float] = None
    new_listings_7d: int
    districts_covered: int
    source_count: int
    hot_deal_count: int
    last_updated: Optional[datetime] = None
    source_coverage: List[ProBreakdownPoint]
    top_opportunities: List[ProListingSample]


class ProVehicleLane(BaseModel):
    make: str
    model: str
    listing_count: int
    avg_price_lkr: Optional[float] = None
    median_price_lkr: Optional[float] = None
    min_price_lkr: Optional[float] = None
    max_price_lkr: Optional[float] = None
    avg_deal_score: Optional[float] = None
    district_count: int
    source_count: int
    top_district: Optional[str] = None
    top_source: Optional[str] = None
    latest_seen_at: Optional[datetime] = None


class ProDistrictProfile(BaseModel):
    district: str
    listing_count: int
    avg_price_lkr: Optional[float] = None
    median_price_lkr: Optional[float] = None
    min_price_lkr: Optional[float] = None
    max_price_lkr: Optional[float] = None
    source_count: int
    top_make: Optional[str] = None
    top_model: Optional[str] = None
    latest_seen_at: Optional[datetime] = None
    top_models: List[DistrictTopModel]
    source_mix: List[ProBreakdownPoint]
    sample_listings: List[ProListingSample]


class ProDetailPayload(BaseModel):
    kind: str
    title: str
    summary: str
    generated_at: datetime
    metrics: List[ProMetric]
    source_mix: List[ProBreakdownPoint]
    district_mix: List[ProBreakdownPoint]
    trend_points: List[ProTrendPoint]
    sample_listings: List[ProListingSample]


class SellerProfileResponse(BaseModel):
    source: str
    source_url: str
    seller_name: Optional[str] = None
    seller_type: str = "unknown"
    member_since: Optional[str] = None
    listing_count: Optional[int] = None
    review_count: Optional[int] = None
    rating: Optional[float] = None
    phone_numbers: List[str] = Field(default_factory=list)
    whatsapp_numbers: List[str] = Field(default_factory=list)
    verified_badges: List[str] = Field(default_factory=list)
    fetched_at: datetime


class HistoryReportFlag(BaseModel):
    kind: str
    severity: str
    detail: str


class HistoryReportRelatedListing(BaseModel):
    id: int
    source: str
    title: str
    price_lkr: Optional[float] = None
    mileage: Optional[int] = None
    first_seen_at: Optional[datetime] = None
    is_active: bool = True
    confidence: str


class HistoryReportResponse(BaseModel):
    listing_id: int
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    days_on_market: Optional[int] = None
    is_active: bool = True
    price_points: List["PriceHistoryPoint"]
    price_cuts: int
    total_change_pct: Optional[float] = None
    related_listings: List[HistoryReportRelatedListing]
    flags: List[HistoryReportFlag]
    disclaimer: str


class CollateralValueResponse(BaseModel):
    make: str
    model: str
    year: Optional[int] = None
    market_median_lkr: Optional[float] = None
    p25_lkr: Optional[float] = None
    p75_lkr: Optional[float] = None
    comparable_count: int
    live_supply: int
    median_days_on_market: Optional[float] = None
    trend_3m_pct: Optional[float] = None
    confidence: str
    computed_at: datetime
    methodology: str


class PriceIndexPoint(BaseModel):
    period: str
    index_value: float
    median_price_lkr: float
    listing_count: int
    mom_change_pct: Optional[float] = None


class PriceIndexResponse(BaseModel):
    base_period: Optional[str] = None
    latest_period: Optional[str] = None
    points: List[PriceIndexPoint]
    segments: dict
    methodology: str


class PriceDropItem(BaseModel):
    listing: "CarListingRead"
    previous_price_lkr: float
    new_price_lkr: float
    drop_pct: float
    dropped_at: datetime


class PriceDropsResponse(BaseModel):
    items: List[PriceDropItem]
    window_days: int


class PriceHistoryPoint(BaseModel):
    price_lkr: float
    scraped_at: datetime


class PriceHistoryResponse(BaseModel):
    listing_id: int
    points: List[PriceHistoryPoint]
    first_price_lkr: Optional[float] = None
    current_price_lkr: Optional[float] = None
    change_pct: Optional[float] = None
    cut_count: int = 0
    raise_count: int = 0
    highest_price_lkr: Optional[float] = None
    lowest_price_lkr: Optional[float] = None
    last_change_at: Optional[datetime] = None
    tracked_points: int = 0


class ComparableVehicle(BaseModel):
    id: int
    title: str
    price_lkr: Optional[float] = None
    district: Optional[str] = None
    deal_score: Optional[float] = None
    detail_url: Optional[str] = None
    external_url: Optional[str] = None


class CustomVehicleEstimateRequest(BaseModel):
    make: str
    model: str
    year: int
    mileage_km: Optional[int] = None
    condition: Optional[str] = None
    transmission: Optional[str] = None
    fuel_type: Optional[str] = None
    body_type: Optional[str] = None
    district: Optional[str] = None
    asking_price_lkr: Optional[float] = None


class CustomVehicleEstimateResponse(BaseModel):
    vehicle_label: str
    estimated_low_lkr: float
    estimated_median_lkr: float
    estimated_high_lkr: float
    comparable_count: int
    confidence: str
    verdict: str
    verdict_label: str
    delta_pct: Optional[float] = None
    methodology: str
    comparables: List[ComparableVehicle]


class MarketSignalRead(BaseModel):
    id: int
    source: str
    signal_type: str
    period_year: Optional[int] = None
    period_month: Optional[int] = None
    metric: str
    category: Optional[str] = None
    value_numeric: Optional[Decimal] = None
    unit: Optional[str] = None
    source_url: str
    observed_at: datetime
    raw_meta: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


class ImportPriceSnapshotRead(BaseModel):
    id: int
    source: str
    source_id: str
    observed_at: datetime
    url: str
    title: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    price_lkr: Optional[Decimal] = None
    mileage: Optional[int] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    body_type: Optional[str] = None
    source_market: Optional[str] = None
    raw_meta: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


class DistrictVelocityPoint(BaseModel):
    district: str
    lat: float
    lng: float
    listing_count: int
    new_7d_count: int
    velocity_score: float


class DistrictVelocityResponse(BaseModel):
    points: List[DistrictVelocityPoint]
    generated_at: datetime


class MarketAlertCreate(BaseModel):
    make: Optional[str] = Field(default=None, max_length=50)
    model: Optional[str] = Field(default=None, max_length=100)
    max_price: Optional[float] = Field(default=None, gt=0)
    district: Optional[str] = Field(default=None, max_length=50)
    notify_phone: Optional[str] = Field(default=None, max_length=32)
    notify_email: Optional[str] = Field(default=None, max_length=255)
    notify_telegram_chat_id: Optional[str] = Field(default=None, max_length=64)
    notify_channels: Optional[str] = Field(default=None, max_length=64)
    delivery_mode: Optional[str] = Field(default=None, max_length=16)
    quiet_hours_enabled: Optional[bool] = Field(default=None)

    @field_validator("delivery_mode")
    @classmethod
    def validate_delivery_mode(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip().lower()
        if not trimmed:
            return None
        if trimmed not in ("instant", "digest"):
            raise ValueError("delivery_mode must be 'instant' or 'digest'")
        return trimmed

    @field_validator("notify_phone")
    @classmethod
    def validate_notify_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        digits = re.sub(r"[^\d+]", "", trimmed)
        if digits.startswith("+"):
            body = digits[1:]
            ok = bool(re.fullmatch(r"\d{10,15}", body))
        elif re.fullmatch(r"0\d{9}", digits) or re.fullmatch(r"94\d{9}", digits):
            ok = True
        else:
            ok = bool(re.fullmatch(r"\d{10,15}", digits))
        if not ok:
            raise ValueError("notify_phone must be a valid mobile (e.g. 0771234567 or +94771234567)")
        return trimmed

    @field_validator("notify_email")
    @classmethod
    def validate_notify_email(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", trimmed):
            raise ValueError("notify_email must be a valid email address")
        return trimmed

    @field_validator("notify_telegram_chat_id")
    @classmethod
    def validate_notify_telegram_chat_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        # Accept numeric chat IDs (may be negative for groups), or @username handles.
        if not re.fullmatch(r"-?\d+|@[\w]{3,}", trimmed):
            raise ValueError("notify_telegram_chat_id must be a numeric chat ID or @username")
        return trimmed


class MarketAlertRead(BaseModel):
    id: int
    user_token: str
    make: Optional[str] = None
    model: Optional[str] = None
    max_price: Optional[Decimal] = None
    district: Optional[str] = None
    notify_phone: Optional[str] = None
    notify_email: Optional[str] = None
    notify_telegram_chat_id: Optional[str] = None
    notify_channels: Optional[str] = None
    delivery_mode: Optional[str] = None
    quiet_hours_enabled: Optional[bool] = None
    active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AlertChannelsUpdate(BaseModel):
    """Per-alert channel center update (additive; all fields optional)."""

    channels: Optional[List[str]] = Field(default=None, max_length=8)
    delivery_mode: Optional[str] = Field(default=None, max_length=16)
    quiet_hours_enabled: Optional[bool] = Field(default=None)

    @field_validator("delivery_mode")
    @classmethod
    def validate_delivery_mode(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip().lower()
        if not trimmed:
            return None
        if trimmed not in ("instant", "digest"):
            raise ValueError("delivery_mode must be 'instant' or 'digest'")
        return trimmed


class AlertMatchListing(BaseModel):
    id: int
    title: Optional[str] = None
    make: str
    model: str
    year: Optional[int] = None
    price_lkr: Optional[float] = None
    district: Optional[str] = None
    deal_score: Optional[float] = None
    thumbnail_url: Optional[str] = None


class AlertMatchResult(BaseModel):
    alert_id: int
    make: Optional[str] = None
    model: Optional[str] = None
    district: Optional[str] = None
    max_price: Optional[float] = None
    matching_count: int
    listings: List[AlertMatchListing]


class AlertMatchResponse(BaseModel):
    results: List[AlertMatchResult]
    checked_at: datetime


class ProArbitrageGap(BaseModel):
    buy_district: str
    sell_district: str
    buy_median_lkr: float
    sell_median_lkr: float
    gap_pct: float
    buy_listing_count: int
    sell_listing_count: int
