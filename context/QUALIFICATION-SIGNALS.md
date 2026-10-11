# Qualification signals

The scoring model that `src/qualification.ts` implements. If you change a weight here, change it there in the same commit.

## How a score is built

1. Each signal is detected with **evidence**: a quote, a number, or a field. No evidence, no signal.
2. `score = sum(positive weights) − sum(negative weights)`, clamped to 0–100.
3. Positive weights add up to exactly 100, so a lead with every positive signal and no negatives scores 100.
4. **Hard gates** (spam, student/hobby) force REJECT whatever the score.
5. **One post can't earn both `buying_intent` and `problem_fit` at full weight.** If the only evidence for `problem_fit` is the same post that fired `buying_intent`, `problem_fit` counts at half weight (6). Independent evidence (a different post, or intent that came from a job listing) earns full weight for both.
6. Missing data means the signal didn't fire. It is not a negative. A thin profile scores low *and* gets low confidence, so it gets monitored, not rejected.

## Positive signals (total 100)

| id | weight | fires when |
|---|---|---|
| `decision_maker` | 14 | Bio says founder, co-founder, CEO, owner, managing director/partner |
| `buying_intent` | 12 | Post in the last 30 days asks for vendors / mentions hiring an SDR, or the company is hiring a sales role |
| `problem_fit` | 12 (6 if shared) | Posts describe a problem we solve: founder-led sales, referral or event dependence, outbound gap. Half weight when its only evidence is the `buying_intent` post |
| `b2b` | 10 | Company category is B2B software or services |
| `clear_offer` | 10 | Website states what they sell |
| `business_maturity` | 10 | Revenue mention, team of 5+, or hiring |
| `client_results` | 8 | Any case study, or 3+ testimonials |
| `credible_website` | 6 | Site is more than a landing page |
| `active_on_x` | 6 | 8+ posts in the last 30 days |
| `recent_activity` | 4 | Posted in the last 7 days |
| `tier1_market` | 4 | HQ in US, GB, CA, AU, NZ, IE |
| `relevant_model` | 4 | B2B with high-ticket or mid pricing |

## Negative signals

| id | weight | fires when |
|---|---|---|
| `spam_bot` | gate | 2+ of: following/followers > 10, account < 90 days old, 150+ posts in 30 days, promo language |
| `student_hobby` | gate | Bio says student / side project / hobby / $0 MRR, and no revenue evidence |
| `irrelevant_industry` | −25 | Company is B2C |
| `no_commercial_offer` | −20 | Website found but no offer on it |
| `no_buying_ability` | −20 | Team of 2 or fewer, no revenue evidence, low or unknown pricing |
| `inactive_account` | −15 | No post in 60+ days |
| `poor_service_fit` | −12 | Low-ticket offer, or 50+ staff |
| `wrong_geography` | −10 | HQ known and outside Tier 1 |
| `missing_company_info` | −10 | No website, or a thin site with no team size and no proof |

## Tiers

| score | tier |
|---|---|
| 80–100 | HIGH |
| 60–79 | MEDIUM |
| 40–59 | LOW |
| < 40 or any gate | REJECT |

## Confidence

Count four coverage checks: 3+ posts inspected, company found, solid website, team size known. Drop one if the score is within 3 points of a tier boundary.
4 = high, 2–3 = medium, 0–1 = low.

## Recommended action

Checked in order. The first rule that matches wins.

| condition | action |
|---|---|
| REJECT | `reject` |
| LOW | `monitor` (re-check next run) |
| Lead is publicly asking for vendors | `comment` (answer in public; never cold-DM a public question) |
| HIGH + buying intent + confidence not low | `dm` |
| Recent post (≤ 14 days) carrying the problem or intent | `comment` |
| Otherwise | HIGH → `dm`, MEDIUM → `monitor` |

## Outreach angle

Picked from the first pattern that matches the lead's posts, in this priority order:

`pre_hire` → `vendor_search` → `founder_bottleneck` → `event_dependence` → `referral_dependence` → `outbound_gap` → `none`

## Calibration

These weights are a starting hypothesis. Once a month, compare tier against outcome (replied, booked, closed). If MEDIUM leads book calls as often as HIGH leads, the weights are wrong, not the leads.
