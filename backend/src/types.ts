// Shared types for the agent layer

export type Mode = "supervised" | "unsupervised" | "off";
export type Tier = "starter" | "business" | "enterprise";
export type AgentDomain = "inbox" | "assistant" | "calendar";
export type TargetSystem =
  | "internal"
  | "gmail"
  | "smtp"
  | "zoho"
  | "odoo"
  | "whatsapp"
  | "salesforce"
  | "microsoft365";

export type ActionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "error";

// Input every agent passes to the single execution gate
export type ExecuteAgentActionInput = {
  enterpriseId: string;
  agentId: string;
  domain: AgentDomain;
  actionType: string;
  params: Record<string, unknown>;
  targetSystem: TargetSystem;
  /** Agent's reasoning text — stored as action_summary, shown on approval screen */
  reasoning: string;
};

export type ExecuteAgentActionResult = {
  status: "off" | "pending" | "executed" | "blocked" | "frozen" | "error";
  pendingActionId?: string;
  externalRef?: string;
  reason?: string;
};

// Which features each tier is allowed to use (enforced here, same choke point as mode)
export const tierFeatures: Record<Tier, { inbox: boolean; connections: boolean; webWidget: boolean }> = {
  starter: { inbox: false, connections: false, webWidget: false },
  business: { inbox: true, connections: true, webWidget: true },
  enterprise: { inbox: true, connections: true, webWidget: true },
};


