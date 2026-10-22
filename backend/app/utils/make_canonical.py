"""Canonical make/model normalization (backend half).

Scrape-side make values are noisy: the same brand arrives as "Bmw"/"BMW",
"Mg"/"MG", "Dfsk"/"DFSK", "Land rover"/"Land Rover", plus typo variants
("Mitshubishi", "Sukuzi", "Nisan", "Daihatzu", "Cheery") and outright junk
("Test", "TestPOS", "testused", "2018", "Other brand").

Model values are worse: seller phone numbers ("0773761064"), misspellings
("Corollla", "Premeyo", "Hillux"), trim/fuel words that leaked into the model
column ("Suv", "Hybrid", "Other Model", "Fully"), other marques ("Nissan"
under Toyota), and place names. Those values reach the public model combobox,
the make-hub model grids and the valuation/trends model pickers, where junk
rows push real models out of the visible lists.

Mirrored in the frontend at ``src/lib/makeNormalization.ts``; keep the two
tables in sync (the backend owns the live API + snapshot export, the frontend
owns the CDN snapshot path).
"""

from __future__ import annotations

import re
from typing import Optional

# Normalized (lowercase, alnum-only) key -> canonical display name.
MAKE_ALIASES: dict[str, str] = {
    # Case / spacing duplicates of the big brands.
    "toyota": "Toyota",
    "suzuki": "Suzuki",
    "nissan": "Nissan",
    "honda": "Honda",
    "bmw": "BMW",
    "mercedes": "Mercedes",
    "mercedesbenz": "Mercedes",
    "benz": "Mercedes",
    "mg": "MG",
    "kia": "Kia",
    "dfsk": "DFSK",
    "hyundai": "Hyundai",
    "proton": "Proton",
    "landrover": "Land Rover",
    "rangerover": "Land Rover",
    "rollsroyce": "Rolls-Royce",
    "harley": "Harley-Davidson",
    "harleydavidson": "Harley-Davidson",
    "ssang": "SsangYong",
    "ssangyong": "SsangYong",
    # Typo variants seen in live listings.
    "mitshubishi": "Mitsubishi",
    "suzuzi": "Suzuki",
    "sukuzi": "Suzuki",
    "nisan": "Nissan",
    "daihatzu": "Daihatsu",
    "cheery": "Chery",
    "mubota": "Kubota",
    "kubota": "Kubota",
    "suzukimaruti": "Maruti Suzuki",
    "marutisuzuki": "Maruti Suzuki",
    "saicmaxus": "Maxus",
    "maxus": "Maxus",
    # Scrape artifacts where a model name landed in the make column.
    "hondafit": "Honda",
    "hondacar": "Honda",
    "tatanexon": "Tata",
    "mg4": "MG",
    "gacaion": "GAC",
    "baicbeijing": "BAIC",
    "microgeely": "Micro",
    "heroelectric": "Hero",
    "jeepwrangler": "Jeep",
    "mercedesbenzc180": "Mercedes",
    "singerlima": "Singer",
    "hyndaitrajet": "Hyundai",
}

# Multi-word values that are a leaked model/garbage rather than a real marque.
# Kept separate from JUNK_MAKES so genuine two-word brands ("Ashok Leyland",
# "Royal Enfield", "John Deere") are never dropped by the same rule.
LEAKED_MODEL_MAKES = frozenset(
    {
        "vitzcar",
        "vezelzplay",
        "utone",
        "vivaelite",
        "scooty",
        "car",
        "cars",
        "auto",
        "vehicle",
    }
)

# Values that carry no brand information. These are hidden from make/model
# filters rather than offered to users as car brands.
JUNK_MAKES = frozenset(
    {
        "other",
        "otherbrand",
        "otherbrands",
        "others",
        "unknown",
        "unnamed",
        "na",
        "n/a",
        "none",
        "null",
        "nil",
        "test",
        "test1",
        "test2",
        "testpos",
        "testlisting",
        "testused",
        "testuser",
        "sample",
        "demo",
        "dummy",
        "lorem",
        "ipsum",
        "asdf",
    }
)

_YEAR_RE = re.compile(r"^(19|20)\d{2}$")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_WS_RE = re.compile(r"\s+")

# Common model misspellings seen in live listings (normalized key -> display).
# Case variants ("chr", "CHR", "C-HR") collapse to one canonical label so a
# model's listings aren't split across several filter rows.
MODEL_ALIASES: dict[str, str] = {
    "priuas": "Prius",
    "prius": "Prius",
    "hillux": "Hilux",
    "hylux": "Hilux",
    "hilux": "Hilux",
    "vits": "Vitz",
    "vitz": "Vitz",
    "chr": "C-HR",
    "axio": "Axio",
    "aqua": "Aqua",
    "vezel": "Vezel",
    "vezelzplay": "Vezel",
    "fit": "Fit",
    "swift": "Swift",
    "alto": "Alto",
    "wagonr": "Wagon R",
    "mira": "Mira",
    "move": "Move",
    "tanto": "Tanto",
    "nv200": "NV200",
    "leaf": "Leaf",
    "notee": "Note",
    "note": "Note",
    "serena": "Serena",
    "elgrand": "Elgrand",
    "landcruiser": "Land Cruiser",
    "landcruiserprado": "Land Cruiser Prado",
    "prado": "Land Cruiser Prado",
    "corolla": "Corolla",
    "corollla": "Corolla",
    "coroola": "Corolla",
    "corlla": "Corolla",
    "carolla": "Corolla",
    "corollaaxio": "Corolla Axio",
    "corollafielder": "Corolla Fielder",
    "fielder": "Corolla Fielder",
    "allion": "Allion",
    "premio": "Premio",
    "perimio": "Premio",
    "premeyo": "Premio",
    "camry": "Camry",
    "crown": "Crown",
    "harrier": "Harrier",
    "rav4": "RAV4",
    "crv": "CR-V",
    "x1": "X1",
    "x3": "X3",
    "x5": "X5",
    "3series": "3 Series",
    "5series": "5 Series",
    "cclass": "C-Class",
    "eclass": "E-Class",
    "sclass": "S-Class",
    "sprinter": "Sprinter",
    "spriter": "Sprinter",
    "dolphin": "Dolphin",
    "dolping": "Dolphin",
}

# Whole-value generic words that leak into the model column on some feeds
# (trim level, fuel, body style, condition). Matched against the compacted
# whole value only — "Glory 580" keeps "Glory", but a bare "Suv" is dropped.
JUNK_MODEL_WORDS = frozenset(
    {
        "other",
        "othermodel",
        "othermake",
        "unknownmodel",
        "unknown",
        "suv",
        "muv",
        "hybrid",
        "electrichybrid",
        "electric",
        "ev",
        "petrol",
        "diesel",
        "cng",
        "turbo",
        "fully",
        "brandnew",
        "reconditioned",
        "used",
        "lorry",
        "truck",
        "van",
        "bus",
        "car",
        "cars",
        "auto",
        "vehicle",
        "vehicles",
        "double",
        "single",
        "crew",
        "crewcab",
        "highest",
        "long",
        "short",
        "new",
        # Observed in live snapshots: country / town names, dealer words and
        # equipment leaking into the model column ("Japan", "Malabe",
        # "Elephant", "Shell", "Forklift"). Whole-value matches only — no real
        # car model is named any of these.
        "japan",
        "elephant",
        "shell",
        "forklift",
        "roadroller",
    }
)

# Major Sri Lankan town names seen leaking into the model column in live
# snapshots (the 25 district names are covered separately). Whole-value match.
TOWN_KEYS = frozenset(
    {
        "malabe",
        "katugastota",
        "panadura",
        "badulla",
        "kadawatha",
        "negombo",
        "kalutara",
        "chilaw",
        "minuwangoda",
        "mirigama",
        "nugegoda",
        "maharagama",
        "boralesgamuwa",
        "piliyandala",
        "homagama",
        "kaduwela",
        "wattala",
        "kelaniya",
        "peliyagoda",
        "ragama",
        "jaela",
        "divulapitiya",
        "wennappuwa",
        "marawila",
        "nattandiya",
    }
)

# Compacted keys of known marques. A model value that IS a car brand is
# cross-make leakage ("Nissan" appearing under Toyota models) — no genuine
# model is named exactly like a marque.
KNOWN_MAKE_KEYS = frozenset(
    {
        "toyota",
        "suzuki",
        "nissan",
        "honda",
        "mitsubishi",
        "mazda",
        "hyundai",
        "kia",
        "bmw",
        "mercedes",
        "mercedesbenz",
        "benz",
        "audi",
        "volkswagen",
        "vw",
        "ford",
        "chevrolet",
        "subaru",
        "lexus",
        "daihatsu",
        "isuzu",
        "tata",
        "mahindra",
        "maruti",
        "marutisuzuki",
        "perodua",
        "proton",
        "micro",
        "dfsk",
        "chery",
        "byd",
        "mg",
        "gac",
        "baic",
        "haval",
        "geely",
        "tesla",
        "acura",
        "infiniti",
        "landrover",
        "jaguar",
        "porsche",
        "volvo",
        "peugeot",
        "renault",
        "fiat",
        "jeep",
        "ssangyong",
        "datsun",
        "opel",
        "skoda",
        "kiasonet",
        "yamaha",
        "bajaj",
        "tvs",
        "hero",
        "ktm",
        "aprilia",
        "vespa",
    }
)

# The 25 districts (+ "Sri Lanka" itself) as compacted keys. District names
# leak into the model column on some feeds and read as nonsense model rows.
_DISTRICT_KEYS = frozenset(
    {
        "colombo",
        "gampaha",
        "kalutara",
        "kandy",
        "matale",
        "nuwaraeliya",
        "galle",
        "matara",
        "hambantota",
        "jaffna",
        "kilinochchi",
        "mannar",
        "vavuniya",
        "mullaitivu",
        "batticaloa",
        "ampara",
        "trincomalee",
        "kurunegala",
        "puttalam",
        "anuradhapura",
        "polonnaruwa",
        "badulla",
        "monaragala",
        "ratnapura",
        "kegalle",
        "srilanka",
    }
)


def _is_phone_number_model(raw: str) -> bool:
    """True when a model value is actually a phone number (scrape artifact).

    Sri Lankan mobiles are 07XXXXXXXX / +947XXXXXXXX; landlines 0XXXXXXXXX.
    A model that is essentially all digits with phone-like length is junk.
    """
    digits = re.sub(r"\D", "", raw)
    if len(digits) < 9 or len(digits) > 12:
        return False
    # Must be essentially all digits (allow +, spaces, dashes, parens).
    if re.sub(r"[0-9+\s\-()]", "", raw) != "":
        return False
    # SL mobile / landline prefixes, or a bare 9-10 digit run.
    return bool(re.match(r"^(?:\+?94|0)?[17]\d{8}$", digits) or re.match(r"^\d{9,10}$", digits))


# Well-known models of other marques, seen misattributed in feed rows ("Navara"
# listed under Toyota). Whole-value match only; under their own make they are
# kept because the foreign-make check compares against the row's make.
KNOWN_MODEL_TO_MAKE = {
    "navara": "Nissan",
    "sonet": "Kia",
    "seltos": "Kia",
    "vanette": "Nissan",
}


def model_contains_foreign_make(model: object, own_make: object) -> bool:
    """True when a model string names a *different* marque ("Toyota Aqua"
    listed under Land Rover) — a cross-feed misattribution, not a real model.

    Words that resolve to the row's own make ("Mercedes Benz C180" under
    Mercedes) are fine; only foreign marques trigger.
    """
    own = canonicalize_make(own_make)
    if not own:
        return False
    own_key = compact_key(own)
    for word in re.split(r"\s+", str(model or "").strip()):
        key = compact_key(word)
        if not key or key not in KNOWN_MAKE_KEYS:
            continue
        word_make = MAKE_ALIASES.get(key, key)
        if compact_key(word_make) != own_key:
            return True
    # Known models of other marques ("Navara" under Toyota).
    whole_key = compact_key(str(model or "").strip())
    mapped = KNOWN_MODEL_TO_MAKE.get(whole_key)
    if mapped and compact_key(mapped) != own_key:
        return True
    return False


def compact_key(value: str) -> str:
    return _NON_ALNUM_RE.sub("", value.lower())


def is_junk_make(value: object) -> bool:
    """True when a make value carries no usable brand signal."""
    raw = str(value if value is not None else "").strip()
    key = compact_key(raw)
    if not key:
        return True
    if key in JUNK_MAKES or key in LEAKED_MODEL_MAKES:
        return True
    # A bare model year in the make column ("2018") is never a brand.
    if _YEAR_RE.match(key):
        return True
    words = raw.lower().split()
    # Test/fixture rows ("Test Allion 2005", "Test Test 2010").
    if "test" in words:
        return True
    # A 4-digit year embedded in the make ("Auchev Pisces 2026", "Vitz Car Car
    # 2022") means a model string leaked into the make column.
    if any(_YEAR_RE.fullmatch(w) for w in words):
        return True
    # Leading trim/fuel/body word ("Electric 2026") is the same leak.
    if words and compact_key(words[0]) in JUNK_MODEL_WORDS:
        return True
    return False


def _title_case(value: str) -> str:
    parts = []
    for part in value.split(" "):
        # Preserve genuine acronyms (TVS, JAC, KTM, BYD) but normalize long
        # all-caps words that are just shouted brand names (ISUZU -> Isuzu).
        if len(part) <= 4 and part.isupper():
            parts.append(part)
        else:
            parts.append(part[:1].upper() + part[1:].lower())
    return " ".join(parts)


def canonicalize_make(value: object) -> Optional[str]:
    """Resolve a raw make value to its canonical display name.

    Returns ``None`` for junk so callers can drop the row. Unknown but
    plausible single-token makes are kept (normalized in case); silently hiding
    a real niche marque is worse than showing an uncommon one.
    """
    raw = str(value if value is not None else "").strip()
    if not raw:
        return None

    collapsed = _WS_RE.sub(" ", raw)
    key = compact_key(collapsed)
    if not key or key in JUNK_MAKES or _YEAR_RE.match(key):
        return None

    direct = MAKE_ALIASES.get(key)
    if direct:
        return direct

    # "Honda fit" / "Jeep Wrangler" / "BAIC Beijing": a real brand followed by
    # a model that leaked into the make column. The leading brand is the truth.
    first_token = collapsed.split(" ")[0]
    if first_token and first_token != collapsed:
        first_key = compact_key(first_token)
        # A leading model year ("2012 Gp 1 2012", "95 2026") means the value
        # is a leaked title fragment. No marque starts with a bare number —
        # scan the remaining tokens for a known brand ("2016 Suzuki Spacia
        # Custom Turbo 2016" -> Suzuki) before giving up.
        if first_key and (_YEAR_RE.match(first_key) or first_token.isdigit()):
            for token in collapsed.split(" ")[1:]:
                head = MAKE_ALIASES.get(compact_key(token))
                if head:
                    return head
            return None
        if first_key and first_key not in JUNK_MAKES and not _YEAR_RE.match(first_key):
            head = MAKE_ALIASES.get(first_key)
            if head:
                return head

    # Known leaked model strings ("Vitz car", "VEZEL Z PLAY"). Anything else
    # multi-word is treated as a real marque — "Ashok Leyland" and "Royal
    # Enfield" must survive, so an unknown word is not proof of junk.
    if key in LEAKED_MODEL_MAKES:
        return None

    return _title_case(collapsed)


def canonicalize_model(value: object) -> str:
    """Trim a model name, fold misspellings and drop junk; "" when unusable.

    Drops: placeholders ("Other Model", "Unknown"), bare years, seller phone
    numbers that leaked into the model column, whole-value generic words
    ("Suv", "Hybrid", "Fully", "Lorry" — trim/fuel/body leaks, not models),
    values that are actually a car brand (cross-make leakage, e.g. "Nissan"
    under Toyota), and district names ("Colombo") that leaked into the model
    column. Known misspellings fold to one canonical label so a model's
    listings are not split across several filter rows.
    """
    raw = _WS_RE.sub(" ", str(value if value is not None else "").strip())
    if not raw:
        return ""
    key = compact_key(raw)
    if not key or key in JUNK_MAKES or key in JUNK_MODEL_WORDS:
        return ""
    if _YEAR_RE.match(key):
        return ""
    # Phone numbers and "other"/"null"-style placeholders carry no signal.
    if _is_phone_number_model(raw):
        return ""
    # Test/fixture rows ("Test Allion 2005").
    if "test" in raw.lower().split():
        return ""
    # A model value that is exactly a known marque is cross-make leakage
    # ("Nissan" listed under Toyota models) — never a real model name.
    if key in KNOWN_MAKE_KEYS:
        return ""
    # District names leak into the model column on some feeds (towns are covered
    # by TOWN_KEYS below; the 25 districts are in _DISTRICT_KEYS).
    if key in _DISTRICT_KEYS or key in TOWN_KEYS:
        return ""
    alias = MODEL_ALIASES.get(key)
    if alias:
        return alias
    return raw


def has_usable_make_model(make: object, model: object) -> bool:
    return bool(canonicalize_make(make)) and bool(canonicalize_model(model))
