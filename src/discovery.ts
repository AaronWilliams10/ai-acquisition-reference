// Stage 1 — discovery (lead-scout).
// Turn listening queries into a deduped, suppression-filtered candidate list.
// Discovery is deliberately dumb and cheap: no scoring here, no enrichment.
// Anything that costs money (profile scrapes, site crawls) happens after the
// suppression filter so we never pay to research someone we can't contact.

import type { Candidate, DiscoverySource } from "./types.js";
import { POSTS, SEARCH_INDEX, SUPPRESSION_LIST } from "./mock-data.js";

export class MockXSearch implements DiscoverySource {
  name = "mock-x-search";

  async search(query: string, limit: number): Promise<Candidate[]> {
    const ids = SEARCH_INDEX[query] ?? [];
    return ids.slice(0, limit).flatMap((id) => {
      const post = POSTS.find((p) => p.id === id);
      return post ? [{ handle: post.handle, source: this.name, query, triggerPostId: post.id, triggerPostedAt: post.postedAt }] : [];
    });
  }
}

// Real adapter shape, not exercised by the demo. Uses Apify's synchronous
// run endpoint and maps dataset items to Candidates. Item field names depend
// on which X/Twitter search actor you pick — adjust `toCandidate` to match.
export class ApifyXSearch implements DiscoverySource {
  name = "apify-x-search";

  constructor(
    private token = process.env.APIFY_TOKEN,
    private actorId = process.env.APIFY_X_SEARCH_ACTOR,
  ) {}

  async search(query: string, limit: number): Promise<Candidate[]> {
    if (!this.token || !this.actorId) throw new Error("APIFY_TOKEN and APIFY_X_SEARCH_ACTOR must be set");
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(this.actorId)}/run-sync-get-dataset-items`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ searchTerms: [query], maxItems: limit, sort: "Latest" }),
    });
    if (!res.ok) throw new Error(`Apify search failed: ${res.status}`);
    const items = (await res.json()) as Array<Record<string, any>>;
    return items.map((item) => this.toCandidate(item, query)).filter((c): c is Candidate => c !== null);
  }

  private toCandidate(item: Record<string, any>, query: string): Candidate | null {
    const handle = item.author?.userName ?? item.user?.screen_name;
    if (!handle) return null;
    return { handle: String(handle).toLowerCase(), source: this.name, query, triggerPostId: item.id, triggerPostedAt: item.createdAt };
  }
}

export interface DiscoveryResult {
  candidates: Candidate[];
  duplicates: Candidate[];
  suppressed: Candidate[];
  stale: Candidate[];
}

export async function discover(
  sources: DiscoverySource[],
  queries: string[],
  opts: { now: Date; limitPerQuery?: number; maxAgeDays?: number; suppression?: Set<string> },
): Promise<DiscoveryResult> {
  const { now, limitPerQuery = 25, maxAgeDays = 14, suppression = SUPPRESSION_LIST } = opts;
  const seen = new Map<string, Candidate>();
  const duplicates: Candidate[] = [];
  const suppressed: Candidate[] = [];
  const stale: Candidate[] = [];
  const isStale = (c: Candidate) =>
    !!c.triggerPostedAt && now.getTime() - new Date(c.triggerPostedAt).getTime() > maxAgeDays * 86_400_000;

  for (const source of sources) {
    for (const query of queries) {
      for (const c of await source.search(query, limitPerQuery)) {
        if (suppression.has(c.handle)) suppressed.push(c);
        else if (isStale(c)) stale.push(c); // old intent is not intent
        else if (seen.has(c.handle)) duplicates.push(c); // first query that found them wins
        else seen.set(c.handle, c);
      }
    }
  }
  return { candidates: [...seen.values()], duplicates, suppressed, stale };
}
