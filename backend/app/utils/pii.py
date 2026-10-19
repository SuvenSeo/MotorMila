"""Strip seller contact details (phone numbers, emails) from scraped text.

Seller phone numbers and email addresses are personal data under Sri Lanka's
PDPA (No. 9 of 2022). MotorMila never stores them for scraped listings:
buyers contact the seller on the source site. This runs at ingest
(``CarCleaner.normalize_listing_payload``) and in the one-off scrub script
``scripts/ops/scrub_listing_pii.py``.
"""
from __future__ import annotations

import re

# One separator between digits: space, dash, dot, slash or parentheses.
_SEP = r"[\s\-./()]{0,2}"

# Sri Lankan numbers: mobile 07X XXX XXXX, landline 0XX XXX XXXX, with an
# optional +94 / 0094 / 94 country prefix instead of the leading 0.
_PHONE_BODY = (
    r"(?:\+\s?94|0094|94)" + _SEP + r"\(?0?\)?" + _SEP + r"[1-9](?:" + _SEP + r"\d){8}"
    r"|"
    r"\(?0\)?" + _SEP + r"[1-9](?:" + _SEP + r"\d){8}"
)
_LABEL = (
    r"(?:\b(?:tel|tp|t\.p|phone|ph|mob(?:ile)?|call(?:\s+(?:me|us|now))?|contact(?:\s+(?:me|us|no))?"
    r"|whats\s?app|wa|viber|hotline|hot\s?line|inquiries|info)\b\.?\s*(?:no\.?|number|#)?\s*[:\-=]?\s*)?"
)
PHONE_RE = re.compile(r"(?<![\w+])" + _LABEL + r"(?:" + _PHONE_BODY + r")(?!\d)", re.IGNORECASE)
EMAIL_RE = re.compile(
    r"(?:\b(?:e-?mail|email)\s*[:\-]?\s*)?[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}",
    re.IGNORECASE,
)
# Connector debris left behind ("Call  or  ", "/ /").
_DEBRIS_RE = re.compile(r"(?:\s*(?:/|,|\||or|&)\s*){2,}", re.IGNORECASE)
_WS_RE = re.compile(r"\s{2,}")
_EDGE_CONNECTOR_RE = re.compile(r"^(?:or|and|&)\b\s*|\s*\b(?:or|and)$|\s*&$", re.IGNORECASE)

DEFAULT_TITLE_MAX_CHARS = 200


def contains_contact_info(text: object) -> bool:
    value = str(text or "")
    return bool(PHONE_RE.search(value) or EMAIL_RE.search(value))


def strip_contact_info(text: object) -> str:
    """Remove SL phone numbers and emails (and their labels) from ``text``."""
    if text is None:
        return ""
    value = str(text)
    if not value:
        return value
    cleaned = PHONE_RE.sub(" ", value)
    cleaned = EMAIL_RE.sub(" ", cleaned)
    if cleaned == value:
        return value
    cleaned = _DEBRIS_RE.sub(" ", cleaned)
    cleaned = _WS_RE.sub(" ", cleaned).strip(" -|,:;/")
    cleaned = _EDGE_CONNECTOR_RE.sub("", cleaned)
    return cleaned.strip(" -|,:;/")


def clean_listing_title(title: object, max_chars: int = DEFAULT_TITLE_MAX_CHARS) -> str:
    """Strip contact details and cap length at a word boundary.

    Some sources put the whole ad body (with personal statements) in the
    title; MotorMila keeps only a short title.
    """
    value = strip_contact_info(title)
    value = _WS_RE.sub(" ", value).strip()
    if max_chars and len(value) > max_chars:
        cut = value[:max_chars].rsplit(" ", 1)[0].rstrip(" ,.-|/")
        value = (cut or value[:max_chars]) + "…"
    return value
