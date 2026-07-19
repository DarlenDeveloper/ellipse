# Ellipse Desk — Product Architecture and Flow

## 1. Core Concept

Ellipse Desk is business automation plus AI powered work, run through four surfaces sitting on one shared backend: Unified Inbox, Personal Assistant, Calendar, and Connections (Zoho, Odoo, and future integrations). All four are governed by one universal mode system: Supervised, Unsupervised, Off. Mode is not per feature. It is set at the workspace level and every agent, every connection, and every action obeys it the same way.

The mobile app is the companion surface: inbox, approvals, calendar, reminders, and summaries, not a second product with its own logic.

## 2. System Layers

```
Client Layer        Mobile companion app (Flutter)
Agent Layer          Gemini 3.1 agents, one per domain (Inbox, Assistant, Calendar)
Execution Gate        executeAgentAction (single choke point, mode aware)
Connections Layer     Zoho, Odoo, future integrations, each registering tools
Data Layer            Firestore + Secret Manager
Summary Layer         Per action, daily, weekly, generated from the same data
```

Every layer below the client only exists as Firebase Functions and Firestore documents. Nothing agent related executes outside the gate.

## 3. Data Model (Firestore)

```
workspaces/{workspace_id}
  mode: supervised | unsupervised | off

conversations/{id}
  channel, status, current_owner_agent_id, customer_ref, created_at

messages/{id}
  conversation_id, sender_type, agent_id, content, timestamp

agents/{id}
  role, domain (inbox | assistant | calendar), capabilities, status

handoffs/{id}
  conversation_id, from_agent, to_agent, reason, timestamp

connections/{id}
  type (zoho | odoo), workspace_id, auth_type, status, enabled_actions

pending_actions/{id}
  action_type, params, agent_id, target_system (internal | zoho | odoo)
  status: pending | approved | rejected | executed | error
  action_summary, external_ref, created_at

analytics_events/{id}
  source (message | webhook | calendar_change), workspace_id, payload, timestamp

reminders/{id}
  workspace_id, title, due_at, status

calendar_events/{id}
  workspace_id, title, start, end, source

summaries/{workspace_id}/daily/{date}
summaries/{workspace_id}/weekly/{week_id}
  period_start, period_end, content, source_refs, generated_at
```

## 4. The Universal Mode System

Mode is checked once, in one function, `executeAgentAction`. No agent, connection, or feature implements its own approval logic.

**Off**
No agent runs. No Gemini call happens. The ingestion trigger (new message, Zoho or Odoo webhook, calendar change) writes straight to `analytics_events`. This is pure collection at the point of entry, not an agent output that got blocked afterward. Cheapest mode, and the only one with zero model cost.

**Supervised**
The relevant agent runs and produces a `function_call`. Instead of executing, `executeAgentAction` writes it to `pending_actions` with status `pending`, generates the `action_summary` from the agent's accompanying reasoning text, and sends a push notification to the mobile app. A human approves or rejects from the app, which triggers an `onUpdate` function that either executes against the target system or discards it.

**Unsupervised**
Same agent run, same `function_call`, but `executeAgentAction` executes immediately and writes the result with status `executed`.

Switching a workspace from Off to Supervised or Unsupervised means the agent has no prior reasoning history, only raw `analytics_events`. Decide at build time whether agents backfill context from recent events on activation or start clean. Recommended default: backfill the last seven days of events as context on first activation, nothing further back.

## 5. Agent Layer

Three domain agents, each with its own tool set, not one agent trying to do everything:

- **Inbox agent**: owns conversations, message routing, and any connection actions triggered by a conversation (e.g. update a Zoho record because of what a customer said).
- **Personal Assistant agent**: reminders, task creation, follow ups.
- **Calendar agent**: scheduling, conflict detection, rescheduling.

Each agent only receives the function declarations relevant to its domain. Gemini 3.1 caps function declarations at 128 per request, and mixing all tools into one call also makes routing less reliable. A supervisor pattern (one classifier deciding which domain agent handles an incoming event) is simpler to debug than direct peer handoff and is the right starting point.

Gemini 3.1 carries thought signatures across turns for function calling. Since this runs on stateless Cloud Functions, the signature has to be persisted alongside `function_result` in whatever conversation history you replay, or multi turn tool use degrades silently.

## 6. Connections Layer

Zoho and Odoo both register as `connections` documents and expose their available actions as function declarations, the same way internal tools do. Agents don't need connection specific logic, they just see more tools.

- OAuth2 tokens live in Secret Manager, keyed by workspace and connection, never in Firestore directly.
- A scheduled function refreshes access tokens before expiry for both.
- Every write to Zoho or Odoo goes through `executeAgentAction`, same as an internal action. This is the payoff of building the gate first: adding a third connection later only means registering its tools, not building new approval logic.
- `pending_actions.target_system` and `external_ref` track which system an action hit and what record it produced, so a failed Zoho write can be identified and retried without guessing.

**Planned connections, in build order**: Zoho, Odoo, WhatsApp Business API, Salesforce, Microsoft 365. Zoho and Odoo share a near identical OAuth2 plus REST shape. Salesforce and Microsoft 365 fit the same `connections` registration pattern but carry two onboarding differences worth planning for now rather than discovering later:

- **Salesforce**: OAuth2 via a Connected App, but the enterprise's own Salesforce org needs an edition with API access enabled, and Salesforce enforces a rolling 24 hour API call limit per org. Worth surfacing that limit in the connection health monitoring already flagged, since a busy Inbox agent could hit it.
- **Microsoft 365** (Outlook and Calendar only, Teams excluded for now): runs through Microsoft Graph, not a single purpose API. An Azure AD app registration is required, and because each enterprise has its own Azure AD tenant, an admin from that enterprise has to grant consent during connection setup, not just authorize like a typical OAuth2 flow. This makes the Microsoft 365 onboarding step one click heavier than Zoho, Odoo, or Salesforce.

## 7. End to End Flow (example)

A customer message comes in, referencing an order.

1. Ingestion function writes the message to `messages` and, regardless of mode, logs it to `analytics_events`.
2. If mode is Off, nothing else happens.
3. If Supervised or Unsupervised, the Inbox agent is invoked with the conversation context and the Zoho/Odoo tools it's permitted to use.
4. Agent produces a reply plus a `function_call` (e.g. update the order status in Zoho).
5. `executeAgentAction` checks mode:
   - Supervised: writes to `pending_actions`, notifies mobile, waits for approval.
   - Unsupervised: executes against the Zoho connection, writes `external_ref`.
6. `action_summary` is generated from the agent's reasoning text at the same time, no separate model call.
7. Daily job later rolls this action into that workspace's daily summary.

## 8. Summaries System

- **Per action**: free. Gemini 3.1's response includes reasoning text alongside the `function_call`. Store it as `action_summary` on the `pending_actions` doc. This is also what the mobile approval screen displays.
- **Daily**: scheduled function per workspace, once daily. Pulls that day's `action_summary` fields plus raw `analytics_events` counts (this is what gives Off mode workspaces a daily summary despite having no actions). One Gemini call, stored under `summaries/{workspace_id}/daily/{date}`.
- **Weekly**: aggregates the seven daily docs, not raw data again. Smaller context, cheaper, and consistent with what was already surfaced day to day.
- Use a different prompt template per mode. Off mode summaries should read as pattern and volume analytics. Supervised/Unsupervised summaries should read as "here's what your agents did." A single generic summarizer will make Off mode summaries read like an empty action log.

## 9. Mobile Companion App

Screens map directly to the backend surfaces, nothing extra:

- **Inbox**: live conversations via Firestore listeners.
- **Approval queue**: only populated in Supervised mode, shows `pending_actions` with `action_summary`, approve/reject buttons.
- **Calendar**: `calendar_events`, agent suggested changes shown same as any other pending action.
- **Reminders**: `reminders`, created by the Assistant agent or manually.
- **Summaries**: daily and weekly, pulled straight from `summaries`.
- **Settings**: mode switch (workspace level), connection status for Zoho and Odoo.

Push notifications drive the loop: new `pending_action` in Supervised mode, daily summary ready, reminder due.

## 10. Build Sequence

Given the Monday deadline, build in this order so each piece is usable before the next depends on it:

1. Firestore schema plus `executeAgentAction` skeleton, mode check only, no real connections yet.
2. One agent end to end: Personal Assistant is the simplest (no external connections), proves the mode gate works in all three states.
3. Mobile approval screen wired to `pending_actions`, since Supervised mode is untestable without it.
4. Inbox agent plus one connection (pick Zoho or Odoo, not both, for Monday).
5. Daily summary job. Weekly can follow after Monday since it depends on seven days of daily data existing first.

## 11. Enterprise Tenancy and RBAC

```
enterprises/{id}
  name, subscription_tier (starter | business | enterprise)
  status, wallet_id, created_at

users/{id}
  enterprise_id, role (owner | admin | employee)
  email, status, can_approve (bool)
```
Workspace becomes a unit inside an enterprise, not the top level entity. Owner and admin control billing, connections, and mode switching. Employees operate within whatever scope they're granted. Approval rights are a separate flag from role, so a Business tier enterprise can let a specific employee approve actions without making them an admin.

## 12. Wallet

```
wallets/{id}
  enterprise_id, balance, currency, updated_at

wallet_transactions/{id}
  wallet_id, type (credit | debit)
  amount, reason (agent_run | scheduled_job)
  ref_id, timestamp
```
Off mode never calls Gemini, so it never debits. Debit happens inside the same wrapper that calls Gemini, based on actual token usage, for Supervised and Unsupervised runs plus scheduled jobs like daily summaries. If a wallet hits zero mid operation, auto downgrade that enterprise to Off and notify the owner or admin, rather than letting agents fail silently.

## 13. Subscription Tiers

- **Starter**: one user. Personal Assistant and Calendar only. No Inbox, no Connections, no Web Widget.
- **Business**: up to 5 users. Full feature set, one shared wallet across the 5.
- **Enterprise**: unlimited users. Full feature set, same wallet model, custom connections land here first.

Enforce seat limits at user creation, a Cloud Function on the `users` write path checking current count against tier. Enforce feature gates (Starter blocking Inbox, Connections, Web Widget) inside `executeAgentAction`, the same choke point as mode.

## 14. Web Widget Channel

The Intercom style widget is not a new pipeline. It is a new channel value on `conversations`, `channel: web_widget`, flowing through the same Inbox agent and mode gate already built.

New collections:
```
widgets/{id}
  enterprise_id, site_key, allowed_domains, greeting, theme, status

visitors/{id}
  session_id, email, name (optional, captured mid conversation)
  conversation_refs, first_seen, last_seen
```
Visitors are not `users`. Users are enterprise employees with login and roles. Visitors are anonymous website traffic, identified only by session and whatever they volunteer mid conversation.

This is the one surface in the system that is publicly reachable without login, so it needs its own guardrails:
- `site_key` plus `allowed_domains` check on every request, so the widget only responds when embedded on a domain the enterprise registered.
- Rate limit per `session_id` and IP, since public traffic is the fastest way to drain a wallet.

Escalation to human follows the same pattern as Supervised mode approval. A visitor requesting a human creates a `pending_actions` style entry that notifies the enterprise's mobile app, no separate handoff logic needed.

The widget frontend is a small standalone bundle (vanilla JS or lightweight React, served via CDN), separate from the Flutter mobile companion, since it has to run inside arbitrary third party websites.
