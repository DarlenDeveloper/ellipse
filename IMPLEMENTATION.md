# Ellipse Desk — Implementation Plan

Brief, living checklist. **This file is the source of truth** (the architecture doc was AI-drafted and has wrong assumptions — see corrections below).

## What Ellipse is

Business automation software with AI. A unified inbox brings every channel into one place, and AI agents run the business on the owner's behalf. Primary user is the **owner** (can add teammates).

## Mental model (corrected)

- **One agent per connection** — Zoho agent, WhatsApp agent, Gmail agent, etc. Each understands its own platform's specifics. Routing is automatic (a message from WhatsApp goes to the WhatsApp agent).
- **Ivy (personal agent)** sits on top, talks to all connection agents, and oversees actions. **Built LAST.**
- **Agent behavior by mode:**
  - **Off** → read only + enrich analytics. No suggestions, no actions.
  - **Supervised** → read → analyze → **suggest** an action, wait for human approval.
  - **Unsupervised** → read → analyze → **act** automatically.
- **`executeAgentAction`** = the single choke point. Every action passes through it. Mode + tier + subscription enforced here, nowhere else.
- **Unified inbox** = all channels in one place (WhatsApp, email, SMTP…). Users can also **send/reply from within** the app.
- **Wallet = subscription window only** (start + end date). Freezes on the end date. **No credits, no per-token metering.**

## Build order (24-hour push)

Connections first (CRM → communication → marketing much later), Ivy (personal agent) last.

1. **Connection agent framework** — how a connection registers, ingests, and runs its agent through the gate.
2. **First connection end-to-end** — CRM (Zoho) OR a communication channel feeding the inbox (TBD, see open questions).
3. `pending_actions` approval flow (test Supervised).
4. Unified inbox reads real ingested messages + send-from-within.
5. Next connections: WhatsApp, Gmail/Workspace, SMTP.
6. **Ivy (personal agent)** (oversees + coordinates connection agents).
7. Marketing connections (Instagram, etc.) — much later.
8. Web widget (Intercom-style, text + calls) — later.

## Status

### Done — platform
- Frontend UI (all pages)
- Firebase Auth (email + Google) + route protection
- Onboarding — incremental & resumable (enterprise, subscription/wallet, connections, invites, owner role). Now captures **timezone**.
- `executeAgentAction` gate — mode + tier + **subscription** check (choke point for every action)
- Gemini wrapper (`gemini-3.1-flash-lite`), supports tools + temperature
- `onMessageCreated` auto-trigger + **triage gate** (see below)
- Knowledge Base (Settings tab, live Firestore, injected into all agents)
- Settings General de-mocked → real org data + owner-only agent **mode** selector

### Done — connections (all live)
- **Gmail / Google Workspace** — OAuth, ingest, 5-min auto-sync, agent, threaded reply (gated)
- **SMTP / IMAP** — connect/test/ingest/send, auto-sync, agent
- **Microsoft 365 (Outlook)** — OAuth, ingest, auto-sync, threaded reply, **OneDrive file upload (gated)**
- **WhatsApp** (Meta Cloud API) — webhook, send, agent; WhatsApp-only reply composer in inbox
- **Zoho CRM** — OAuth (DC-aware), enrich, backfill, write executors, **rich reporting** (see ZOHO.md)
- **Website analytics** — tracker, collector, verify-install, `/website` analytics page

### Done — agents & intelligence
- **One agent per connection** sharing `replyBase` (gmail/smtp/microsoft/whatsapp), Zoho CRM agent, Website agent
- **Triage gate** (`agents/triage.ts`): heuristic (skip no-reply/automated) + Gemini classifier → `{engage,is_lead}`. Personal-assistant mode: engages real human emails incl. personal; leads stay strict. WhatsApp inbound always engages.
- **Ivy + direct agent chat** (`askAgent`): two-pass Gemini (reason → tools → grounded reply), temperature 0 on final answer, strict no-hallucination. Ivy orchestrates across all agents; each agent scoped to its own tools. Connected-integration list injected so clarifying questions only offer connected sources.
- **Chat UI**: animated `IvyOrb`, floating `IvyBubble` (all pages), wide `/ivy` page with agent selector + history dropdown (persisted to `ivy_chats`).
- **Custom agents**: user-defined agents (name, specialty, ability checklist) in `custom_agents`; appear in the selector; scoped tools.
- **Document creation** (`create_document`) + **multi-source reports** (`generate_report`): deterministic Excel/Word built in code from live data (NO AI-authored figures). Saved to `documents` → Data page; mirrored to OneDrive when MS365 connected (gated).
- **Owner-only Quote Owner analysis** (`generate_owner_analysis`): per-employee quote performance, gated to org owner (role check).
- Approvals page, Agents page (live monitoring), Data page (folder/file repository)

### Reports — how they work (anti-hallucination)
- Scheduled per-agent reports at local midnight (daily → weekly/monthly/quarterly/annual roll-ups), timezone-aware, stored in `reports/`.
- On-demand `generate_report(period, sources, detail)` — one Excel per connected source (Zoho / Website / messaging channels). Zoho detailed = Quotes line-items; **detailed is the default**.
- All report numbers come straight from the source API into the cells via `exceljs`/`docx` — the AI only picks the tool and phrases the message.

### Next
- **Custom system** integration (next up)
- Ivy dashboard briefing card
- Richer MS365 files (quotation PDFs, live Excel append)

## Deferred / flagged (security pass before production)
- Firestore **security rules** still test mode ⚠️ (add owner-only mode, per-user `ivy_chats`, per-enterprise `custom_agents`/`documents`/`reports`)
- All refresh tokens/creds Firestore → **Secret Manager**
- **Remove debug fns**: `pingGemini`, `pingZoho`, `pingMicrosoft`, `pingStorage`, `zohoSearchDebug`, `zohoBackfillDebug`, `zohoFieldsDebug`, `crmReportDebug`, `reportGenDebug`, `runGmailAgentDebug`, `runZohoAgentDebug`
- Role enforcement (only mode is owner-gated so far) + invite **emails**
- Vercel production wiring: `FRONTEND_URL`, OAuth redirect allowlists, Firebase Auth authorized domains
- WhatsApp **permanent** (System User) token
- Real-time push (Gmail/Zoho webhooks) instead of polling
- Agent **memory** (later); web widget

## Corrections to `ellipse-desk-architecture.md` (AI-drafted, partly wrong)
- Agents are **per-connection + Ivy (personal agent)**, NOT domain agents (Inbox/Assistant/Calendar).
- Personal Assistant = **Ivy**, built **last** (doc said build it first).
- Wallet is **subscription dates only**, NOT a credit balance debited by token usage.
