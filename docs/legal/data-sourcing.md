# MotorMila data sourcing policy

_Last updated: 22 October 2026. Applies to the MotorMila website, API and Android app._

MotorMila is an independent search engine for vehicles for sale in Sri Lanka. It is
not affiliated with ikman.lk, Riyasewana or any other site it links to. Listings
belong to their sellers and to the sites where they were published. Every MotorMila
listing names its source and links back to the original ad.

## 1. What we collect

From public listing pages that the source's `robots.txt` allows, we collect **facts
about the vehicle**:

- make, model, year, body type, fuel, transmission, engine capacity, condition
- asking price (LKR) and mileage
- district / city as shown on the ad
- a short title (contact details removed, capped at 200 characters)
- the **source name** and **source URL** of the ad (always kept, for attribution)
- when we first saw the ad, when we last saw it (`last_seen_at`) and when we last
  successfully checked the source (`last_checked_at`)
- at most a link to the source's own thumbnail/photo URL (see §2)

We use these facts for search, price history and aggregate statistics (medians,
trends, depreciation).

## 2. What we do NOT collect or publish

- **No seller phone numbers, WhatsApp numbers, email addresses or seller names**
  from scraped ads. Phone numbers (07X…, 0XX…, +94…, 94…, 0094…, spaced or dashed)
  and emails are stripped from titles at ingest. The old
  `/listings/{id}/seller-profile` endpoint is retired and returns **410** with
  "Contact the seller on {source}".
- **No full ad descriptions.** Free text is used only transiently to read specs.
- **No copies of photos.** We do not download, cache or re-serve source images.
  `/listings/{id}/thumbnail-proxy` is retired (**410**). Where an image is shown it
  is the source's own URL with a "Photo: {source}" credit and a link to the ad.
  (Perceptual hashes used for duplicate detection are computed in memory; the
  image bytes are never stored.)
- **No logged-in scraping.** We never sign in to a source site.
- **No pages a site asks robots not to crawl** (for example ikman URLs with
  `?sort=`, `?query=`, `?filters=`; Riyasewana `/get-phone.php`).
- **No private or internal APIs.** We do not call `api.ikman.lk`.

First-party listings that MotorMila users post themselves are different: the
seller gives us their own contact details and can edit or delete them.

## 3. How we crawl (robots compliance)

- **Honest identity.** Every request uses one User-Agent:
  `MotorMilaBot/1.0 (+https://motormila.vercel.app/bot; <contact email>)`.
  No browser impersonation, no rotating user agents or screen sizes, no
  "stealth" scripts.
- **robots.txt first.** `robots.txt` is fetched once per host (cached for 6 h)
  and checked for every URL, including `*` and `$` wildcards (RFC 9309). If a
  site's `robots.txt` cannot be read because of an error, a block or a
  challenge page, we treat the whole site as disallowed. `Crawl-delay` is
  honoured.
- **Polite pace.** One request at a time per host, with a 2-5 second random
  delay between requests (more if the site's `Crawl-delay` asks for it).
- **No evasion.** No proxies, residential IPs or IP rotation, no solving or
  waiting out Cloudflare / CAPTCHA challenges, no switching to a headless
  browser after being blocked. **If a site blocks, challenges or rate-limits
  us, we stop crawling that site for the run and log it.** If a site asks us
  to stop, we stop the same day.
- **Per-source switch.** Each source can be turned off instantly with the
  `SOURCES_DISABLED` setting, or the crawl limited to an allow-list with
  `SOURCES_ENABLED`. **ikman.lk crawling was paused 19–22 October 2026 and
  re-enabled on 22 October 2026.** We crawl only robots-permitted public
  HTML pages and never `api.ikman.lk`; a data partnership or feed under
  ikman's "partner sites" terms remains the preferred long-term path, and
  `SOURCES_DISABLED=ikman` stops the crawl instantly if that changes.

## 4. Freshness

A listing we have not seen at its source for 30 days is marked inactive and
drops out of search and statistics. Each listing shows its source and when it
was last seen, so users can check the original ad before acting.

## 5. Takedown and removal (72 hours)

Sellers, photographers, source sites and anyone else can ask us to remove a
listing, a photo or any data about them.

- **How:** email the contact address below (or use the removal form on the site
  once live) with the MotorMila or source listing URL and what you want removed.
- **When:** we act within **72 hours** of a request (faster than the 21 working
  days the PDPA allows) and confirm by email.
- **What happens:** the listing or data is removed or hidden, and the source URL
  is added to a suppression list so it is not collected again.
- **Records:** we keep a log of each request, the date and the action taken
  (PDPA s.12), without keeping the removed data itself.
- **Source sites:** a site owner who wants us to stop crawling can email us, add
  a `robots.txt` rule for `MotorMilaBot`, or simply block us — we will not work
  around it. We would rather partner: we send every click to the source ad.

## 6. Personal data (PDPA No. 9 of 2022)

Our legal basis for processing listing facts is legitimate interests (helping
buyers compare vehicle prices). We minimise personal data as described above,
keep no seller contact data for scraped ads, and honour objection and erasure
requests through the process in §5. Data is hosted with cloud providers outside
Sri Lanka (Vercel, Neon, Cloudflare, Hugging Face).

## 7. Contact

Data and takedown requests: the address in the `BOT_CONTACT` setting, which is
also published in our crawler's User-Agent and on
<https://motormila.vercel.app/bot>.

---

_Technical reference: `backend/app/scrapers/polite.py` (UA, robots, throttle, source
flags), `backend/app/utils/pii.py` (contact stripping),
`backend/app/utils/listing_lifecycle.py` (30-day expiry). This is a policy statement,
not legal advice; have it reviewed by a Sri Lankan lawyer._
