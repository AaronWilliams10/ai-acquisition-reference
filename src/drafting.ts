// Drafting (dm-agent). Templates stand in for the model here so the demo is
// deterministic and runs offline. In production the dm-agent writes these from
// agents/dm-agent.md with the same inputs: lead, qualification, angle, history.
// Every draft, templated or generated, goes to the approval queue. Nothing in
// this file sends anything.

import type { ConversationRecord, ConversationState, Draft, EnrichedLead, InboundDm, Qualification } from "./types.js";
import { angleKeyFor, commentTarget, type AngleKey } from "./qualification.js";

// Fictional offer used in replies. The price range is example pricing for this
// reference only, not anyone's real price list.
export const OFFER = {
  priceRange: "$5k–$8k/month",
  callLength: "20 minutes",
};

const first = (lead: EnrichedLead) => lead.profile.displayName.split(" ")[0];

const DM_OPENERS: Record<AngleKey, (l: EnrichedLead) => string> = {
  pre_hire: (l) =>
    `Hey ${first(l)}, saw you're hiring your first SDR. In my experience first SDRs stall on research, not calls. Will yours inherit an account list with a reason to contact each one, or is building that part of the job?`,
  vendor_search: (l) =>
    `Hey ${first(l)}, saw your post asking about outbound partners. Happy to share how we'd approach your market if useful, no deck.`,
  founder_bottleneck: (l) =>
    `Hey ${first(l)}, your post on founder-led sales hit home. Curious: how many hours a week are you still spending on finding new accounts versus closing them?`,
  event_dependence: (l) =>
    `Hey ${first(l)}, saw your note about pipeline clustering around conferences. What happens to your calendar in the months between events?`,
  referral_dependence: (l) =>
    `Hey ${first(l)}, referral-led pipeline with good close rates is a strong base. Have you tried running anything alongside it, or has it never been worth the distraction?`,
  outbound_gap: (l) =>
    `Hey ${first(l)}, saw you're thinking about outbound. What have you tried so far, and what made you stop?`,
  none: (l) => `Hey ${first(l)}, enjoyed your recent posts. What's the main thing you're working on this quarter?`,
};

const COMMENTS: Partial<Record<AngleKey, string>> = {
  referral_dependence:
    "The feast-or-famine part is the real cost of referral-only pipeline, more than the volume. What I've seen work: keep referrals as the main channel and add a small, research-heavy list (30–50 accounts) that gets worked every week regardless. Predictability first, volume later.",
  vendor_search:
    "Not a pitch, just a filter that saves time: before signing, ask each agency for 10 accounts they'd target for you and the reason for each. If the reasons are generic (\"Series A, 50–200 staff\"), they don't understand technical buyers either.",
  founder_bottleneck:
    "The handover that usually works: founder keeps the first call, everything before it (finding, researching, first touch) becomes a system. The founder's voice survives if they write the playbook, not every message.",
  event_dependence:
    "Conferences are great at creating trust and terrible at creating consistency. The teams I've seen fix this keep events for closing and run a small always-on list for the 10 months in between.",
  pre_hire:
    "Biggest thing I'd do differently: build the account list and trigger list before the SDR starts. Most first SDRs spend their first quarter doing research the company should have handed them.",
};

export function draftOutbound(lead: EnrichedLead, q: Qualification, now: Date): Draft | null {
  const angle = angleKeyFor(lead);
  const rationale = `${q.tier} ${q.score}, angle: ${angle}. ${q.outreachAngle}`;

  if (q.recommendedAction === "dm") {
    return { kind: "dm", to: lead.profile.handle, text: DM_OPENERS[angle](lead), rationale };
  }
  if (q.recommendedAction === "comment") {
    const post = commentTarget(lead, now);
    const text = COMMENTS[angle];
    if (!post || !text) return null;
    return { kind: "comment", to: lead.profile.handle, inReplyToPostId: post.id, text, rationale };
  }
  return null; // monitor / reject: nothing to send
}

// ---------- Inbound ----------

export interface ConversationRead {
  state: ConversationState;
  asks: Array<"pricing" | "how_it_works" | "call">;
  daysSinceLastTouch: number | null;
}

const PROMO_DM = /followers|whitelist|crypto|promo|guaranteed|cheap price/i;
const OBJECTION = /not sure|too expensive|tried (this|agencies)|didn'?t work|skeptical/i;

export function readConversation(dm: InboundDm, history: ConversationRecord | null, q: Qualification): ConversationRead {
  const asks: ConversationRead["asks"] = [];
  if (/cost|price|pricing|how much|budget/i.test(dm.text)) asks.push("pricing");
  if (/how does|look like|how it works|setup|process/i.test(dm.text)) asks.push("how_it_works");
  if (/\bcall\b|calendar|book|time to talk|jump on/i.test(dm.text)) asks.push("call");

  const last = history?.messages.at(-1);
  const daysSinceLastTouch = last
    ? Math.floor((new Date(dm.receivedAt).getTime() - new Date(last.sentAt).getTime()) / 86_400_000)
    : null;

  const isSpam = q.negativeSignals.some((s) => s.id === "spam_bot") || PROMO_DM.test(dm.text);
  const state: ConversationState = isSpam ? "spam"
    : q.tier === "REJECT" ? "not_a_fit"
    : asks.includes("call") ? "scheduling"
    : OBJECTION.test(dm.text) ? "objection"
    : history && daysSinceLastTouch !== null && daysSinceLastTouch > 30 ? "reengaged"
    : asks.includes("pricing") ? "pricing_question"
    : "new_cold_inbound";

  return { state, asks: state === "spam" ? [] : asks, daysSinceLastTouch };
}

export function draftReply(
  dm: InboundDm,
  lead: EnrichedLead,
  q: Qualification,
  read: ConversationRead,
  history: ConversationRecord | null,
): Draft | null {
  const name = first(lead);
  const angle = angleKeyFor(lead);
  const parts: string[] = [];

  switch (read.state) {
    case "spam":
      return null; // no reply, archive
    case "not_a_fit":
      return {
        kind: "reply", to: lead.profile.handle,
        text: `Thanks for reaching out, ${name}. Honestly, I don't think we're the right fit for where you are right now, and I'd rather say that than waste your time. If things change, my DMs are open.`,
        rationale: `Sender qualified ${q.tier} (${q.score}). Polite close, no pitch.`,
      };
    case "reengaged": {
      const lastUs = history?.messages.at(-1)?.sentAt;
      const month = lastUs ? new Date(lastUs).toLocaleString("en-GB", { month: "long", timeZone: "UTC" }) : "last time";
      parts.push(`Hey ${name}, glad the timing's better than in ${month}.`);
      break;
    }
    default:
      parts.push(`Hey ${name}, thanks for the message.`);
  }

  if (read.asks.includes("how_it_works") || read.state === "reengaged") {
    parts.push(
      "Short version: we build a list of accounts that match your ICP, watch for signs they're feeling the problem, and hand your team researched accounts with a first message drafted. A human approves everything before it goes out.",
    );
  }
  const team = /\bAEs?\b/.test(dm.text) ? "your new AEs" : "your team";
  if (angle === "event_dependence") parts.push(`With pipeline only showing up around conferences, the point would be giving ${team} accounts to work between events.`);
  else if (angle === "referral_dependence") parts.push(`The point would be a second, predictable channel next to referrals for ${team}.`);
  if (read.asks.includes("pricing")) {
    parts.push(`Pricing is a retainer, usually ${OFFER.priceRange} depending on volume. I'd rather give you a real number once I know how many accounts you want worked.`);
  }
  if (read.state === "objection") parts.push("Fair concern. What did you try before, and where did it break?");
  else parts.push(`Worth ${OFFER.callLength} next week to look at it properly?`);

  return {
    kind: "reply", to: lead.profile.handle, text: parts.join(" "),
    rationale: `State: ${read.state}; asks: ${read.asks.join(", ") || "none"}; sender ${q.tier} ${q.score}; angle: ${angle}.`,
  };
}
