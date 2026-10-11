# Architecture

The design choices behind this reference, and what each one protects against.

## Agents and code

| Agent | Owns | Code | Never does |
|---|---|---|---|
| coordinator | run order, budgets, routing, what reaches a human | `run.ts`, `handleInboundDm()` | research, write, send |
| lead-scout | finding candidates | `discover()`, `DiscoverySource` | enrich, score, contact |
| lead-qualifier | research + signal evidence | `enrich()`, `detectSignals()` | score, draft, contact |
| *(code)* | score, tier, confidence, action, angle | `qualify()` | — |
| dm-agent | conversation state + every draft | `readConversation()`, `draftOutbound()`, `draftReply()` | send |
| human | approve / edit / reject | `ApprovalQueue.decide()` | — |

Specialists don't call each other. The coordinator passes typed objects between them (`Candidate` → `EnrichedLead` → `Qualification` → `Draft` → `ApprovalItem`, all in `src/types.ts`). So each step can be tested, replayed or swapped from mock to model on its own.

## Decisions

### 1. Models extract evidence; code computes the score
Ask a model for "a fit score out of 100" and you get numbers that drift between runs, cluster around 70–85, and can't be explained. Here, the qualifier's job is to say *which* signals are present and quote the evidence. `qualify()` turns that into a score with fixed weights. You can audit a lead in 30 seconds, and changing a weight changes every lead the same way.

### 2. Missing data is not a negative
A thin profile isn't a bad lead; it's an unknown one. Unfired positives lower the score, but only explicit negatives subtract. Confidence tracks coverage separately. Result: Sofia (LOW 44, confidence low) is *monitored*, not rejected, and gets re-checked next run.

### 3. Hard gates are separate from the score
Spam and student/hobby accounts are rejected outright, whatever else fires. Otherwise a very active bot with a slick bio can score its way into the queue.

### 4. Filter before you spend
Dedupe, suppression and stale-post checks run in `discover()`, before any profile scrape or site crawl. In production, enrichment is the cost; discovery is cheap.

### 5. Comment before DM
Unless someone has shown explicit intent, the first touch is a useful public comment on the post that surfaced them. When someone asks for vendors in public, the reply is public too. `actionFor()` encodes this.

### 6. Approval is enforced in code
Every draft, outbound or inbound, goes through `ApprovalQueue`. `send()` throws unless the item is `approved` or `edited`. An agent can be told to ask first; code makes it impossible not to.

### 7. Inbound and outbound share qualification
An inbound DM is a lead who found you. Same `enrich()`, same `qualify()`. The only difference is that the dm-agent also reads conversation state before drafting.

## Data flow

```
Candidate ──enrich──▶ EnrichedLead ──detectSignals──▶ SignalHit[] ──qualify──▶ Qualification
                                                                                   │
InboundDm + ConversationRecord ──readConversation──▶ state + asks                  │
                                                         │                         │
                                                         └──────▶ draft ◀──────────┘
                                                                    │
                                                         ApprovalItem (pending)
                                                                    │ human
                                                         approved / edited / rejected
                                                                    │
                                                                send() + log
```

## Swapping mock for real

Every external dependency is behind an interface in `types.ts`:

| Interface | Mock | Real (shape provided or described) |
|---|---|---|
| `DiscoverySource` | `MockXSearch` | `ApifyXSearch` (provided, untested against a live actor) |
| `ProfileSource` | `MockProfileSource` | Apify profile/timeline actor or X API v2 |
| `CompanySource` | `MockCompanySource` | `ApifyCompanySource` + an injected LLM extractor (provided, untested) |
| `ConversationStore` | `MockConversationStore` | CRM / database synced from X DMs |
| approval | `ApprovalQueue` (JSON file) | Slack/Telegram buttons or an n8n wait node |
| send | `send()` (prints) | X API v2 DM / reply, same status check |

Moving to production means implementing these and leaving `qualification.ts` alone.

## Where an LLM goes in production

Only in three places, each with a fixed output schema:

1. **Company extraction**: crawled pages → `CompanyProfile`.
2. **Soft signals**: posts → `SignalHit` for `problem_fit` and `buying_intent`, with a quote.
3. **Drafting**: lead + qualification + history → `Draft`, following `agents/dm-agent.md`.

Hard signals (follower ratios, dates, country, team size) stay as rules. They're cheaper, faster and never hallucinate.

## Failure handling

| Failure | Behaviour |
|---|---|
| Profile not found (deleted / suspended) | Candidate dropped silently |
| Website down / crawl fails | `company = null` → `missing_company_info` fires, confidence drops |
| Unknown inbound sender (no profile) | Escalated to a human, no draft |
| Draft not approved | Never sent; stays in queue or is logged as rejected |
