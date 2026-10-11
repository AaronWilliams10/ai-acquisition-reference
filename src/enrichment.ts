// Stage 2 — enrichment (lead-qualifier, research half).
// Profile + recent posts from X, then company facts from their website.
// Output is an EnrichedLead; qualification never calls a source directly.

import type { Candidate, CompanyProfile, CompanySource, EnrichedLead, ProfileSource, XPost, XProfile } from "./types.js";
import { COMPANIES, POSTS, PROFILES } from "./mock-data.js";

export class MockProfileSource implements ProfileSource {
  async getProfile(handle: string): Promise<XProfile | null> {
    return PROFILES.find((p) => p.handle === handle) ?? null;
  }
  async getRecentPosts(handle: string, limit: number): Promise<XPost[]> {
    return POSTS.filter((p) => p.handle === handle)
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
      .slice(0, limit);
  }
}

export class MockCompanySource implements CompanySource {
  async getCompany(domain: string): Promise<CompanyProfile | null> {
    return COMPANIES.find((c) => c.domain === domain) ?? null;
  }
}

// Real adapter shape, not exercised by the demo. Two steps:
//   1. crawl a handful of pages (home, about, pricing, case studies) via an Apify crawler actor
//   2. hand the page text to an extractor (an LLM call with a strict JSON schema) that returns CompanyProfile
// Keeping extraction injectable means the qualifier only ever sees structured facts.
export class ApifyCompanySource implements CompanySource {
  constructor(
    private extract: (domain: string, pages: { url: string; text: string }[]) => Promise<CompanyProfile | null>,
    private token = process.env.APIFY_TOKEN,
    private actorId = process.env.APIFY_WEBSITE_ACTOR,
  ) {}

  async getCompany(domain: string): Promise<CompanyProfile | null> {
    if (!this.token || !this.actorId) throw new Error("APIFY_TOKEN and APIFY_WEBSITE_ACTOR must be set");
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(this.actorId)}/run-sync-get-dataset-items`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ startUrls: [{ url: `https://${domain}` }], maxCrawlPages: 8 }),
    });
    if (!res.ok) return null; // a dead site is a signal (missing_company_info), not a crash
    const pages = ((await res.json()) as Array<{ url: string; text?: string }>).map((p) => ({ url: p.url, text: p.text ?? "" }));
    return pages.length ? this.extract(domain, pages) : null;
  }
}

export async function enrich(
  candidate: Candidate,
  profiles: ProfileSource,
  companies: CompanySource,
  postLimit = 20,
): Promise<EnrichedLead | null> {
  const profile = await profiles.getProfile(candidate.handle);
  if (!profile) return null; // deleted/suspended/private — drop silently
  const [recentPosts, company] = await Promise.all([
    profiles.getRecentPosts(candidate.handle, postLimit),
    profile.website ? companies.getCompany(profile.website) : Promise.resolve(null),
  ]);
  return { candidate, profile, recentPosts, company };
}
