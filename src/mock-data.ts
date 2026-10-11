// The mock world. Every person, handle, company and domain here is fictional.
// Domains use the reserved .example TLD so nothing can resolve to a real site.
//
// The shapes match what the real adapters return, so swapping a mock source
// for an Apify/X-backed one changes nothing downstream.

import type { CompanyProfile, ConversationRecord, XPost, XProfile } from "./types.js";

// Fixed clock so every run produces identical output.
export const DEMO_NOW = new Date("2026-03-16T09:00:00Z");

// Handles we never contact: existing clients, open deals, opt-outs.
export const SUPPRESSION_LIST = new Set(["ollie_vance"]);

export const PROFILES: XProfile[] = [
  {
    handle: "mara_hollis",
    displayName: "Mara Hollis",
    bio: "Founder & CEO @ Ledgermoor. Month-end close automation for accounting firms. Ex-Big4, recovering auditor.",
    location: "Austin, TX",
    followers: 4800,
    following: 610,
    accountCreatedAt: "2019-04-02T00:00:00Z",
    postsLast30d: 6,
    lastPostAt: "2026-03-13T15:20:00Z",
    website: "ledgermoor.example",
  },
  {
    handle: "teodor_lind",
    displayName: "Teodor Lind",
    bio: "Co-founder, Harbourgrain Data. We build data platforms for logistics companies. Writing about the modern data stack.",
    location: "London, UK",
    followers: 2100,
    following: 480,
    accountCreatedAt: "2020-09-11T00:00:00Z",
    postsLast30d: 14,
    lastPostAt: "2026-03-15T08:05:00Z",
    website: "harbourgrain.example",
  },
  {
    handle: "jenna_kowal",
    displayName: "Jenna Kowal",
    bio: "Head of Growth @ Pinglattice. Ex-agency. Demand gen, attribution, and why your MQLs are lying to you.",
    location: "Toronto, Canada",
    followers: 9400,
    following: 1100,
    accountCreatedAt: "2016-02-19T00:00:00Z",
    postsLast30d: 31,
    lastPostAt: "2026-03-15T19:40:00Z",
    website: "pinglattice.example",
  },
  {
    handle: "sofia_reyes_cfo",
    displayName: "Sofia Reyes",
    bio: "Founder, Varrowby Finance. Fractional CFO for early-stage SaaS. Mostly lurking.",
    location: "Sydney, Australia",
    followers: 610,
    following: 300,
    accountCreatedAt: "2021-06-30T00:00:00Z",
    postsLast30d: 3,
    lastPostAt: "2026-03-05T22:10:00Z",
    website: "varrowby.example",
  },
  {
    handle: "lena_marsh",
    displayName: "Lena Marsh",
    bio: "Owner @ Ovenmere Bakehouse. Sourdough, pastries and too much coffee. Two shops in Bristol.",
    location: "Bristol, UK",
    followers: 3200,
    following: 700,
    accountCreatedAt: "2018-05-14T00:00:00Z",
    postsLast30d: 18,
    lastPostAt: "2026-03-14T07:30:00Z",
    website: "ovenmere.example",
  },
  {
    handle: "kai_buildsfocus",
    displayName: "Kai Brenner",
    bio: "CS student 🎓 building in public. Side project: a pomodoro app for devs. $0 MRR, learning everything.",
    location: "Leeds, UK",
    followers: 340,
    following: 900,
    accountCreatedAt: "2025-09-01T00:00:00Z",
    postsLast30d: 40,
    lastPostAt: "2026-03-15T21:00:00Z",
    website: "focusrill.example",
  },
  {
    handle: "example_spam_bot_01",
    displayName: "Example Spam Bot 01",
    bio: "🚀 100x gems daily | DM for promo | NFA",
    location: "",
    followers: 120,
    following: 4900,
    accountCreatedAt: "2026-01-20T00:00:00Z",
    postsLast30d: 310,
    lastPostAt: "2026-03-16T06:00:00Z",
  },
  // Inbound DM senders
  {
    handle: "dana_okoro",
    displayName: "Dana Okoro",
    bio: "Co-founder & CEO @ Credentrel. Compliance automation for healthcare staffing agencies. Chicago.",
    location: "Chicago, IL",
    followers: 3900,
    following: 520,
    accountCreatedAt: "2017-08-08T00:00:00Z",
    postsLast30d: 11,
    lastPostAt: "2026-03-14T16:45:00Z",
    website: "credentrel.example",
  },
  {
    handle: "example_growth_bot_02",
    displayName: "Example Growth Bot 02",
    bio: "I help you grow 📈 10k organic followers guaranteed | DM open",
    location: "",
    followers: 85,
    following: 6100,
    accountCreatedAt: "2026-02-28T00:00:00Z",
    postsLast30d: 220,
    lastPostAt: "2026-03-16T05:00:00Z",
  },
];

export const POSTS: XPost[] = [
  // Mara — HIGH, explicit buying intent
  { id: "p-mh-1", handle: "mara_hollis", postedAt: "2026-03-13T15:20:00Z", likes: 212, replies: 48,
    text: "Founder-led sales got us to $1.2M ARR. It will not get us to $5M. Hiring our first SDR this quarter. If you've built outbound for a vertical SaaS, I'd love to hear what you'd do differently." },
  { id: "p-mh-2", handle: "mara_hollis", postedAt: "2026-03-10T13:00:00Z", likes: 96, replies: 14,
    text: "Signed our 40th accounting firm this month. Every single one came from a referral or a conference. Great problem to have, until it isn't." },
  { id: "p-mh-3", handle: "mara_hollis", postedAt: "2026-03-04T10:15:00Z", likes: 51, replies: 6,
    text: "Most firms lose 3 days of every month-end to reconciliations nobody owns. Assign an owner before you buy software." },

  // Teodor — HIGH fit, no explicit intent
  { id: "p-tl-1", handle: "teodor_lind", postedAt: "2026-03-15T08:05:00Z", likes: 88, replies: 21,
    text: "95% of our pipeline is referrals. Great close rate, zero predictability. Q2 is either feast or famine and I genuinely can't tell which yet." },
  { id: "p-tl-2", handle: "teodor_lind", postedAt: "2026-03-11T12:30:00Z", likes: 140, replies: 19,
    text: "Shipped a dbt migration for a 3PL client last week: nightly runs went from 40 hours of compute to 6. Boring infrastructure wins again." },
  { id: "p-tl-3", handle: "teodor_lind", postedAt: "2026-03-06T17:45:00Z", likes: 60, replies: 30,
    text: "Hot take: most 'AI analytics' demos fall apart the moment they touch a real warehouse." },

  // Jenna — not the founder, larger company, public request for vendors
  { id: "p-jk-1", handle: "jenna_kowal", postedAt: "2026-03-15T19:40:00Z", likes: 74, replies: 63,
    text: "Anyone have recommendations for outbound agencies that actually understand technical buyers? Budget's approved, patience is not." },
  { id: "p-jk-2", handle: "jenna_kowal", postedAt: "2026-03-12T14:00:00Z", likes: 230, replies: 41,
    text: "Our best quarter came from 40 accounts we researched by hand. Our worst came from 4,000 we bought from a list." },

  // Sofia — fits on paper, thin evidence
  { id: "p-sr-1", handle: "sofia_reyes_cfo", postedAt: "2026-03-05T22:10:00Z", likes: 12, replies: 3,
    text: "Every client I've had came through my network. Starting to wonder what happens when the network runs dry." },

  // Lena — owner, real business, wrong market
  { id: "p-lm-1", handle: "lena_marsh", postedAt: "2026-03-14T07:30:00Z", likes: 45, replies: 12,
    text: "Word of mouth and referrals have carried us for 6 years but we need more corporate catering clients. Where do office managers hang out?" },

  // Kai — student side project
  { id: "p-kb-1", handle: "kai_buildsfocus", postedAt: "2026-03-15T21:00:00Z", likes: 9, replies: 4,
    text: "Day 12 of building in public. How do you get your first users? Need more leads but cold DMs feel scary lol" },

  // Stale match: right words, but 7 weeks old. Scout drops it before enrichment.
  { id: "p-rw-1", handle: "rhea_whitcombe", postedAt: "2026-01-26T10:00:00Z", likes: 40, replies: 11,
    text: "All our pipeline is referrals and I'm fine with that for now. Revisit in summer." },

  // Spam
  { id: "p-ag-1", handle: "example_spam_bot_01", postedAt: "2026-03-16T06:00:00Z", likes: 2, replies: 0,
    text: "Need more leads?? 🚀🚀 DM us for 10k targeted followers + whitelist spots. Link in bio 👉" },

  // Suppressed (existing client) — surfaces in search, must never reach enrichment
  { id: "p-ov-1", handle: "ollie_vance", postedAt: "2026-03-14T11:00:00Z", likes: 30, replies: 8,
    text: "Outbound agency recommendations thread, go. (Mine's great, just curious who else people use.)" },

  // Dana — inbound DM sender
  { id: "p-do-1", handle: "dana_okoro", postedAt: "2026-03-14T16:45:00Z", likes: 130, replies: 22,
    text: "SOC 2 Type II: done. 7 months, 2 auditors, 1 very tired team. Now back to the fun part: selling." },
  { id: "p-do-2", handle: "dana_okoro", postedAt: "2026-02-21T15:00:00Z", likes: 64, replies: 9,
    text: "Every staffing agency we've signed found us at a conference. Love the in-person energy, hate that pipeline only exists 4 times a year." },

  // Inbound spam sender
  { id: "p-gp-1", handle: "example_growth_bot_02", postedAt: "2026-03-16T05:00:00Z", likes: 0, replies: 0,
    text: "Want 10k organic followers?? DM me now limited slots 📈📈" },
];

// Stands in for X search results: query → post ids it returned.
export const SEARCH_INDEX: Record<string, string[]> = {
  "founder-led sales": ["p-mh-1"],
  "hiring SDR": ["p-mh-1"], // duplicate surface — dedupe must catch it
  "referrals pipeline": ["p-tl-1", "p-lm-1", "p-sr-1", "p-rw-1"],
  "outbound agency recommendations": ["p-jk-1", "p-ov-1"],
  "need more leads": ["p-ag-1", "p-kb-1"],
};

export const COMPANIES: CompanyProfile[] = [
  {
    domain: "ledgermoor.example", name: "Ledgermoor",
    oneLiner: "Month-end close automation for mid-size accounting firms.",
    category: "b2b_software",
    offer: "Close-automation platform, annual contracts from $18k",
    pricing: "high_ticket", caseStudies: 6, testimonials: 9, teamSize: 14, hqCountry: "US",
    revenueHint: "$1.2M ARR (founder post, 2026-03-13)", hiringFor: ["SDR", "Customer Success Manager"],
    siteQuality: "solid",
  },
  {
    domain: "harbourgrain.example", name: "Harbourgrain Data",
    oneLiner: "Data platform builds and retained data engineering for logistics and 3PL companies.",
    category: "b2b_services",
    offer: "Fixed-scope data platform builds plus monthly retained engineering",
    pricing: "high_ticket", caseStudies: 4, testimonials: 5, teamSize: 11, hqCountry: "GB",
    revenueHint: null, hiringFor: ["Analytics Engineer"],
    siteQuality: "solid",
  },
  {
    domain: "pinglattice.example", name: "Pinglattice",
    oneLiner: "API monitoring for platform engineering teams.",
    category: "b2b_software",
    offer: "API monitoring SaaS, team and enterprise plans",
    pricing: "mid", caseStudies: 3, testimonials: 12, teamSize: 60, hqCountry: "CA",
    revenueHint: null, hiringFor: ["Account Executive", "SDR", "Platform Engineer"],
    siteQuality: "solid",
  },
  {
    domain: "varrowby.example", name: "Varrowby Finance",
    oneLiner: "Fractional CFO services for early-stage SaaS.",
    category: "b2b_services",
    offer: "Fractional CFO retainers",
    pricing: "high_ticket", caseStudies: 0, testimonials: 1, teamSize: null, hqCountry: "AU",
    revenueHint: null, hiringFor: [],
    siteQuality: "thin",
  },
  {
    domain: "ovenmere.example", name: "Ovenmere Bakehouse",
    oneLiner: "Bakery and café with corporate catering.",
    category: "b2c",
    offer: "Bakery, café and office catering",
    pricing: "low", caseStudies: 0, testimonials: 20, teamSize: 18, hqCountry: "GB",
    revenueHint: null, hiringFor: ["Barista"],
    siteQuality: "solid",
  },
  {
    domain: "focusrill.example", name: "Focusrill",
    oneLiner: "Pomodoro timer for developers.",
    category: "b2c",
    offer: null,
    pricing: "low", caseStudies: 0, testimonials: 0, teamSize: 1, hqCountry: "GB",
    revenueHint: null, hiringFor: [],
    siteQuality: "thin",
  },
  {
    domain: "credentrel.example", name: "Credentrel",
    oneLiner: "Credentialing and compliance automation for healthcare staffing agencies.",
    category: "b2b_software",
    offer: "Compliance automation platform, annual contracts",
    pricing: "high_ticket", caseStudies: 0, testimonials: 2, teamSize: 9, hqCountry: "US",
    revenueHint: "~$75k MRR (founder post, 2026-01)", hiringFor: ["Account Executive"],
    siteQuality: "solid",
  },
];

export const CONVERSATIONS: ConversationRecord[] = [
  {
    handle: "dana_okoro",
    stage: "replied",
    crmNotes: [
      "2025-11-05: Deferred: 'ask me again after Q1', SOC 2 audit in progress. Pipeline is conference + co-founder network.",
    ],
    messages: [
      { from: "us", sentAt: "2025-11-04T15:02:00Z",
        text: "Hey Dana, your thread on staffing agencies drowning in credential checks was sharp. Curious how you're finding new agencies right now. Mostly conferences?" },
      { from: "them", sentAt: "2025-11-05T09:40:00Z",
        text: "Ha, conferences and my co-founder's network. Honestly works fine for now. Ask me again after Q1, we're heads down on the SOC 2 audit." },
      { from: "us", sentAt: "2025-11-05T10:12:00Z",
        text: "Makes sense. Good luck with the audit, I'll leave it with you." },
    ],
  },
];
