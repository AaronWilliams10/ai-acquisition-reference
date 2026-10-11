// Coordinator. Plays the role agents/coordinator.md describes: runs the
// specialists in order, owns the run state, and decides what reaches a human.
//
//   npm run demo                          outbound run
//   npm run demo:inbound                  inbound DM (examples/example-inbound-dm.json)
//   npm run demo:inbound -- --interactive approve / edit / reject at the prompt
//   npm run demo:inbound -- --json        machine output only (for n8n "Execute Command")

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import type { EnrichedLead, InboundDm, Qualification, SignalHit, Tier } from "./types.js";
import { DEMO_NOW } from "./mock-data.js";
import { MockXSearch, discover } from "./discovery.js";
import { MockCompanySource, MockProfileSource, enrich } from "./enrichment.js";
import { qualify } from "./qualification.js";
import { draftOutbound } from "./drafting.js";
import { ApprovalQueue, MockConversationStore, handleInboundDm, log, send } from "./dm-handler.js";

// Listening queries. In production these live with the ICP and get pruned by
// which ones actually produce HIGH leads.
const QUERIES = [
  "founder-led sales",
  "hiring SDR",
  "referrals pipeline",
  "outbound agency recommendations",
  "need more leads",
];

const TIER_ORDER: Record<Tier, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, REJECT: 3 };
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const wrap = (text: string, indent: string, width = 92) =>
  text.split(" ").reduce<string[]>((lines, word) => {
    const last = lines[lines.length - 1]!;
    if ((last + " " + word).length > width) lines.push(word);
    else lines[lines.length - 1] = last ? `${last} ${word}` : word;
    return lines;
  }, [""]).map((l) => indent + l).join("\n");
const sig = (h: SignalHit) => `${h.polarity === "positive" ? "+" : "-"}${pad(h.weight, 3)} ${pad(h.label, 32)} ${h.evidence}`;

async function outbound() {
  const now = DEMO_NOW;
  const queue = new ApprovalQueue();
  queue.reset();
  const profiles = new MockProfileSource();
  const companies = new MockCompanySource();

  console.log(`\nOUTBOUND RUN  (mock data, clock fixed at ${now.toISOString()})\n`);

  // 1. lead-scout: discover
  const found = await discover([new MockXSearch()], QUERIES, { now });
  const hits = found.candidates.length + found.duplicates.length + found.suppressed.length + found.stale.length;
  console.log(`1. discover   ${QUERIES.length} queries → ${hits} hits → ${found.candidates.length} candidates ` +
    `(${found.duplicates.length} duplicate, ${found.stale.length} stale, ${found.suppressed.length} suppressed)`);

  // 2. lead-qualifier: enrich (profile, recent posts, website)
  const leads = (await Promise.all(found.candidates.map((c) => enrich(c, profiles, companies)))).filter((l): l is EnrichedLead => !!l);
  console.log(`2. enrich     ${leads.length} profiles, ${leads.reduce((n, l) => n + l.recentPosts.length, 0)} posts, ${leads.filter((l) => l.company).length} websites`);

  // 3. lead-qualifier: signals → score → tier → action
  const results = leads
    .map((lead) => ({ lead, q: qualify(lead, now) }))
    .sort((a, b) => TIER_ORDER[a.q.tier] - TIER_ORDER[b.q.tier] || b.q.score - a.q.score);
  console.log(`3. qualify    ${results.filter((r) => r.q.tier !== "REJECT").length} kept, ${results.filter((r) => r.q.tier === "REJECT").length} rejected`);

  // 4. dm-agent: drafts for dm/comment actions → approval queue
  const drafts = results.flatMap(({ lead, q }) => {
    const d = draftOutbound(lead, q, now);
    return d ? [{ handle: lead.profile.handle, item: queue.submit(d, { qualification: q, conversationState: "new_cold_inbound", lastMessages: [] }, now) }] : [];
  });
  console.log(`4. draft      ${drafts.length} drafts queued for human approval (out/approval-queue.json)\n`);

  console.log(`${pad("#", 3)}${pad("HANDLE", 24)}${pad("SCORE", 7)}${pad("TIER", 8)}${pad("CONF", 8)}${pad("ACTION", 9)}COMPANY`);
  console.log("-".repeat(80));
  const shown = (q: Qualification) => (q.negativeSignals.some((s) => s.disqualifier) ? "—" : q.score);
  results.forEach(({ lead, q }, i) =>
    console.log(`${pad(i + 1, 3)}${pad("@" + q.handle, 24)}${pad(shown(q), 7)}${pad(q.tier, 8)}${pad(q.confidence, 8)}${pad(q.recommendedAction, 9)}${lead.company?.name ?? "—"}`),
  );

  for (const [i, { lead, q }] of results.entries()) {
    if (q.tier === "REJECT") continue;
    console.log(`\n${"=".repeat(80)}\n#${i + 1} @${q.handle} · ${lead.profile.displayName}, ${lead.company?.name ?? "no company"} · ${q.tier} ${q.score} · ${q.recommendedAction.toUpperCase()}`);
    for (const h of [...q.positiveSignals, ...q.negativeSignals]) console.log("  " + sig(h));
    console.log(wrap(`Reasoning: ${q.reasoning}`, "  "));
    console.log(wrap(`Angle: ${q.outreachAngle}`, "  "));
    const d = drafts.find((x) => x.handle === q.handle);
    if (d) {
      const target = d.item.draft.inReplyToPostId ? ` on ${d.item.draft.inReplyToPostId}` : "";
      console.log(`  Draft ${d.item.draft.kind}${target} [${d.item.id}, pending approval]:`);
      console.log(wrap(`"${d.item.draft.text}"`, "    "));
    }
  }

  console.log(`\n${"=".repeat(80)}\nRejected`);
  for (const { q } of results.filter((r) => r.q.tier === "REJECT")) console.log(wrap(`@${q.handle} (${shown(q)}): ${q.reasoning}`, "  "));

  mkdirSync("out", { recursive: true });
  writeFileSync("out/qualified-leads.json", JSON.stringify(results.map((r) => r.q), null, 2));
  log({ type: "outbound_run", at: now.toISOString(), candidates: found.candidates.length, ranked: results.map((r) => [r.q.handle, r.q.score, r.q.tier, r.q.recommendedAction]) });
  console.log(`\nWrote out/qualified-leads.json, out/approval-queue.json, out/run-log.jsonl. Nothing was sent.\n`);
}

const SPAM_DM: InboundDm = {
  eventId: "dm-evt-0002",
  senderHandle: "example_growth_bot_02",
  text: "Hi dear, I can increase your followers by 10k organic 🚀 cheap price, check my pinned",
  receivedAt: "2026-03-16T07:12:00Z",
};

async function inbound(args: string[]) {
  const json = args.includes("--json");
  const interactive = args.includes("--interactive");
  const path = args.find((a) => a.endsWith(".json")) ?? "examples/example-inbound-dm.json";
  const dm = JSON.parse(readFileSync(path, "utf8")) as InboundDm;

  const queue = new ApprovalQueue();
  queue.reset();
  const deps = { profiles: new MockProfileSource(), companies: new MockCompanySource(), conversations: new MockConversationStore(), queue, now: DEMO_NOW };

  const events = json ? [dm] : [dm, SPAM_DM];
  const results = [];
  for (const event of events) results.push(await handleInboundDm(event, deps));

  if (json) return console.log(JSON.stringify(results[0], null, 2));

  for (const [i, r] of results.entries()) {
    const event = events[i]!;
    const q = r.qualification as Qualification | null;
    console.log(`\n${"=".repeat(80)}\nINBOUND DM ${r.eventId} from @${r.sender}`);
    console.log(wrap(`"${event.text}"`, "  "));
    console.log(`\n  identify    ${r.known ? "known contact, history found" : "no prior conversation"}`);
    if (q) {
      console.log(`  qualify     ${q.tier} ${q.negativeSignals.some((s) => s.disqualifier) ? "(hard gate)" : q.score} (confidence ${q.confidence})`);
      for (const h of [...q.positiveSignals, ...q.negativeSignals]) console.log("      " + sig(h));
    }
    console.log(`  state       ${r.state}${r.asks.length ? `  asks: ${r.asks.join(", ")}` : ""}`);
    console.log(`  outcome     ${r.outcome}${r.approvalId ? ` (${r.approvalId})` : ""}`);
    if (r.draft) {
      console.log(wrap(`rationale: ${r.draft.rationale}`, "  "));
      console.log(`  draft reply:`);
      console.log(wrap(`"${r.draft.text}"`, "    "));
    }
  }

  const pending = results.filter((r) => r.approvalId);
  if (!interactive) {
    console.log(`\n${pending.length} reply awaiting human approval in out/approval-queue.json. Nothing was sent.`);
    console.log(`Run with --interactive to approve, edit or reject.\n`);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (const r of pending) {
    const answer = (await rl.question(`\n${r.approvalId}: [a]pprove / [e]dit / [r]eject? `)).trim().toLowerCase();
    let item;
    if (answer === "a") item = queue.decide(r.approvalId!, "approved", "operator");
    else if (answer === "e") item = queue.decide(r.approvalId!, "edited", "operator", await rl.question("New text: "));
    else item = queue.decide(r.approvalId!, "rejected", "operator");
    console.log(item.status === "rejected" ? `Rejected. Logged, nothing sent.` : send(item));
    log({ type: "approval", at: DEMO_NOW.toISOString(), id: item.id, status: item.status, to: item.draft.to });
  }
  rl.close();
}

const [mode = "outbound", ...rest] = process.argv.slice(2);
await (mode === "inbound" ? inbound(rest) : outbound());
