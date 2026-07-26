import * as logger from "firebase-functions/logger";
import { db, FieldValue } from "./admin";
import { callGemini } from "./gemini";
import { generateReportFiles } from "./reportFiles";

/**
 * Daily "org users" digest — OWNER ONLY.
 *
 * Once a day Ivy compiles what each team member did (direct agent chats, agents
 * used, topics) plus any additional integrations they added, and an org-level
 * connection snapshot. Stored as a report flagged `owner_only: true` so it
 * surfaces on the Data page for the organization owner only.
 *
 * Deterministic facts are gathered in code; Gemini only phrases the narrative
 * from those facts (no invented figures).
 */

type Window = { start: Date; end: Date; key: string; label: string };

const inWindow = (ts: unknown, w: Window) => {
  const t = (ts as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;
  return t >= w.start.getTime() && t < w.end.getTime();
};

type UserActivity = {
  name: string;
  email: string;
  role: string;
  access: "full" | "granted" | "none";
  chats: number;
  messages: number;
  agents: string[];
  topics: string[];
  personalIntegrations: string[];
};

export async function generateOrgUsersReport(
  enterpriseId: string,
  w: Window,
  orgName: string
): Promise<{ id: string; created: boolean }> {
  const id = `${enterpriseId}_org-users_daily_${w.key}`;
  const ref = db.doc(`reports/${id}`);
  if ((await ref.get()).exists) return { id, created: false };

  // Members (exclude removed).
  const membersSnap = await db.collection("users").where("enterprise_id", "==", enterpriseId).get();
  const members = membersSnap.docs
    .map((d) => ({ uid: d.id, data: d.data() as Record<string, unknown> }))
    .filter((m) => ((m.data.status as string) ?? "active") !== "removed");

  // Direct-chat activity in the window.
  const chatsSnap = await db.collection("ivy_chats").where("enterprise_id", "==", enterpriseId).get();
  const chats = chatsSnap.docs.map((d) => d.data() as Record<string, unknown>).filter((c) => inWindow(c.updated_at, w));

  // Personal (user-added) integrations + access grants.
  const connSnap = await db.collection("connections").where("enterprise_id", "==", enterpriseId).get();
  const personalConns = connSnap.docs.map((d) => d.data()).filter((c) => c.scope === "personal");
  const grantsSnap = await db.collection("connection_grants").where("enterprise_id", "==", enterpriseId).get();
  const granted = new Set(grantsSnap.docs.filter((d) => d.data().shared_access === true).map((d) => d.data().uid as string));

  const activity: UserActivity[] = members.map((m) => {
    const uid = m.uid;
    const role = (m.data.role as string) || "employee";
    const userChats = chats.filter((c) => c.user_id === uid);
    const agents = Array.from(new Set(userChats.map((c) => (c.agent_id as string) || "ivy")));
    const topics = userChats.map((c) => (c.title as string) || "").filter(Boolean).slice(0, 8);
    const messages = userChats.reduce((sum, c) => {
      const arr = (c.messages as unknown[]) ?? [];
      return sum + arr.filter((x) => (x as { role?: string })?.role === "user").length;
    }, 0);
    const personalIntegrations = personalConns
      .filter((c) => c.owner_uid === uid)
      .map((c) => c.type as string);
    const access: UserActivity["access"] =
      role === "owner" || role === "admin" ? "full" : granted.has(uid) ? "granted" : "none";
    return {
      name: (m.data.display_name as string) || (m.data.email as string) || "Member",
      email: (m.data.email as string) || "",
      role,
      access,
      chats: userChats.length,
      messages,
      agents,
      topics,
      personalIntegrations,
    };
  });

  // Org-level connection snapshot (shared connections everyone works from).
  const connSummary = await orgConnectionSnapshot(enterpriseId, w);

  const metrics: Record<string, number> = {
    team_members: members.length,
    active_users: activity.filter((a) => a.chats > 0).length,
    total_chats: activity.reduce((s, a) => s + a.chats, 0),
    total_messages: activity.reduce((s, a) => s + a.messages, 0),
    personal_integrations: activity.reduce((s, a) => s + a.personalIntegrations.length, 0),
  };

  const summary = await summarizeOrgUsers(orgName, w, activity, connSummary);
  const title = "Team Activity — Daily digest";

  let files: Awaited<ReturnType<typeof generateReportFiles>> = [];
  try {
    files = await generateReportFiles({
      enterpriseId,
      reportId: id,
      orgName,
      agentLabel: "Team",
      title,
      periodLabel: w.label,
      periodTitle: "Daily",
      metrics,
      summary,
      leads: [],
    });
  } catch (e) {
    logger.error("org-users report file generation failed", { id, error: (e as Error).message });
  }

  await ref.set({
    enterprise_id: enterpriseId,
    agent: "org-users",
    agent_label: "Team",
    logo: "/mercury-logo.png",
    owner_only: true,
    period: "daily",
    period_key: w.key,
    period_label: w.label,
    period_start: w.start,
    period_end: w.end,
    title,
    summary,
    metrics,
    files,
    created_at: FieldValue.serverTimestamp(),
  });
  return { id, created: true };
}

async function orgConnectionSnapshot(enterpriseId: string, w: Window): Promise<string[]> {
  const lines: string[] = [];
  try {
    const zoho = await db.doc(`connections/${enterpriseId}_zoho`).get();
    if (zoho.exists && zoho.data()?.status === "active") {
      const { getSalesSummary } = await import("./connections/zoho");
      const s = await getSalesSummary(enterpriseId, w.start, w.end);
      lines.push(
        `Zoho CRM (shared): ${s.leads_created} new leads, ${s.deals_created} new deals, ${s.deals_won} won, ${Math.round(
          s.revenue_won
        )} revenue, ${s.open_deals} open deals in pipeline.`
      );
    }
  } catch (e) {
    logger.warn("orgConnectionSnapshot zoho failed", { error: (e as Error).message });
  }
  return lines;
}

async function summarizeOrgUsers(
  orgName: string,
  w: Window,
  activity: UserActivity[],
  connSummary: string[]
): Promise<string> {
  const facts = activity
    .map((a) => {
      const bits = [
        `${a.name} (${a.role}, integration access: ${a.access})`,
        `${a.chats} chat session(s), ${a.messages} message(s)`,
        a.agents.length ? `agents used: ${a.agents.join(", ")}` : "no agents used",
        a.topics.length ? `topics: ${a.topics.join("; ")}` : "",
        a.personalIntegrations.length ? `added personal integrations: ${a.personalIntegrations.join(", ")}` : "",
      ].filter(Boolean);
      return `- ${bits.join(" — ")}`;
    })
    .join("\n");

  const anyActivity = activity.some((a) => a.chats > 0) || connSummary.length > 0;
  if (!anyActivity) return `No team activity to report for ${w.label}.`;

  const system = `You are Ivy, writing a confidential DAILY TEAM ACTIVITY digest for the owner of ${orgName}.
Summarize what each team member did and the shared connections' activity. Write for the owner — concise, factual, business-focused.
Structure: a 2-3 sentence overview, then a short per-member list (name — what they did), then the shared-integration snapshot if provided.
Use ONLY the facts given. Never invent activity, names, numbers, or integrations. Plain professional markdown, no preamble.`;

  const prompt = [
    `Company: ${orgName}`,
    `Day: ${w.label}`,
    ``,
    `Per-member activity:`,
    facts,
    connSummary.length ? `\nShared connections snapshot:\n${connSummary.map((l) => `- ${l}`).join("\n")}` : "",
    ``,
    `Write the digest.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const r = await callGemini({ system, prompt });
    return r.text.trim() || fallback(activity);
  } catch (e) {
    logger.warn("org-users summary failed", { error: (e as Error).message });
    return fallback(activity);
  }
}

function fallback(activity: UserActivity[]): string {
  return activity.map((a) => `- ${a.name} (${a.role}): ${a.chats} chats, ${a.messages} messages.`).join("\n");
}
