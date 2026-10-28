# Record of Processing Activities (ROPA) + short DPIA

**Draft template for the PDPA No. 9 of 2022 (as amended by Act No. 22 of 2025).** Part I and Part III duties start **1 January 2027**. Not legal advice. Have a Sri Lankan data-protection lawyer review it.

Controller: [COMPANY NAME] (Pvt) Ltd, trading as MotorMila · Reg. no. [PV…] · Address [ADDRESS]
DPO / privacy contact: [NAME], hello@ardenostudio.com · Last reviewed: [DATE]

## Part A: Record of Processing Activities (s.12)

| # | Activity | Data subjects | Personal data | Purpose | Legal basis (Sched. I) | Source | Recipients / processors | Location | Retention | Safeguards |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Listing aggregation | Private sellers, sole-trader dealers | Possibly names, phones in text, faces / number plates in photos, location (district/town), source URL | Show vehicle prices; compute market statistics | (f) legitimate interests | Public ads on ikman, Riyasewana, patpat, Hit Ad, SaleMe, RiyaHub, AutoLanka, AutoDirect, AutoStream, Carshop, Cartivate, DIMO, PermitSale | Neon (DB), Cloudflare R2, Hugging Face (API host), Vercel | US / EU | Live ad + 90 days; afterwards anonymous aggregates only | No phones/names extracted [confirm once data-legal ships]; no photo rehosting; link-out; removal form (72h); suppression list |
| 2 | User accounts | Registered users | Email, name, password hash, plan, login times, token version | Provide the service | (b) contract | User | Neon, Hugging Face, Vercel, email provider | US / EU | Account life; 14 days after deletion request | Bcrypt hashing, HTTPS, admin access limited |
| 3 | First-party ads (Sell your car) | Users who post ads | Contact name, phone, photos, vehicle details | Publish the user's ad | (b) contract | User | As #2, plus R2 for photos | US / EU | While live + 90 days | Moderation queue; owner can delete |
| 4 | Alerts & notifications | Users | Saved searches; phone / Telegram ID / email / push token | Send alerts the user asked for | (a) consent | User | WhatsApp/Meta, Telegram, email provider, web push | US / EU | Until turned off | Opt-in, opt-out in Settings |
| 5 | Leasing / inspection / insurance leads | Buyers | Name, phone, email, district, vehicle, budget, down payment, preferred date, notes, consent text + timestamp, hashed IP | Pass the request to the named partner | (a) consent | User | Named partner(s) only; Neon | Sri Lanka (partners), US / EU (hosting) | 12 months | Versioned consent; max 3 partners; honeypot + rate limit; admin-only export |
| 6 | Payments | Paying users | Email, name, phone (for PayHere), order, plan, amount, status. **No card data** | Take payment, grant plan | (b) contract; (c) legal obligation (accounting) | User, PayHere notify | PayHere (Pvt) Ltd | Sri Lanka | 6 years | md5sig verification; secret in env only |
| 7 | Removal & deletion requests | Anyone | Name, email, phone, URL, reason, details | Handle rights requests; keep proof | (c) legal obligation | Requester | Ops mailbox | US / EU | 3 years | Admin-only access |
| 8 | Security logs & analytics | Visitors | IP, user agent, session-scoped random ID, page events | Security, abuse prevention, product analytics | (f) legitimate interests | Automatic | Hugging Face, Vercel Analytics (cookieless), Sentry (no PII) | US / EU | 90 days | No ad trackers; IP hashed on lead forms |

**Cross-border transfers (s.26 as replaced in 2025):** keep the DPAs / terms of Vercel, Neon, Cloudflare, Hugging Face, Sentry, Resend (or SMTP provider), Meta (WhatsApp), Telegram and PayHere on file in `[DRIVE FOLDER]`. Check the replaced s.26 text with the lawyer.

## Part B: Short DPIA (s.24)

**Processing assessed:** #1 listing aggregation (incl. price history and the perceptual-hash re-listing check) and #5 lead routing.

1. **Description:** we collect public vehicle ads at a limited rate, keep vehicle facts and the source link, build price statistics, and spot the same car being re-listed using an image hash.
2. **Necessity and proportionality:** buyers benefit from comparing prices across sites. Statistics need vehicle facts, not seller identities, so seller identifiers are not needed and are not kept.
3. **Legitimate-interest balancing (Sched. I(f), (h)(ii)):** a seller posting a public ad expects buyers to see it. They don't expect their phone number to be republished, kept after the sale, or linked into a history of their own listings. → No phone numbers or names stored; image hash used for **car-level** fraud signals only, never to profile a person; deletion within 90 days of the ad ending.
4. **Risks:**

| Risk | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Seller phone numbers harvested by spammers from MotorMila | Med → Low | High | Don't extract or store phones; link to source | Low |
| Profiling of individual sellers via re-listing hash | Low | Med | Hash linked to vehicle only; no seller ID column | Low |
| Leads shared beyond consent | Low | High | Named partners on form; versioned consent; max 3; contract with partners | Low |
| Breach of lead or account DB | Low | High | Encrypted transport, least-privilege DB creds, rotation, breach plan (s.23) | Low–Med |
| Stale / wrong ad shown as live (misleading) | Med | Med | Freshness timestamps; hide inactive ads | Low |
| Overseas hosting | High (certain) | Low–Med | Provider DPAs; s.26 check | Low |

5. **Data-subject rights:** removal form (72h), deletion page (14 days), hello@ardenostudio.com mailbox; reply within 21 working days.
6. **Sign-off:** DPO [NAME] · Date [DATE] · Next review [DATE + 12 months, or on any new processing].
