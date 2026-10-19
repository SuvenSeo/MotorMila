# Template: leasing / finance lead partnership

**To:** Head of Leasing / Digital / Vehicle Finance at [COMPANY] (LOLC, Central Finance, People's Leasing, Siyapatha, HNB Finance, Commercial Bank, Seylan, Mercantile Investments…)
**Subject:** Consented vehicle-leasing leads from buyers looking at a specific car

---

Dear [NAME],

MotorMila is a Sri Lankan vehicle price-comparison site. Buyers come to check whether a car is fairly priced, usually days before they decide how to pay for it.

We've added a **"Get a leasing quote"** form to every listing and to our monthly-cost calculator. Each lead includes:
- name and mobile number (verified format), optional email and district;
- the exact vehicle (make, model, year) and its asking price;
- the buyer's budget and down payment;
- a recorded consent (timestamp and exact wording) naming [COMPANY] as the recipient, in line with the PDPA.

**Proposal**
- **Free 30-day pilot**, so you can judge lead quality before paying.
- After that, **LKR [500–2,000] per qualified lead**, or [0.25–0.5]% of the disbursed amount on funded facilities, whichever you prefer.
- Delivery by email, a webhook into your CRM, or a daily CSV. We de-duplicate repeat requests within 24 hours.
- At most [3] partners per lead, named to the buyer before they submit.

Could we set up a 20-minute call to agree the lead fields and the hand-off?

Kind regards,
Suven Seoras · Founder, MotorMila
[PHONE] · [EMAIL]

---
*Setup after a yes:* *add the partner to `LEADS_PARTNERS_JSON` (`"finance": [{"id":"[slug]","name":"[Legal name]","email":"[leads inbox]","webhook":"[optional]","privacy_url":"[their privacy page]"}]`), then set `LEADS_DELIVERY_ENABLED=true`. Get a signed referral agreement (data-sharing clause, PDPA processor/controller roles, payment terms) first.*
