import hashlib
import re
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from app.utils.districts import resolve_canonical_district
from app.utils.make_canonical import canonicalize_make, canonicalize_model
from app.utils.pricing import MIN_REASONABLE_PRICE_LKR
from app.utils.thumbnail_urls import normalize_image_list
from app.utils.time import utc_now
from app.utils.vehicle_category import normalize_vehicle_category

class CarCleaner:
    MAX_REASONABLE_PRICE_LKR = 200_000_000
    _AUXILIARY_TEXT_FIELDS = (
        "_text_blobs",
        "detail",
        "details",
        "description",
        "meta",
        "metadata",
        "raw_meta",
        "spec",
        "specs",
    )
    _TECHNICAL_FIELD_MAX_LENGTHS = {
        "fuel_type": 20,
        "transmission": 20,
        "condition": 20,
        "body_type": 30,
    }
    # Values that look "set" but are not usable — clear so inference can run.
    _JUNK_TECHNICAL_VALUES = frozenset(
        {
            "",
            "-",
            "--",
            "n/a",
            "na",
            "none",
            "null",
            "unknown",
            "other",
            "nil",
            "not available",
            "notapplicable",
        }
    )
    _JUNK_TECHNICAL_COMPACT = frozenset(
        re.sub(r"[^a-z0-9]+", "", j) for j in _JUNK_TECHNICAL_VALUES if j
    ) | {""}
    _CANONICAL_FUEL = {
        "petrol": "petrol",
        "gasoline": "petrol",
        "gas": "petrol",
        "benzine": "petrol",
        "octane": "petrol",
        "diesel": "diesel",
        "d": "diesel",
        "electric": "electric",
        "ev": "electric",
        "battery": "electric",
        "batteryelectric": "electric",
        "hybrid": "hybrid",
        "pluginhybrid": "pluginhybrid",
        "pluginelectrichybrid": "pluginhybrid",
        "phev": "pluginhybrid",
        "cng": "cng",
        "lpg": "lpg",
    }
    _CANONICAL_TRANSMISSION = {
        "automatic": "automatic",
        "auto": "automatic",
        "tiptronic": "automatic",
        "triptronic": "automatic",
        "dct": "automatic",
        "amt": "automatic",
        "geartronic": "automatic",
        "pdk": "automatic",
        "at": "automatic",
        "manual": "manual",
        "stick": "manual",
        "stickshift": "manual",
        "mt": "manual",
        "imt": "manual",
        "cvt": "cvt",
        "continuouslyvariabletransmission": "cvt",
    }
    _CANONICAL_CONDITION = {
        "brandnew": "brand_new",
        "new": "brand_new",
        "unregistered": "brand_new",
        "zerokm": "brand_new",
        "zeromileage": "brand_new",
        "reconditioned": "reconditioned",
        "recon": "reconditioned",
        "recondition": "reconditioned",
        "used": "used",
        "preowned": "used",
        "secondhand": "used",
        "secondowner": "used",
        "mintcondition": "used",
    }
    _CANONICAL_BODY = {
        "suv": "suv",
        "sportutility": "suv",
        "sportutilityvehicle": "suv",
        "sedan": "sedan",
        "saloon": "sedan",
        "hatchback": "hatchback",
        "hatch": "hatchback",
        "pickup": "pickup",
        "pick-up": "pickup",
        "doublecab": "pickup",
        "singlecab": "pickup",
        "crossover": "crossover",
        "cuv": "crossover",
        "wagon": "wagon",
        "estate": "wagon",
        "coupe": "coupe",
        "convertible": "convertible",
        "cabriolet": "convertible",
        "mpv": "mpv",
        "minivan": "mpv",
        "van": "van",
        "jeep": "jeep",
        "mini": "mini",
        "luxury": "luxury",
        "premium": "luxury",
    }
    _INSTALLMENT_HINTS = (
        "installment",
        "monthly",
        "per month",
        "down payment",
        "emi",
        "lease",
        "finance",
    )
    _FULL_PRICE_HINTS = (
        "price",
        "asking",
        "indicative",
        "sale",
        "cash",
        "full amount",
    )

    def __init__(self):
        # A small sample of common marks in SL
        self.makes_map = {
            "toyota": ["toyota"],
            "honda": ["honda"],
            "nissan": ["nissan"],
            "suzuki": ["suzuki", "maruti"],
            "mitsubishi": ["mitsubishi"],
            "mercedes": ["mercedes", "benz", "mercedes-benz"],
            "bmw": ["bmw"],
            "audi": ["audi"],
            "chevrolet": ["chevrolet"],
            "daihatsu": ["daihatsu"],
            "datsun": ["datsun"],
            "ford": ["ford"],
            "hyundai": ["hyundai"],
            "jeep": ["jeep"],
            "kia": ["kia"],
            "land rover": ["land rover", "land-rover"],
            "lexus": ["lexus"],
            "mazda": ["mazda"],
            "micro": ["micro"],
            "mini": ["mini"],
            "perodua": ["perodua"],
            "peugeot": ["peugeot"],
            "proton": ["proton"],
            "renault": ["renault"],
            "ssangyong": ["ssangyong"],
            "subaru": ["subaru"],
            "tata": ["tata"],
            "mahindra": ["mahindra"],
            "mg": ["mg", "morris garages"],
            "isuzu": ["isuzu"],
            "volkswagen": ["volkswagen", "vw"],
        }

    def _is_reasonable_price(self, value: int) -> bool:
        return MIN_REASONABLE_PRICE_LKR <= value <= self.MAX_REASONABLE_PRICE_LKR

    # Foreign-currency markers that must never be converted to LKR. A bare
    # "$" is included: SL listings rarely quote USD without also saying so.
    _FOREIGN_CURRENCY_RE = re.compile(
        r"(?:\b(?:usd|us\$|aud|cad|eur|gbp|aed|inr|jpy|cny|chf|sgd)\b"
        r"|\bdollars?\b"
        r"|\beuros?\b"
        r"|\bpounds?\b"
        r"|(?<![\w])\$(?!\s*(?:rs\.?|lkr)\b))",
        flags=re.IGNORECASE,
    )

    def _is_foreign_currency(self, text: str) -> bool:
        """True when the price string quotes a non-LKR currency."""
        return bool(self._FOREIGN_CURRENCY_RE.search(text))

    def normalize_price_lkr(self, raw_price: Any) -> Optional[int]:
        if raw_price is None or isinstance(raw_price, bool):
            return None

        if isinstance(raw_price, (int, float)):
            try:
                value = int(float(raw_price))
            except Exception:
                return None
            return value if self._is_reasonable_price(value) else None

        return self.clean_price(str(raw_price))
        
    def clean_title(self, title: str) -> Dict[str, Optional[str]]:
        """Parses title to extract make, model, and year."""
        title_low = title.lower()
        
        result = {
            "make": None,
            "model": None,
            "year": None
        }
        
        # 1. Extract Year (4 digits starting with 19 or 20)
        year_match = re.search(r"\b(19|20)\d{2}\b", title)
        if year_match:
            result["year"] = int(year_match.group(0))
            
        # 2. Extract Make
        for make_key, synonyms in self.makes_map.items():
            if any(syn in title_low for syn in synonyms):
                result["make"] = make_key.capitalize()
                break
                
        # 3. Very basic model extraction 
        # (In a production app, we would use a lookup table of models per make)
        if result["make"]:
            # Remove year and make from title to find model
            clean_text = title_low
            if result["year"]:
                clean_text = clean_text.replace(str(result["year"]), "")
            clean_text = clean_text.replace(result["make"].lower(), "")
            
            # Simple heuristic: first word after make/year that isn't a common word
            words = [w for w in re.split(r"\W+", clean_text) if len(w) > 2]
            common_words = {"for", "sale", "new", "mint", "condition", "car", "used", "lkr"}
            model_words = [w for w in words if w not in common_words]
            
            if model_words:
                result["model"] = model_words[0].capitalize()
                
        return result

    def clean_price(self, raw_price: str) -> Optional[int]:
        """Converts common SL price strings to int LKR, skipping unrealistic values."""
        try:
            if not raw_price:
                return None

            text = str(raw_price).replace("\xa0", " ").strip()
            if not text:
                return None

            # Hard-reject foreign-currency amounts. "USD 4.5 million" must never
            # become 4,500,000 LKR — it is off by orders of magnitude.
            if self._is_foreign_currency(text):
                return None

            # First parse explicit "million" notation (e.g. Rs 8.7 Million, LKR 4.35 mn).
            for pattern in (
                r"(?:(?:rs\.?|lkr)\s*[:\-]?\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:million|mn|m)\b",
            ):
                for match in re.finditer(pattern, text, flags=re.IGNORECASE):
                    if self._is_installment_candidate(text, match.start(1), match.end(1)):
                        continue
                    token = match.group(1)
                    try:
                        value = int(float(token) * 1_000_000)
                    except Exception:
                        continue
                    if self._is_reasonable_price(value):
                        return value

            # Parse SL "lakh"/"crore" notation (Rs 55 lakhs → 5,500,000; 1.2 crore → 12,000,000).
            for pattern, multiplier in (
                (r"(?:(?:rs\.?|lkr)\s*[:\-]?\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:lakhs?|lacs?)\b", 100_000),
                (r"(?:(?:rs\.?|lkr)\s*[:\-]?\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:crores?|cr)\b", 10_000_000),
            ):
                for match in re.finditer(pattern, text, flags=re.IGNORECASE):
                    if self._is_installment_candidate(text, match.start(1), match.end(1)):
                        continue
                    token = match.group(1)
                    try:
                        value = int(float(token) * multiplier)
                    except Exception:
                        continue
                    if self._is_reasonable_price(value):
                        return value

            # Prefer explicit currency markers first.
            for match in re.finditer(
                r"(?:rs\.?|lkr)\s*[:\-]?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{5,12}(?:\.[0-9]+)?)",
                text,
                flags=re.IGNORECASE,
            ):
                if self._is_installment_candidate(text, match.start(1), match.end(1)):
                    continue
                token = match.group(1)
                normalized = token.replace(",", "")
                value = int(float(normalized))
                if self._is_reasonable_price(value):
                    return value

            # Allow strict plain numeric prices (e.g. JSON-LD "price": "12500000").
            plain = re.fullmatch(
                r"\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]{5,12}(?:\.[0-9]+)?)\s*",
                text,
            )
            if plain:
                value = int(float(plain.group(1).replace(",", "")))
                if self._is_reasonable_price(value):
                    return value

            return None
        except Exception:
            return None

    @classmethod
    def _is_installment_candidate(cls, text: str, start: int, end: int) -> bool:
        prefix = text[max(0, start - 40) : start].lower()
        suffix = text[end : end + 30].lower()
        context = f"{prefix} {suffix}"

        if not any(hint in context for hint in cls._INSTALLMENT_HINTS):
            return False

        # Accept if there is an explicit full-price marker nearby before the value.
        return not any(hint in prefix for hint in cls._FULL_PRICE_HINTS)

    @staticmethod
    def _flatten_text_blob(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            parts = []
            for key, item in value.items():
                item_text = CarCleaner._flatten_text_blob(item)
                if item_text:
                    parts.append(f"{key}: {item_text}")
            return " | ".join(parts)
        if isinstance(value, (list, tuple, set)):
            return " | ".join(CarCleaner._flatten_text_blob(item) for item in value if item is not None)
        return str(value)

    def _build_technical_text_blob(self, payload: Dict[str, Any]) -> str:
        blob_parts = []
        for field in ("title", *self._AUXILIARY_TEXT_FIELDS):
            if field in payload:
                text = self._flatten_text_blob(payload.get(field)).strip()
                if text:
                    blob_parts.append(text)
        return " | ".join(blob_parts)

    @staticmethod
    def _extract_first(text: str, patterns: tuple[tuple[str, str], ...]) -> Optional[str]:
        for pattern, value in patterns:
            if re.search(pattern, text, flags=re.IGNORECASE):
                return value
        return None

    @staticmethod
    def _compact_token(value: Any) -> str:
        return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())

    def canonicalize_technical_field(self, field: str, value: Any) -> Optional[str]:
        """Map messy structured values onto stable canonical tokens.

        Aligns with listings API `_canonical_*` helpers so scrape-time and
        read-time normalization stay consistent.
        """
        if value is None:
            return None
        raw = str(value).strip()
        if not raw:
            return None
        compact = self._compact_token(raw)
        if not compact or compact in self._JUNK_TECHNICAL_COMPACT:
            return None

        table = {
            "fuel_type": self._CANONICAL_FUEL,
            "transmission": self._CANONICAL_TRANSMISSION,
            "condition": self._CANONICAL_CONDITION,
            "body_type": self._CANONICAL_BODY,
        }.get(field)
        if not table:
            return raw.lower()

        if compact in table:
            return table[compact]

        # Soft matches for fuel/condition substrings (plugin hybrid, etc.)
        if field == "fuel_type":
            if "plugin" in compact and "hybrid" in compact:
                return "pluginhybrid"
            if "hybrid" in compact:
                return "hybrid"
            if "electric" in compact or compact == "ev":
                return "electric"
        if field == "condition":
            if "recondition" in compact or compact == "recon":
                return "reconditioned"
            if "brandnew" in compact or "unregistered" in compact:
                return "brand_new"
            if "secondhand" in compact or "preowned" in compact:
                return "used"
        if field == "transmission":
            if "cvt" in compact:
                return "cvt"
            if "auto" in compact:
                return "automatic"
            if "manual" in compact or compact in {"mt", "imt"}:
                return "manual"
        if field == "body_type":
            if "hatch" in compact:
                return "hatchback"
            if "suv" in compact:
                return "suv"

        # Unknown non-junk token — keep lowercased so inference does not
        # overwrite a deliberate vendor value, but only if it looks real.
        if len(compact) < 2:
            return None
        return raw.lower()[: self._TECHNICAL_FIELD_MAX_LENGTHS.get(field, 30)]

    def _infer_technical_fields(self, payload: Dict[str, Any]) -> Dict[str, Optional[str]]:
        text = self._build_technical_text_blob(payload)
        if not text:
            return {key: None for key in self._TECHNICAL_FIELD_MAX_LENGTHS}

        # Prefer labeled vendor strings (Cartivate / HitAd style) before free text.
        labeled_fuel = self._extract_first(
            text,
            (
                (r"fuel(?:\s*type)?\s*[:\-]?\s*(plug[\s-]*in\s*hybrid|plugin\s*hybrid|phev)\b", "pluginhybrid"),
                (r"fuel(?:\s*type)?\s*[:\-]?\s*(hybrid)\b", "hybrid"),
                (r"fuel(?:\s*type)?\s*[:\-]?\s*(electric|ev|battery\s*electric)\b", "electric"),
                (r"fuel(?:\s*type)?\s*[:\-]?\s*(diesel)\b", "diesel"),
                (r"fuel(?:\s*type)?\s*[:\-]?\s*(petrol|gasoline|benzine|octane|gas)\b", "petrol"),
                (r"fuel(?:\s*type)?\s*[:\-]?\s*(cng)\b", "cng"),
                (r"fuel(?:\s*type)?\s*[:\-]?\s*(lpg)\b", "lpg"),
            ),
        )
        labeled_transmission = self._extract_first(
            text,
            (
                (r"transmission\s*[:\-]?\s*(cvt)\b", "cvt"),
                (r"transmission\s*[:\-]?\s*(automatic|auto|tiptronic|at)\b", "automatic"),
                (r"transmission\s*[:\-]?\s*(manual|mt|stick)\b", "manual"),
                (r"gearbox\s*[:\-]?\s*(cvt)\b", "cvt"),
                (r"gearbox\s*[:\-]?\s*(automatic|auto)\b", "automatic"),
                (r"gearbox\s*[:\-]?\s*(manual)\b", "manual"),
            ),
        )

        inferred = {
            "fuel_type": labeled_fuel
            or self._extract_first(
                text,
                (
                    (r"\b(?:plug[\s-]*in\s*hybrid|phev)\b", "pluginhybrid"),
                    (r"\b(?:hybrid)\b", "hybrid"),
                    (r"\b(?:electric|battery\s*electric)\b", "electric"),
                    (r"\bev\b", "electric"),
                    (r"\b(?:diesel)\b", "diesel"),
                    (r"\b(?:petrol|gasoline|benzine|octane)\b", "petrol"),
                    (r"\b(?:cng)\b", "cng"),
                    (r"\b(?:lpg)\b", "lpg"),
                ),
            ),
            "transmission": labeled_transmission
            or self._extract_first(
                text,
                (
                    (r"\b(?:cvt)\b", "cvt"),
                    (
                        r"\b(?:automatic|auto|tiptronic|triptronic|dct|amt|geartronic|pdk)\b",
                        "automatic",
                    ),
                    (r"\b(?:manual|stick\s*shift|i[\s-]?mt)\b", "manual"),
                ),
            ),
            "body_type": self._extract_first(
                text,
                (
                    (r"\b(?:suv|sport\s*utility)\b", "suv"),
                    (r"\b(?:sedan|saloon)\b", "sedan"),
                    (r"\b(?:hatch\s*back|hatch)\b", "hatchback"),
                    (r"\b(?:pickup|pick[\s-]*up|double\s*cab|single\s*cab)\b", "pickup"),
                    (r"\b(?:crossover|cuv)\b", "crossover"),
                    # Avoid matching model names like "Wagon R" as body wagon.
                    (r"\b(?:estate\s*wagon|station\s*wagon|estate)\b", "wagon"),
                    (r"\b(?:coupe)\b", "coupe"),
                    (r"\b(?:convertible|cabriolet)\b", "convertible"),
                    (r"\b(?:mpv|minivan)\b", "mpv"),
                    (r"\b(?:van)\b", "van"),
                    (r"\b(?:jeep|4[\s\-]?x[\s\-]?4|four[\s\-]?wheel)\b", "jeep"),
                    (r"\b(?:mini\s*cooper|city\s*car|kei\s*car|micro\s*car)\b", "mini"),
                    (r"\b(?:luxury|premium)\b", "luxury"),
                ),
            ),
            "condition": self._extract_first(
                text,
                (
                    (r"\b(?:recondition(?:ed)?|recon)\b", "reconditioned"),
                    (
                        r"\b(?:brand\s*new|unregistered|zero\s*mileage|zero\s*km)\b",
                        "brand_new",
                    ),
                    (
                        r"\b(?:used|pre[\s-]*owned|second[\s-]*hand|second\s*owner|mint\s*condition)\b",
                        "used",
                    ),
                ),
            ),
        }
        return inferred

    @staticmethod
    def _truncate_text(value: Any, max_len: int) -> str:
        if value is None:
            return ""
        text = str(value).strip()
        return text[:max_len] if len(text) > max_len else text

    def make_source_id(self, source_id_or_url: str) -> str:
        raw = str(source_id_or_url or "").strip()
        if not raw:
            return ""

        parsed = urlparse(raw)
        if parsed.scheme and parsed.netloc:
            candidate = parsed.path or "/"
            if parsed.query:
                candidate = f"{candidate}?{parsed.query}"
        else:
            candidate = raw

        if len(candidate) <= 100:
            return candidate

        digest = hashlib.sha1(candidate.encode("utf-8")).hexdigest()[:16]
        tail = candidate[-80:]
        return self._truncate_text(f"{tail}#{digest}", 100)

    def normalize_listing_payload(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        normalized = dict(payload)
        allow_missing_price = bool(normalized.pop("_allow_missing_price", False))
        inferred_fields = self._infer_technical_fields(normalized)

        source = self._truncate_text(normalized.get("source"), 20)
        if not source:
            return None
        normalized["source"] = source

        source_id = self.make_source_id(normalized.get("source_id") or normalized.get("url"))
        if not source_id:
            return None
        normalized["source_id"] = source_id

        make = self._truncate_text(normalized.get("make"), 50)
        if not make:
            return None
        # Fold duplicate/typo brand spellings at scrape time so the database
        # stores one row per brand. A junk make ("Test", "2018", "Other
        # brand") carries no brand signal, so fall back to the title.
        canonical_make = canonicalize_make(make)
        if canonical_make is None:
            canonical_make = canonicalize_make(normalized.get("title"))
        if canonical_make is None:
            return None
        normalized["make"] = canonical_make
        normalized["model"] = canonicalize_model(normalized.get("model")) or "Other"

        for key, max_len in (
            ("fuel_type", 20),
            ("transmission", 20),
            ("condition", 20),
            ("body_type", 30),
            ("vehicle_category", 40),
            ("district", 50),
            ("city", 100),
        ):
            if key in normalized and normalized[key] is not None:
                if key in self._TECHNICAL_FIELD_MAX_LENGTHS:
                    canonical = self.canonicalize_technical_field(key, normalized[key])
                    normalized[key] = self._truncate_text(canonical, max_len) if canonical else None
                else:
                    trimmed = self._truncate_text(normalized[key], max_len)
                    normalized[key] = trimmed if trimmed else None

        if normalized.get("vehicle_category"):
            normalized["vehicle_category"] = normalize_vehicle_category(
                normalized.get("vehicle_category")
            )

        listing_url = normalized.get("url")
        canonical_district = resolve_canonical_district(normalized.get("district"), listing_url)
        if canonical_district:
            normalized["district"] = canonical_district
        elif normalized.get("district") and str(normalized["district"]).strip().lower() == "sri lanka":
            normalized["district"] = None

        for key, max_len in self._TECHNICAL_FIELD_MAX_LENGTHS.items():
            if normalized.get(key):
                continue
            inferred = inferred_fields.get(key)
            if inferred:
                canonical = self.canonicalize_technical_field(key, inferred) or inferred
                normalized[key] = self._truncate_text(canonical, max_len) or None

        for key in self._AUXILIARY_TEXT_FIELDS:
            normalized.pop(key, None)

        raw_price = normalized.get("price_lkr")
        price = self.normalize_price_lkr(raw_price)
        if price is None and not allow_missing_price:
            return None
        normalized["price_lkr"] = price

        try:
            year = int(normalized.get("year") or 0)
        except Exception:
            year = 0
        current_year = utc_now().year
        if not (1950 <= year <= current_year + 1):
            normalized["year"] = None  # Don't default to 2015 - leave as NULL
        else:
            normalized["year"] = year

        # Gallery images: scrapers pass a list of source URLs; the DB column
        # holds a JSON string. Drop the key entirely when there is nothing
        # usable so upserts never write an empty value over an existing one.
        if "images" in normalized:
            gallery_json = normalize_image_list(normalized.get("images"))
            if gallery_json:
                normalized["images"] = gallery_json
            else:
                normalized.pop("images", None)

        return normalized

    def clean_mileage(self, raw_mileage: str) -> Optional[int]:
        """Converts '50,000 km' to 50000.

        Rejects values outside a vehicle-plausible range so junk like
        YYYYMMDD dates (e.g. 20260217) never hit Postgres INTEGER columns.
        """
        try:
            digits = re.sub(r"\D", "", str(raw_mileage or ""))
            if not digits:
                return None
            value = int(digits)
            # Hard ceiling stays under Postgres INTEGER max (2_147_483_647)
            # while still covering high-mileage commercial vehicles.
            if value < 0 or value > 2_000_000:
                return None
            return value
        except Exception:
            return None
