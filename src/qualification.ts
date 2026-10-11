// Stage 3 — qualification (lead-qualifier, judgement half).
//
// Design rule: signals are detected, the score is computed. In production the
// soft signals (problem_fit, buying_intent) are extracted by the lead-qualifier
// agent into the same SignalHit shape, with a quoted piece of evidence. The
// arithmetic below never moves into a prompt — a model asked for "a score out
// of 100" drifts, a weighted sum doesn't.
//
// Weights mirror context/QUALIFICATION-SIGNALS.md. Positive weights sum to 100,
// so a lead that fires every positive signal and no negatives scores 100.

import type { Confidence, EnrichedLead, NextAction, Qualification, SignalHit, Tier, XPost } from "./types.js";

const DAY = 86_400_000;
const TIER1 = new Set(["US", "GB", "CA", "AU", "NZ", "IE"]);

// Ordered by outreach-angle priority: the first pattern that matches a lead's
// posts decides the angle.
const PATTERNS = [
  { key: "pre_hire", kind: "intent", re: /\bSDRs?\b|first sales hire|hiring (an? )?(AE|account exec)/i },
  { key: "vendor_search", kind: "intent", re: /recommendations? for|anyone (used|recommend)|looking for an? (agency|partner|consultant)|budget('s| is) approved/i },
  { key: "founder_bottleneck", kind: "problem", re: /founder-led sales|i do all (the|our) sales/i },
  { key: "event_dependence", kind: "problem", re: /conference/i },
  { key: "referral_dependence", kind: "problem", re: /referral|word of mouth|my network|co-founder's network/i },
  { key: "outbound_gap", kind: "problem", re: /outbound|cold (email|dm)s?\b/i },
] as const;

type PatternKey = (typeof PATTERNS)[number]["key"];

const ANGLES: Record<AngleKey, string> = {
  pre_hire: "About to hire for outbound. A new SDR needs a qualified pipeline on day one; the system builds it, and it's a cheaper test than a hire.",
  vendor_search: "Publicly asking for vendors. Answer the question in-thread with something genuinely useful; let them come to you.",
  founder_bottleneck: "Founder is the sales bottleneck. Take prospecting and first touch off their plate without losing their voice.",
  event_dependence: "Pipeline only exists around events. Pitch an always-on channel between conferences, not a replacement for them.",
  referral_dependence: "Pipeline depends on referrals. Position a predictable second channel alongside referrals, not instead of them.",
  outbound_gap: "Already thinking about outbound. Lead with research-led outreach to a short account list over volume.",
  none: "No stated pain. Engage on their latest post topic and don't pitch yet.",
};

const PROMO_RE = /\b(gems|whitelist|NFA)\b|DM for promo|followers guaranteed|\d+k (organic|targeted) followers/i;
const HOBBY_RE = /\b(student|side project|hobby|learning to code)\b|\$0 MRR/i;
const FOUNDER_RE = /\b(founder|co-founder|ceo|owner|managing (director|partner))\b/i;
const SALES_ROLE_RE = /\bSDR\b|account exec|sales/i;

interface SignalDef {
  id: string;
  label: string;
  polarity: "positive" | "negative";
  weight: number;
  disqualifier?: boolean;
  // evidence, or evidence with a reduced weight, or null
  detect: (lead: EnrichedLead, now: Date) => string | { evidence: string; weight: number } | null;
}

const daysSince = (iso: string, now: Date) => Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
const ago = (d: number) => (d === 0 ? "today" : `${d}d ago`);

function quote(text: string, re: RegExp): string {
  const m = re.exec(text);
  if (!m) return text.slice(0, 80);
  const start = Math.max(0, m.index - 25);
  const end = Math.min(text.length, m.index + m[0].length + 35);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function firstMatch(posts: XPost[], re: RegExp): XPost | undefined {
  return posts.find((p) => re.test(p.text));
}

// The post that fires buying_intent, if intent came from a post (not a job listing).
function intentPost(lead: EnrichedLead, now: Date): { post: XPost; re: RegExp } | undefined {
  const recent = lead.recentPosts.filter((p) => daysSince(p.postedAt, now) <= 30);
  for (const pat of PATTERNS.filter((p) => p.kind === "intent")) {
    const post = firstMatch(recent, pat.re);
    if (post) return { post, re: pat.re };
  }
  return undefined;
}

function country(lead: EnrichedLead): string | null {
  return lead.company?.hqCountry ?? null;
}

export const SIGNALS: SignalDef[] = [
  // ---------- positive (sum = 100) ----------
  { id: "decision_maker", label: "Founder / decision-maker", polarity: "positive", weight: 14,
    detect: (l) => (FOUNDER_RE.test(l.profile.bio) ? `bio: "${quote(l.profile.bio, FOUNDER_RE)}"` : null) },
  { id: "buying_intent", label: "Buying / intent signal", polarity: "positive", weight: 12,
    detect: (l, now) => {
      const hit = intentPost(l, now);
      if (hit) return `post ${ago(daysSince(hit.post.postedAt, now))}: "${quote(hit.post.text, hit.re)}"`;
      const role = l.company?.hiringFor.find((r) => SALES_ROLE_RE.test(r));
      return role ? `hiring: ${role}` : null;
    } },
  { id: "problem_fit", label: "Clear problem we solve", polarity: "positive", weight: 12,
    detect: (l, now) => {
      // One post can't earn both intent and problem at full weight. Prefer
      // independent evidence; fall back to the intent post at half weight.
      const shared = intentPost(l, now)?.post;
      const problems = PATTERNS.filter((p) => p.kind === "problem");
      for (const pat of problems) {
        const post = firstMatch(l.recentPosts.filter((p) => p !== shared), pat.re);
        if (post) return `"${quote(post.text, pat.re)}"`;
      }
      for (const pat of problems) {
        if (shared && pat.re.test(shared.text)) {
          return { evidence: `"${quote(shared.text, pat.re)}" (same post as buying_intent, half weight)`, weight: 6 };
        }
      }
      return null;
    } },
  { id: "b2b", label: "B2B company", polarity: "positive", weight: 10,
    detect: (l) => (l.company?.category.startsWith("b2b") ? `${l.company.name}: ${l.company.category.replace("_", " ")}` : null) },
  { id: "clear_offer", label: "Clear commercial offer", polarity: "positive", weight: 10,
    detect: (l) => l.company?.offer ?? null },
  { id: "business_maturity", label: "Revenue / business maturity", polarity: "positive", weight: 10,
    detect: (l) => {
      const c = l.company;
      if (!c) return null;
      if (c.revenueHint) return c.revenueHint;
      if ((c.teamSize ?? 0) >= 5) return `team of ${c.teamSize}`;
      if (c.hiringFor.length) return `hiring: ${c.hiringFor.join(", ")}`;
      return null;
    } },
  { id: "client_results", label: "Client / customer results", polarity: "positive", weight: 8,
    detect: (l) => {
      const c = l.company;
      if (!c || (c.caseStudies === 0 && c.testimonials < 3)) return null;
      return `${c.caseStudies} case studies, ${c.testimonials} testimonials`;
    } },
  { id: "credible_website", label: "Credible website", polarity: "positive", weight: 6,
    detect: (l) => (l.company?.siteQuality === "solid" ? l.company.domain : null) },
  { id: "active_on_x", label: "Active on X", polarity: "positive", weight: 6,
    detect: (l) => (l.profile.postsLast30d >= 8 ? `${l.profile.postsLast30d} posts in 30d` : null) },
  { id: "recent_activity", label: "Posted in last 7 days", polarity: "positive", weight: 4,
    detect: (l, now) => {
      const d = daysSince(l.profile.lastPostAt, now);
      return d <= 7 ? `last post ${ago(d)}` : null;
    } },
  { id: "tier1_market", label: "English-speaking Tier 1 market", polarity: "positive", weight: 4,
    detect: (l) => {
      const c = country(l);
      return c && TIER1.has(c) ? c : null;
    } },
  { id: "relevant_model", label: "High-value B2B model", polarity: "positive", weight: 4,
    detect: (l) => {
      const c = l.company;
      return c && c.category.startsWith("b2b") && (c.pricing === "high_ticket" || c.pricing === "mid")
        ? `${c.pricing.replace("_", "-")} pricing`
        : null;
    } },

  // ---------- negative ----------
  { id: "spam_bot", label: "Spam / bot account", polarity: "negative", weight: 100, disqualifier: true,
    detect: (l, now) => {
      const p = l.profile;
      const tells = [
        p.following / Math.max(p.followers, 1) > 10 && `follows ${p.following}, followed by ${p.followers}`,
        daysSince(p.accountCreatedAt, now) < 90 && `account ${daysSince(p.accountCreatedAt, now)}d old`,
        p.postsLast30d > 150 && `${p.postsLast30d} posts in 30d`,
        (PROMO_RE.test(p.bio) || l.recentPosts.some((x) => PROMO_RE.test(x.text))) && "promo/giveaway language",
      ].filter(Boolean);
      return tells.length >= 2 ? tells.join("; ") : null;
    } },
  { id: "student_hobby", label: "Student / hobby project", polarity: "negative", weight: 100, disqualifier: true,
    detect: (l) => (HOBBY_RE.test(l.profile.bio) && !l.company?.revenueHint ? `bio: "${quote(l.profile.bio, HOBBY_RE)}"` : null) },
  { id: "irrelevant_industry", label: "Irrelevant industry", polarity: "negative", weight: 25,
    detect: (l) => (l.company?.category === "b2c" ? `${l.company.name} is B2C (${l.company.oneLiner.toLowerCase()})` : null) },
  { id: "no_commercial_offer", label: "No commercial offer", polarity: "negative", weight: 20,
    detect: (l) => (l.company && !l.company.offer ? `no offer found on ${l.company.domain}` : null) },
  { id: "no_buying_ability", label: "No obvious buying ability", polarity: "negative", weight: 20,
    detect: (l) => {
      const c = l.company;
      const tiny = !c || ((c.teamSize ?? 0) <= 2 && !c.revenueHint && (c.pricing === "low" || c.pricing === "unknown"));
      return tiny ? `team ${c?.teamSize ?? "unknown"}, no revenue evidence, ${c?.pricing ?? "unknown"} pricing` : null;
    } },
  { id: "inactive_account", label: "Inactive account", polarity: "negative", weight: 15,
    detect: (l, now) => {
      const d = daysSince(l.profile.lastPostAt, now);
      return d > 60 ? `last post ${d}d ago` : null;
    } },
  { id: "poor_service_fit", label: "Poor match to service", polarity: "negative", weight: 12,
    detect: (l) => {
      const c = l.company;
      if (c?.pricing === "low") return "low-ticket offer can't carry the cost of outbound";
      if ((c?.teamSize ?? 0) > 50) return `${c!.teamSize} staff: past founder-led, buyer is a committee`;
      return null;
    } },
  { id: "wrong_geography", label: "Outside target geography", polarity: "negative", weight: 10,
    detect: (l) => {
      const c = country(l);
      return c && !TIER1.has(c) ? c : null;
    } },
  { id: "missing_company_info", label: "Missing company information", polarity: "negative", weight: 10,
    detect: (l) => {
      const c = l.company;
      if (!c) return "no website found";
      if (c.siteQuality === "thin" && c.caseStudies === 0 && c.teamSize === null) return `${c.domain}: thin site, no team or proof`;
      return null;
    } },
];

export function detectSignals(lead: EnrichedLead, now: Date): SignalHit[] {
  return SIGNALS.flatMap((s) => {
    const found = s.detect(lead, now);
    if (!found) return [];
    const { evidence, weight } = typeof found === "string" ? { evidence: found, weight: s.weight } : found;
    return [{ id: s.id, label: s.label, polarity: s.polarity, weight, evidence, ...(s.disqualifier && { disqualifier: true }) }];
  });
}

export function tierFor(score: number): Tier {
  if (score >= 80) return "HIGH";
  if (score >= 60) return "MEDIUM";
  if (score >= 40) return "LOW";
  return "REJECT";
}

// Confidence = how much of the picture we actually saw, knocked down one level
// when the score sits within 3 points of a tier boundary.
function confidenceFor(lead: EnrichedLead, score: number, disqualified: boolean): Confidence {
  if (disqualified) return "high"; // hard gates are written to be unambiguous
  const c = lead.company;
  let coverage = [lead.recentPosts.length >= 3, !!c, c?.siteQuality === "solid", c?.teamSize != null].filter(Boolean).length;
  if ([40, 60, 80].some((b) => Math.abs(score - b) <= 3)) coverage -= 1;
  return coverage >= 4 ? "high" : coverage >= 2 ? "medium" : "low";
}

export type AngleKey = PatternKey | "none";

export function angleKeyFor(lead: EnrichedLead): AngleKey {
  for (const pat of PATTERNS) if (firstMatch(lead.recentPosts, pat.re)) return pat.key;
  return "none";
}

// The post we'd reply to if the action is "comment": the most recent post in
// the last 14 days that carries the problem or intent.
export function commentTarget(lead: EnrichedLead, now: Date): XPost | undefined {
  return lead.recentPosts.find((p) => daysSince(p.postedAt, now) <= 14 && PATTERNS.some((pat) => pat.re.test(p.text)));
}

function actionFor(tier: Tier, hits: SignalHit[], confidence: Confidence, lead: EnrichedLead, now: Date): NextAction {
  if (tier === "REJECT") return "reject";
  if (tier === "LOW") return "monitor";
  const hasIntent = hits.some((h) => h.id === "buying_intent");
  const vendorSearch = lead.recentPosts.some((p) => PATTERNS[1].re.test(p.text));
  const canComment = !!commentTarget(lead, now);
  // Someone asking publicly gets a public answer, never a cold DM.
  if (vendorSearch && canComment) return "comment";
  if (tier === "HIGH" && hasIntent && confidence !== "low") return "dm";
  if (canComment) return "comment";
  return tier === "HIGH" ? "dm" : "monitor";
}

function reasoningFor(score: number, tier: Tier, pos: SignalHit[], neg: SignalHit[], confidence: Confidence): string {
  const gate = neg.find((n) => n.disqualifier);
  if (gate) return `Hard reject: ${gate.label.toLowerCase()} (${gate.evidence}). Score not considered.`;
  const top = [...pos].sort((a, b) => b.weight - a.weight).slice(0, 3).map((h) => h.label.toLowerCase());
  const against = neg.length ? `Against: ${neg.map((n) => `${n.label.toLowerCase()} (-${n.weight})`).join(", ")}.` : "No negative signals.";
  const missing = 12 - pos.length;
  return `${tier} at ${score}. ${pos.length}/12 positive signals, led by ${top.join(", ")}. ${against}` +
    (missing >= 5 ? ` ${missing} positives unproven, so treat as incomplete rather than weak.` : "") +
    ` Confidence ${confidence}.`;
}

export function qualify(lead: EnrichedLead, now: Date = new Date()): Qualification {
  const hits = detectSignals(lead, now);
  const positive = hits.filter((h) => h.polarity === "positive");
  const negative = hits.filter((h) => h.polarity === "negative");
  const disqualified = negative.some((h) => h.disqualifier);

  const raw = positive.reduce((s, h) => s + h.weight, 0) - negative.reduce((s, h) => s + h.weight, 0);
  const score = Math.max(0, Math.min(100, raw));
  const tier = disqualified ? "REJECT" : tierFor(score);
  const confidence = confidenceFor(lead, score, disqualified);

  return {
    handle: lead.profile.handle,
    score,
    tier,
    positiveSignals: positive,
    negativeSignals: negative,
    reasoning: reasoningFor(score, tier, positive, negative, confidence),
    confidence,
    recommendedAction: actionFor(tier, hits, confidence, lead, now),
    outreachAngle: tier === "REJECT" ? "n/a" : ANGLES[angleKeyFor(lead)],
  };
}
