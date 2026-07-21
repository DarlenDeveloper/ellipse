import * as logger from "firebase-functions/logger";
import { callGemini } from "../gemini";
import { loadKnowledgeBase } from "./knowledge";

/**
 * Message triage — the qualification step that runs BEFORE any agent acts.
 * Stops the agents from replying to / creating leads from automated,
 * transactional, marketing, or irrelevant mail.
 */

// Obvious automated / no-reply senders — skipped without spending a Gemini call.
const AUTOMATED_LOCALPART =
  /(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer-daemon|postmaster|notifications?|notify|alerts?|account[-_.]?security|security|updates?|newsletter|mailer|bounce|receipts?|billing|invoices?)/i;
const AUTOMATED_DOMAIN =
  /(accountprotection\.microsoft\.com|facebookmail\.com|githubapp\.com|github\.com|devpost\.com|sendgrid\.|mailchimp|substack|intercom|notifications?\.|email\.|mail\.|updates\.|noreply\.|no-reply\.)/i;

export function isLikelyAutomated(fromEmail?: string, from?: string): boolean {
  const e = (fromEmail || from || "").toLowerCase();
  if (!e) return false;
  const local = e.split("@")[0] ?? "";
  const domain = e.split("@")[1] ?? "";
  return AUTOMATED_LOCALPART.test(local) || AUTOMATED_DOMAIN.test(domain);
}

export type Triage = {
  engage: boolean; // is this worth a human-style reply?
  is_lead: boolean; // is the sender a genuine sales lead?
  category: string; // inquiry | support | automated | marketing | personal | spam | other
  reason: string;
};

const SYSTEM = `You are a STRICT triage classifier for a business's inbox. You decide whether an inbound message deserves engagement and whether the sender is a genuine sales lead.

Hard rules:
- Automated / transactional / notification / security-alert / login-alert / receipt / billing / newsletter / marketing / cold-vendor-pitch emails → engage:false, is_lead:false.
- Personal messages unrelated to the business → engage:false, is_lead:false.
- A LEAD is a REAL PERSON expressing genuine interest in THIS business's products or services (judge against the knowledge base). "Someone tried to sign in", "your receipt", "welcome to X", newsletters, and social notifications are NEVER leads.
- Only engage (reply) when a real human is asking something this business would actually answer, relevant to what it does.
- When unsure whether it's a real human inquiry, prefer engage:false.

Return ONLY compact JSON, no prose:
{"engage":boolean,"is_lead":boolean,"category":"inquiry|support|automated|marketing|personal|spam|other","reason":"one short sentence"}`;

export async function triageMessage(
  enterpriseId: string,
  msg: { from?: string; fromEmail?: string; subject?: string; body?: string }
): Promise<Triage> {
  const kb = await loadKnowledgeBase(enterpriseId);
  const prompt = [
    `--- Company knowledge base (what this business does) ---`,
    kb || "(none provided)",
    ``,
    `--- Inbound message ---`,
    `From: ${msg.from ?? msg.fromEmail ?? "(unknown)"}`,
    `Subject: ${msg.subject ?? "(none)"}`,
    `Body: ${(msg.body ?? "").slice(0, 1500)}`,
    ``,
    `Classify it.`,
  ].join("\n");

  try {
    const r = await callGemini({ system: SYSTEM, prompt });
    const match = r.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    const parsed = JSON.parse(match[0]) as Partial<Triage>;
    return {
      engage: Boolean(parsed.engage),
      is_lead: Boolean(parsed.is_lead),
      category: parsed.category ?? "other",
      reason: parsed.reason ?? "",
    };
  } catch (e) {
    // On classifier failure: allow a reply (still human-approved in Supervised),
    // but never auto-create a lead on uncertainty.
    logger.warn("triage parse failed; defaulting", { error: (e as Error).message });
    return { engage: true, is_lead: false, category: "other", reason: "triage-failed-default" };
  }
}
