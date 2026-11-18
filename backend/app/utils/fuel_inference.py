"""High-precision deterministic fuel_type inference for Sri Lanka vehicle listings.

Only fills in ``fuel_type`` when the model, vehicle category, or explicit
title tokens leave virtually no ambiguity (BEVs, dedicated hybrids like Prius/Aqua,
petrol motorbikes and three-wheelers, and commercial diesel trucks/buses/tractors).
Dual-fuel passenger models (e.g. Vitz, Fit, Vezel, Swift, Corolla) are left
alone unless their title carries explicit fuel cues.
"""

from __future__ import annotations

import re

_TITLE_PLUGIN_HYBRID_RE = re.compile(
    r"(?i)\b(?:plug[\s-]*in\s*hybrid|plugin\s*hybrid|phev|phv|dm[\s-]?i|reev)\b"
)
_TITLE_HYBRID_RE = re.compile(r"(?i)\b(?:hybrid|e[\s-]?power|e[\s-]?hev)\b")
_TITLE_ELECTRIC_RE = re.compile(
    r"(?i)\b(?:battery\s+electric|electric\s+vehicle|electric|ev)\b"
)
_TITLE_DIESEL_RE = re.compile(r"(?i)\b(?:diesel|crdi|tdi|d4d|cdti)\b")
_TITLE_PETROL_RE = re.compile(r"(?i)\b(?:petrol|gasoline|benzine)\b")

_EBIKE_CUES_RE = re.compile(
    r"(?i)\b(?:electric|e[\s-]?bike|ebike|e[\s-]?scooter|lithium|kwh|\d+\s*(?:w|watt))\b"
)
_EBIKE_MAKES = frozenset(
    {
        "yadea",
        "tailg",
        "niu",
        "gogoro",
        "ather",
        "ola",
        "super soco",
        "revolt",
    }
)

# dedicated EV models by canonical make (lowercase)
_BEV_MODELS_BY_MAKE: dict[str, tuple[str, ...]] = {
    "nissan": ("leaf", "ariya", "sakura"),
    "byd": (
        "atto",
        "dolphin",
        "seal",
        "sealion 7",
        "e6",
        "yuan",
        "han",
        "tang",
        "seagull",
        "m6",
    ),
    "tesla": ("model s", "model 3", "model x", "model y", "cybertruck"),
    "mg": ("mg4", "4", "zs ev", "comet", "mulan", "cyberster"),
    "hyundai": ("ioniq 5", "ioniq 6", "kona electric", "kona ev", "inster"),
    "kia": ("ev3", "ev5", "ev6", "ev9", "niro ev", "soul ev"),
    "wuling": ("air ev", "bingo", "binguo"),
    "ora": ("good cat", "funky cat"),
    "tata": ("nexon ev", "tiago ev", "tigor ev", "punch ev"),
    "mahindra": ("xuv400",),
    "zotye": ("e200",),
    "dongfeng": ("nammi", "box", "nano box"),
}

_HEV_ONLY_MODELS_BY_MAKE: dict[str, tuple[str, ...]] = {
    "toyota": ("aqua", "prius", "sai"),
    "honda": ("insight", "cr-z", "crz"),
}

_BIKE_MAKES = frozenset(
    {
        "bajaj",
        "tvs",
        "yamaha",
        "hero",
        "ktm",
        "royal enfield",
        "kawasaki",
        "loncin",
        "demak",
        "kinetic",
        "vespa",
        "ducati",
        "aprilia",
        "triumph",
        "benelli",
        "cfmoto",
        "harley-davidson",
        "harley davidson",
    }
)

_BIKE_MODEL_CUES_RE = re.compile(
    r"(?i)\b(?:"
    r"dio|activa|hornet|cbr|xr\d*|pcx|navi|shine|unicorn|dream\s*neo|cd\s*\d+|cg\s*\d+|"
    r"gixxer|burgman|gn\s*125|let'?s|access|hayate|intruder|"
    r"fz[\s-]?s?|r15|mt[\s-]?15|ray[\s-]?zr?|fascino|aerox|"
    r"pulsar|platina|ct\s*100|discover|avenger|dominar|"
    r"ntorq|jupiter|apache|xl\s*super|wego|scooty|"
    r"splendor|glamour|passion|pleasure|maestro|xtreme|"
    r"duke|rc\s*\d+"
    r")\b"
)

_THREE_WHEELER_PETROL_RE = re.compile(
    r"(?i)\b(?:bajaj\s*re|re\s*205|205\s*d?|4\s*stroke|2\s*stroke|tvs\s*king|tuk\s*tuk|tuktuk)\b"
)

_COMMERCIAL_DIESEL_RE = re.compile(
    r"(?i)\b(?:"
    r"isuzu\s*(?:elf|forward|giga|journey|npr|nkr|nhr)|"
    r"mitsubishi\s*(?:canter|fuso|rosa|fighter)|"
    r"canter|fuso|rosa|"
    r"tata\s*(?:dimo|batta|ace|lpt|xenon|ultra|407|709|909|1109|1613|prima)|"
    r"dimo\s*batta|ashok\s*leyland|leyland|"
    r"hino\s*(?:ranger|profia|dutro)|"
    r"eicher|"
    r"toyota\s*(?:coaster|dyna|toyoace)|"
    r"tafe|massey\s*ferguson|kubota|yanmar|john\s*deere|mahindra\s*tractor|"
    r"jcb\b|komatsu|caterpillar|kobelco|hitachi"
    r")\b"
)

_COMMERCIAL_DIESEL_CATEGORIES = frozenset(
    {"lorries", "lorries-trucks", "tractors", "buses", "heavy-duty", "heavy-duties"}
)


def _contains_model_token(model_low: str, title_low: str, candidate: str) -> bool:
    if len(candidate) <= 2:
        return model_low == candidate
    return bool(re.search(rf"(?i)\b{re.escape(candidate)}\b", model_low)) or bool(
        re.search(rf"(?i)\b{re.escape(candidate)}\b", title_low)
    )


def infer_deterministic_fuel_type(
    make: str | None,
    model: str | None,
    title: str | None,
    vehicle_category: str | None = None,
) -> str | None:
    """Return a canonical fuel_type token if unambiguous, else None."""
    make_low = str(make or "").strip().lower()
    model_low = str(model or "").strip().lower()
    title_str = str(title or "").strip()
    title_low = title_str.lower()
    cat_low = str(vehicle_category or "").strip().lower().replace("_", "-")
    text = f"{make_low} {model_low} {title_low}".strip()

    # 1. Explicit title overrides
    if _TITLE_PLUGIN_HYBRID_RE.search(title_str):
        return "pluginhybrid"
    if _TITLE_HYBRID_RE.search(title_str):
        return "hybrid"
    if _TITLE_ELECTRIC_RE.search(title_str):
        return "electric"
    if _TITLE_DIESEL_RE.search(title_str):
        return "diesel"
    if _TITLE_PETROL_RE.search(title_str):
        return "petrol"

    # 2. BEV-only models
    if cat_low not in {"boats", "bicycles"}:
        bev_models = _BEV_MODELS_BY_MAKE.get(make_low, ())
        for cand in bev_models:
            if _contains_model_token(model_low, title_low, cand):
                return "electric"

    # 3. Hybrid-only models (Toyota Aqua/Prius/Sai, Honda Insight/CR-Z)
    hev_models = _HEV_ONLY_MODELS_BY_MAKE.get(make_low, ())
    for cand in hev_models:
        if _contains_model_token(model_low, title_low, cand):
            return "hybrid"

    # Guard against passenger cars colliding with bike names
    is_nissan_pulsar = make_low == "nissan" and "pulsar" in text
    is_daihatsu_cast = make_low == "daihatsu" and "cast" in text

    # 4. Motorbikes (petrol unless electric scooter/e-bike)
    is_bike = (
        cat_low in {"motorbikes", "motorcycles", "bike", "bikes"}
        or (make_low in _BIKE_MAKES and cat_low not in {"boats", "bicycles"})
        or (make_low in _EBIKE_MAKES and cat_low not in {"bicycles"})
        or (
            not is_nissan_pulsar
            and not is_daihatsu_cast
            and cat_low not in {"cars", "suvs", "jeeps", "vans", "boats", "bicycles"}
            and bool(_BIKE_MODEL_CUES_RE.search(f"{model_low} {title_low}"))
        )
    )
    if is_bike and cat_low not in {"boats", "bicycles"}:
        if make_low in _EBIKE_MAKES or _EBIKE_CUES_RE.search(text):
            return "electric"
        return "petrol"

    # 5. Three-wheelers
    if cat_low in {"three-wheelers", "three-wheels", "threewheeler"}:
        if _EBIKE_CUES_RE.search(text):
            return "electric"
        if make_low in {"bajaj", "tvs"} or _THREE_WHEELER_PETROL_RE.search(text):
            return "petrol"

    # 6. Commercial diesel (lorries, buses, tractors, heavy-duty)
    if (
        cat_low in _COMMERCIAL_DIESEL_CATEGORIES
        or _COMMERCIAL_DIESEL_RE.search(text)
    ) and cat_low not in {"cars", "suvs", "motorbikes", "bicycles", "boats"}:
        return "diesel"

    return None
