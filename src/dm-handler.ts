// Inbound DM pipeline (dm-agent), plus the approval gate and send path that
// outbound drafts share.
//
//   DM received → identify sender → history → profile + company → qualify
//   → read conversation state → draft reply → approval queue → log
//
// The only function that can send is `send`, and it refuses anything that a
// human hasn't approved. That check lives in code, not in a prompt.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ApprovalItem, CompanySource, ConversationRecord, ConversationStore, Draft, DmMessage,
  InboundDm, ProfileSource, Qualification, ConversationState,
} from "./types.js";
import { CONVERSATIONS } from "./mock-data.js";
import { enrich } from "./enrichment.js";
import { qualify } from "./qualification.js";
import { draftReply, readConversation } from "./drafting.js";

// ---------- Conversation store ----------

export class MockConversationStore implements ConversationStore {
  private records = new Map(CONVERSATIONS.map((c) => [c.handle, structuredClone(c)]));
  async get(handle: string): Promise<ConversationRecord | null> {
    const rec = this.records.get(handle);
    return rec ? structuredClone(rec) : null; // a snapshot, so later appends don't rewrite "history"
  }
  async append(handle: string, message: DmMessage): Promise<void> {
    const rec = this.records.get(handle) ?? { handle, messages: [], crmNotes: [], stage: "none" as const };
    rec.messages.push(message);
    this.records.set(handle, rec);
  }
}

// ---------- Approval queue (file-backed; swap for Slack/Telegram/n8n wait node) ----------

export class ApprovalQueue {
  constructor(private path = "out/approval-queue.json") {}

  private load(): ApprovalItem[] {
    return existsSync(this.path) ? (JSON.parse(readFileSync(this.path, "utf8")) as ApprovalItem[]) : [];
  }
  private save(items: ApprovalItem[]) {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(items, null, 2));
  }

  reset() {
    this.save([]);
  }

  submit(draft: Draft, context: ApprovalItem["context"], now: Date): ApprovalItem {
    const items = this.load();
    const item: ApprovalItem = {
      id: `apr-${String(items.length + 1).padStart(3, "0")}`,
      createdAt: now.toISOString(),
      draft,
      context,
      status: "pending",
    };
    this.save([...items, item]);
    return item;
  }

  decide(id: string, status: "approved" | "edited" | "rejected", by: string, finalText?: string): ApprovalItem {
    const items = this.load();
    const item = items.find((i) => i.id === id);
    if (!item) throw new Error(`No approval item ${id}`);
    Object.assign(item, { status, decidedBy: by, finalText: status === "rejected" ? undefined : finalText ?? item.draft.text });
    this.save(items);
    return item;
  }
}

// ---------- Send (mock) ----------

export function send(item: ApprovalItem): string {
  if (item.status !== "approved" && item.status !== "edited") {
    throw new Error(`Refusing to send ${item.id}: status is ${item.status}`);
  }
  // Production: X API DM / reply call goes here. The demo never leaves the machine.
  return `[MOCK SEND] ${item.draft.kind} → @${item.draft.to}: ${item.finalText}`;
}

// ---------- Log ----------

export function log(event: Record<string, unknown>, path = "out/run-log.jsonl") {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(event) + "\n");
}

// ---------- Inbound handler ----------

export interface InboundResult {
  eventId: string;
  sender: string;
  known: boolean;
  qualification: Qualification | null;
  state: ConversationState | "unknown_sender";
  asks: string[];
  outcome: "queued_for_approval" | "archived" | "escalated";
  approvalId?: string;
  draft?: Draft;
}

export async function handleInboundDm(
  dm: InboundDm,
  deps: { profiles: ProfileSource; companies: CompanySource; conversations: ConversationStore; queue: ApprovalQueue; now: Date },
): Promise<InboundResult> {
  const { profiles, companies, conversations, queue, now } = deps;

  // 1. identify + 2. history
  const history = await conversations.get(dm.senderHandle);
  await conversations.append(dm.senderHandle, { from: "them", text: dm.text, sentAt: dm.receivedAt });

  // 3–4. profile + company (same enrichment as outbound)
  const lead = await enrich({ handle: dm.senderHandle, source: "inbound-dm", query: "inbound" }, profiles, companies);
  if (!lead) {
    const result: InboundResult = { eventId: dm.eventId, sender: dm.senderHandle, known: false, qualification: null, state: "unknown_sender", asks: [], outcome: "escalated" };
    log({ type: "inbound_dm", at: now.toISOString(), ...result });
    return result;
  }

  // 5. qualify + 6. conversation state
  const q = qualify(lead, now);
  const read = readConversation(dm, history, q);

  // 7. draft + 8. approval
  const draft = draftReply(dm, lead, q, read, history);
  const base = { eventId: dm.eventId, sender: dm.senderHandle, known: !!history, qualification: q, state: read.state, asks: read.asks };

  let result: InboundResult;
  if (!draft) {
    result = { ...base, outcome: "archived" };
  } else {
    const item = queue.submit(draft, {
      qualification: q,
      conversationState: read.state,
      lastMessages: [...(history?.messages ?? []).slice(-4), { from: "them", text: dm.text, sentAt: dm.receivedAt }],
    }, now);
    result = { ...base, outcome: "queued_for_approval", approvalId: item.id, draft };
  }

  // 9. log
  log({ type: "inbound_dm", at: now.toISOString(), eventId: dm.eventId, sender: dm.senderHandle, tier: q.tier, score: q.score, state: read.state, outcome: result.outcome, approvalId: result.approvalId });
  return result;
}
