# Outbound run

Scheduled. Weekdays, once in the morning. Run it with `npm run demo`.

```
discover → suppress/dedupe → enrich profile + posts → enrich website
→ detect signals → score → tier → rank → action → draft → approval queue
```

| # | Step | Owner | Code | Output | Notes |
|---|---|---|---|---|---|
| 1 | Discover | lead-scout | `discover()` | `Candidate[]` | Query X for listening phrases. Keep the trigger post. |
| 2 | Filter | lead-scout | `discover()` | `Candidate[]` | Dedupe, drop suppressed, drop matches older than 14 days. **Before anything costs money.** |
| 3 | Enrich profile | lead-qualifier | `enrich()` | `XProfile`, `XPost[]` | Profile + last 20 posts. |
| 4 | Enrich company | lead-qualifier | `enrich()` | `CompanyProfile` | Crawl the site linked in bio, extract into fixed fields. |
| 5 | Signals | lead-qualifier | `detectSignals()` | `SignalHit[]` | Every hit carries evidence. |
| 6 | Score + tier | code | `qualify()` | `Qualification` | Weighted sum, hard gates, confidence. No model involved. |
| 7 | Rank | coordinator | `run.ts` | ordered list | Tier, then score. |
| 8 | Action + angle | code | `qualify()` | `dm` / `comment` / `monitor` / `reject` | See action rules in `QUALIFICATION-SIGNALS.md`. |
| 9 | Draft | dm-agent | `draftOutbound()` | `Draft` | Only for `dm` and `comment`. |
| 10 | Approve | human | `ApprovalQueue` | approved / edited / rejected | Nothing sends without this. |

## What the demo run shows

10 search hits become 7 candidates (1 duplicate, 1 stale, 1 suppressed). Those 7 rank as:

| Lead | Score | Tier | Action | Why it lands there |
|---|---|---|---|---|
| @mara_hollis | 94 | HIGH | dm | Founder, $1.2M ARR, hiring first SDR this quarter |
| @teodor_lind | 88 | HIGH | comment | Strong fit, but no stated intent. Warm up on the referral post first |
| @jenna_kowal | 68 | MEDIUM | comment | Asked publicly for agencies, but 60 staff and not the founder. One post carries both intent and problem, so problem counts at half weight |
| @sofia_reyes_cfo | 44 | LOW | monitor | Fits on paper, but thin site and few posts. Incomplete, not weak |
| @lena_marsh | 37 | REJECT | reject | Real owner, real business, but B2C and low-ticket |
| @example_spam_bot_01 | — | REJECT | reject | Hard gate: bot pattern |
| @kai_buildsfocus | — | REJECT | reject | Hard gate: student side project |

Lena is the interesting one: 9 of 12 positive signals and still rejected. Industry fit outweighs enthusiasm.

## Operating notes

- **Monitor means re-check, not forget.** LOW leads go back into the next run's candidate pool. Two more weeks of posts often moves them.
- **Comment before DM** unless there's explicit intent. A useful public reply earns the DM.
- **Volume cap.** Queue at most 15 drafts per run. A human can review 15 properly; they can't review 60.
- **Calibrate monthly.** See the bottom of `QUALIFICATION-SIGNALS.md`.
