# One price verdict

Every price judgment MotorMila shows — deal badges on cards, the detail page's
FMV card, deal ladder, Trust Check, price-history "typical" line, compare rows,
deal tiers, the Android deal ring and share card — is a view of ONE verdict per
listing. Nothing else is allowed to compute its own band or percent.

| Layer | Implementation | Tests |
|---|---|---|
| Backend | `backend/app/utils/price_verdict.py` (FMV: `app/utils/fmv.py`) | `backend/tests/test_price_verdict.py` |
| Web | `src/lib/priceVerdict.ts` | `src/lib/priceVerdict.test.ts` |
| Android | `android/app/src/main/java/lk/motormila/app/core/price/PriceVerdict.kt` | `android/app/src/test/.../core/price/PriceVerdictTest.kt` |

All three assert the same cases in [`price-verdict-fixtures.json`](price-verdict-fixtures.json).
Change the rules in all three, plus the fixtures, in one PR.

## Rules

Gap = (asking − reference) / reference × 100.

- **Below typical:** gap ≤ −5 %. **Above typical:** gap ≥ +8 %. Otherwise **near typical**.
- **Verify first:** gap ≤ −35 %. Shown amber ("Unusually low — verify first"), never green.
- The percent shown is the whole-number gap, clamped so it never contradicts the band
  (a fair listing never reads "5 % below").

**Withheld** (no badge, no percent; the detail page says why):

| Reason | Group shown to the user |
|---|---|
| no / placeholder price (123456, 1111111…), below the category floor (bike 50k, three-wheeler 100k, car/other 300k), over Rs 500 Mn | Asking price can't be rated |
| lease takeover / rent / hire / down payment / instalment wording | Lease, rental or part-payment price |
| parts / salvage / accidented / damaged wording | Parts or damaged vehicle |
| no reference, fewer than 5 comparables, low confidence, "Other"-style model | Not enough comparable data |
| gap beyond ±60 %, a power-of-ten slip (×10, ×100…), FMV and stored median pointing opposite ways | Price doesn't line up with comparable ads |

## Which reference

- **Cards, lists, compare:** the stored cohort median on the listing row.
- **Detail page:** the FMV estimate (`/listings/{id}/fmv`) with its comps and
  confidence; the stored median is the cross-check. When live comps corroborate
  the stored median (±25 %) the backend uses it AS the FMV, so card and detail
  agree. A backend `verdict.status == "withheld"` always wins.
- **Data boundary:** the backend (`CarListingRead`), web (`normalizeListing`) and
  Android (`ListingDto.toDomain`) drop a stored `deal_score` / `market_median_lkr`
  whose comparison is withheld, so no sort, tier or chart can use it.

Wording is always "typical asking price of similar ads" — never "market value"
or a sale price.
