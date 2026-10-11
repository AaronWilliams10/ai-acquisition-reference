# Inbound DM

Event-driven. Runs on every new DM. Run it with `npm run demo:inbound`.

```
DM received → identify sender → conversation history → profile → company
→ qualify sender → read conversation state → draft reply → human approval → log
```

| # | Step | Owner | Code |
|---|---|---|---|
| 1 | Receive | n8n webhook / poller | payload = `examples/example-inbound-dm.json` |
| 2 | Identify + history | coordinator | `ConversationStore.get()` |
| 3 | Profile + company | lead-qualifier | `enrich()`, the same function as outbound |
| 4 | Qualify | code | `qualify()`, the same scoring as outbound |
| 5 | Conversation state | dm-agent | `readConversation()` |
| 6 | Draft | dm-agent | `draftReply()`, or `null` for spam |
| 7 | Approve | human | `ApprovalQueue.decide()` |
| 8 | Send | code | `send()` refuses anything not approved |
| 9 | Log | code | `out/run-log.jsonl` |

Inbound senders go through **the same qualification as outbound leads**. Someone who DMs you isn't automatically a fit, and a HIGH inbound deserves a faster, better reply than a LOW one.

## Worked example: @dana_okoro

**History.** In November we commented on Dana's thread, then DM'd. Dana replied:

> "Conferences and my co-founder's network. Honestly works fine for now. Ask me again after Q1, we're heads down on the SOC 2 audit."

CRM note: *Deferred, "ask me again after Q1". SOC 2 audit in progress. Pipeline is conference + co-founder network.*

**New DM, 15 March:**

> "Hey, audit's done 🎉 and Q1 is basically over. Pipeline is still 100% conferences and we've got two AEs starting in April with nothing to work. What does your setup actually look like and roughly what does it cost?"

**What the pipeline does:**

| Step | Result |
|---|---|
| Identify | Known contact, 3 prior messages, CRM note present |
| Qualify | **HIGH 92**: co-founder & CEO, B2B SaaS, ~$75k MRR, hiring an AE, conference-dependent pipeline, US. Confidence medium (only 2 recent posts) |
| State | `reengaged`: existing thread, last touch 130 days ago (over the 30-day threshold). Asks: `pricing`, `how_it_works` |
| Angle | `event_dependence`: pipeline only exists around conferences |
| Draft | below |
| Outcome | Queued as `apr-001`. Waits for a human |

**Draft reply:**

> Hey Dana, glad the timing's better than in November. Short version: we build a list of accounts that match your ICP, watch for signs they're feeling the problem, and hand your team researched accounts with a first message drafted. A human approves everything before it goes out. With pipeline only showing up around conferences, the point would be giving your new AEs accounts to work between events. Pricing is a retainer, usually $5k–$8k/month depending on volume. I'd rather give you a real number once I know how many accounts you want worked. Worth 20 minutes next week to look at it properly?

Why it's written that way (from `agents/dm-agent.md`): it acknowledges the deferral first, answers both questions asked, uses Dana's own context (conferences, new AEs), gives a price range rather than dodging, and ends on one question.

**What a reviewer might change:** "glad the timing's better" is fine. A human who remembers the audit might add "congrats on SOC 2". That edit is exactly what the approval step is for.

## Contrast: spam

`@example_growth_bot_02`: "I can increase your followers by 10k organic 🚀 cheap price". It hits the spam hard gate (16-day-old account, follows 6,100, followed by 85, 220 posts a month, promo language). State `spam`, no draft, archived, logged.
