import * as logger from "firebase-functions/logger";
import { callGemini } from "../gemini";
import { loadKnowledgeBase } from "./knowledge";

/**
 * Message triage — the qualification step that runs BEFORE any agent acts.
 * Stops the agents from replying to / creating leads from automated,
 * transactional, marketing, or irrelevant mail.
 */

// The local-part (before @) begins with a clearly reply-less token.
const AUTOMATED_LOCALPART =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|notifications?|notify|alerts?|account[-_.]?security|updates?|newsletter|mailer|bounce|receipts?|billing|invoices?)([._-]|$)/i;

// Known machine-sending domains (matched at the END of the domain).
const KNOWN_AUTOMATED_DOMAIN =
  /(accountprotection\.microsoft\.com|facebookmail\.com|githubapp\.com|sendgrid\.net|mailchimp\.com|mcsv\.net|substack\.com|intercom-mail\.com|sparkpostmail\.com|amazonses\.com)$/i;

// Automated sending SUBdomains — matched only as the FIRST label of the domain,
// so "mail.acme.com" is caught but "gmail.com" / "email-provider.com" are NOT.
const AUTOMATED_FIRST_LABEL =
  /^(mailer|mail|email|em|noreply|no-reply|notifications?|notify|updates?|bounce|bounces|newsletter|news|marketing|reply|mailing|campaigns?)$/i;

export function isLikelyAutomated(fromEmail?: string, from?: string): boolean {
  const e = (fromEmail || from || "").toLowerCase().trim();
  if (!e || !e.includes("@")) return false;
  const local = e.split("@")[0] ?? "";
  const domain = e.split("@")[1] ?? "";
  if (AUTOMATED_LOCALPART.test(local)) return true;
  if (KNOWN_AUTOMATED_DOMAIN.test(domain)) return true;
  // First-label check only for multi-label domains (never freemail like gmail.com).
  const labels = domain.split(".");
  if (labels.length >= 3 && AUTOMATED_FIRST_LABEL.test(labels[0])) return true;
  return false;
}

export type Triage = {
  engage: boolean; // is this worth a human-style reply?
  is_lead: boolean; // is the sender a genuine sales lead?
  category: string; // inquiry | support | automated | marketing | personal | spam | other
  reason: string;
};

const SYSTEM = `You are a triage classifier for a business inbox that is also used as a personal assistant. You decide whether an inbound message deserves a reply (engage) and whether the sender is a genuine sales lead (is_lead).

Rules for ENGAGE (worth a human-style reply):
- Engage with ANY message written by a REAL PERSON — this includes business inquiries, support questions, AND personal/individual correspondence (a colleague, a friend, a one-to-one email). The assistant can help draft replies to personal emails too.
- Do NOT engage with automated / no-reply / transactional / notification / security-alert / login-alert / receipt / billing / newsletter / bulk-marketing / mass cold-blast emails. These are machine-sent, not a person expecting a reply.
- When it clearly comes from a real human who would expect a response, engage:true (even if it's not about the business).

Rules for IS_LEAD (stricter — sales intent only):
- A LEAD is a REAL PERSON expressing genuine interest in THIS business's products or services (judge against the knowledge base).
- Personal emails, support/existing-customer questions, and anything automated are NOT leads. "Someone tried to sign in", receipts, "welcome to X", newsletters and social notifications are NEVER leads.

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
