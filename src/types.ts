// Shared data contracts. Every stage reads and writes these shapes, whether the
// data comes from the mock world, an Apify actor, or an LLM extraction step.

// ---------- Raw source data ----------

export interface XProfile {
  handle: string;
  displayName: string;
  bio: string;
  location: string;
  followers: number;
  following: number;
  accountCreatedAt: string; // ISO
  postsLast30d: number;
  lastPostAt: string; // ISO
  website?: string; // domain only, e.g. "ledgermoor.example"
}

export interface XPost {
  id: string;
  handle: string;
  text: string;
  postedAt: string; // ISO
  likes: number;
  replies: number;
}

// What the website step hands back. In production this is a crawl
// (Apify website-content-crawler or similar) followed by an LLM extraction
// into exactly this shape. The qualifier never reads raw HTML.
export interface CompanyProfile {
  domain: string;
  name: string;
  oneLiner: string;
  category: "b2b_software" | "b2b_services" | "b2c" | "unknown";
  offer: string | null; // the thing they sell, in one line; null if unclear
  pricing: "high_ticket" | "mid" | "low" | "unknown";
  caseStudies: number;
  testimonials: number;
  teamSize: number | null;
  hqCountry: string | null; // ISO-3166 alpha-2
  revenueHint: string | null; // e.g. "$1.2M ARR (founder post)"
  hiringFor: string[];
  siteQuality: "solid" | "thin";
}

// ---------- Pipeline objects ----------

export interface Candidate {
  handle: string;
  source: string; // adapter name, e.g. "mock-x-search" / "apify-x-search"
  query: string; // the discovery query that surfaced them
  triggerPostId?: string; // the post that matched
  triggerPostedAt?: string; // ISO; scout drops stale matches
}

export interface EnrichedLead {
  candidate: Candidate;
  profile: XProfile;
  recentPosts: XPost[];
  company: CompanyProfile | null;
}

export type Polarity = "positive" | "negative";

export interface SignalHit {
  id: string;
  label: string;
  polarity: Polarity;
  weight: number; // points added (positive) or subtracted (negative)
  evidence: string; // the specific fact that fired it — never empty
  disqualifier?: boolean; // hard gate: forces REJECT regardless of score
}

export type Tier = "HIGH" | "MEDIUM" | "LOW" | "REJECT";
export type NextAction = "dm" | "comment" | "monitor" | "reject";
export type Confidence = "high" | "medium" | "low";

export interface Qualification {
  handle: string;
  score: number; // 0–100
  tier: Tier;
  positiveSignals: SignalHit[];
  negativeSignals: SignalHit[];
  reasoning: string;
  confidence: Confidence;
  recommendedAction: NextAction;
  outreachAngle: string;
}

export interface Draft {
  kind: "dm" | "comment" | "reply";
  to: string;
  inReplyToPostId?: string;
  text: string;
  rationale: string;
}

// ---------- Inbound DMs ----------

export interface DmMessage {
  from: "them" | "us";
  text: string;
  sentAt: string; // ISO
}

export interface InboundDm {
  eventId: string;
  senderHandle: string;
  text: string;
  receivedAt: string; // ISO
}

export interface ConversationRecord {
  handle: string;
  messages: DmMessage[];
  crmNotes: string[]; // human-written notes from previous touches
  stage: "none" | "contacted" | "replied" | "call_booked" | "client" | "closed_lost";
}

export type ConversationState =
  | "spam"
  | "new_cold_inbound"
  | "reengaged" // they went quiet / deferred, now back
  | "pricing_question"
  | "scheduling"
  | "objection"
  | "not_a_fit";

export type ApprovalStatus = "pending" | "approved" | "edited" | "rejected";

export interface ApprovalItem {
  id: string;
  createdAt: string;
  draft: Draft;
  context: {
    qualification: Qualification;
    conversationState: ConversationState;
    lastMessages: DmMessage[];
  };
  status: ApprovalStatus;
  decidedBy?: string;
  finalText?: string;
}

// ---------- Adapter contracts (swap mock ↔ real here) ----------

export interface DiscoverySource {
  name: string;
  search(query: string, limit: number): Promise<Candidate[]>;
}

export interface ProfileSource {
  getProfile(handle: string): Promise<XProfile | null>;
  getRecentPosts(handle: string, limit: number): Promise<XPost[]>;
}

export interface CompanySource {
  getCompany(domain: string): Promise<CompanyProfile | null>;
}

export interface ConversationStore {
  get(handle: string): Promise<ConversationRecord | null>;
  append(handle: string, message: DmMessage): Promise<void>;
}
