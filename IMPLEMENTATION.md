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
- **Mercury Store** (custom external REST API, key-auth) — products/orders/quotations/repairs read+write; server-side `q` search + cursor pagination sweep (whole catalog, not just first page); standalone Mercury agent + Ivy tools (`store_list`/`store_get`/`store_create`/`store_update`, writes gated). See `External-integration-API.md`.

### Done — agents & intelligence
- **One agent per connection** sharing `replyBase` (gmail/smtp/microsoft/whatsapp), Zoho CRM agent, Website agent
- **Triage gate** (`agents/triage.ts`): heuristic (skip no-reply/automated) + Gemini classifier → `{engage,is_lead}`. Personal-assistant mode: engages real human emails incl. personal; leads stay strict. WhatsApp inbound always engages.
- **Ivy + direct agent chat** (`askAgent`): two-pass Gemini (reason → tools → grounded reply), temperature 0 on final answer, strict no-hallucination. Ivy orchestrates across all agents; each agent scoped to its own tools. Connected-integration list injected so clarifying questions only offer connected sources.
- **Chat UI**: animated `IvyOrb`, floating `IvyBubble` (all pages), wide `/ivy` page with agent selector + history dropdown (persisted to `ivy_chats`).
- **Custom agents**: user-defined agents (name, specialty, ability checklist) in `custom_agents`; appear in the selector; scoped tools.
- **Document creation** (`create_document`) + **multi-source reports** (`generate_report`): deterministic Excel/Word built in code from live data (NO AI-authored figures). Saved to `documents` → Data page; mirrored to OneDrive when MS365 connected (gated).
- **Owner-only Quote Owner analysis** (`generate_owner_analysis`): per-employee quote performance, gated to org owner (role check).
- **Quotation / proforma generation** (`create_quotation`): deterministic branded PDF (pdfkit) matching the client's proforma layout — letterhead (logo + company block), line-item table, subtotal/VAT/total, prepared-by, terms. Amounts computed in code (no AI figures). Auto proforma number `PREFIX/YY/Mon/NNNNN`. Branding configured in **Settings → Quotation** (owner-only, logo upload) via `saveQuotationBranding`. Can build from a real Zoho quote (`get_zoho_quote` pulls the `Quoted_Items` line items).
- **Send email** (`send_email`): agent sends a brand-new email to ANY address, optional attachment (e.g. the quotation PDF via `attachDocumentId`). Routed through the gate — supervised → queued in Approvals; attachment support added to Gmail/SMTP/Outlook. Channel auto-picked (Gmail → MS365 → SMTP).
- **List leads** (`list_leads`): real Zoho lead rows (name, company, owner, status, source, date), newest-first, optional period filter — fixes agents guessing lead lists from the aggregate summary.
- **Knowledge base file upload** (`ingestKnowledgeFile`): upload PDFs/images/text (e.g. sample quotations); text extracted via Gemini multimodal (verbatim) and fed to agents as context. Settings → Knowledge Base "Upload File".
- Approvals page, Agents page (live monitoring), Data page (folder/file repository)

### Reports — how they work (anti-hallucination)
- Scheduled per-agent reports at local midnight (daily → weekly/monthly/quarterly/annual roll-ups), timezone-aware, stored in `reports/`.
- On-demand `generate_report(period, sources, detail)` — one Excel per connected source (Zoho / Website / messaging channels). Zoho detailed = Quotes line-items; **detailed is the default**.
- All report numbers come straight from the source API into the cells via `exceljs`/`docx` — the AI only picks the tool and phrases the message.

### Done — users, roles & access (this pass)
- **Roles**: `owner` / `admin` / `employee` + orthogonal `can_approve`.
- **Join flow** (`acceptInvite`): invited emails auto-link to the right org on signup/login (not a new org); wired into `getLandingRoute` + signup.
- **Member management** (role-checked + seat-limited callables): `inviteMember`, `updateMemberRole`, `setMemberCanApprove`, `removeMember`, `revokeInvite`. Owner untouchable; only owner manages admins.
- **Per-connection shared access**: employees request specific connections (`requestSharedAccess`), owner/admin approve/deny (`respondAccessRequest`) or set exact grants (`setConnectionGrants`); grants in `connection_grants/{eid}_{uid}.types`. Agent tools gated per user (`allowedConnectionTypes`).
- **Real Users page** on live data (members + pending invites + access requests), actions gated by viewer role.
- **Data scoping** via `useAccess` hook — Inbox, Dashboard (QuickStats/Statistics/RecentThreads/PendingApprovals), Approvals, Website, Data, Analytics all filter to the member's granted connections (owner/admin see all). Integrations shows per-connection "Connected" vs "No access — request it"; non-admins can't connect/disconnect.
- **Daily owner-only team digest** (`orgUsers.ts` → hooked into `scheduledReports`/`generateReportsNow`): per-member chats/agents/topics + shared-connection snapshot; `owner_only:true`; Data page shows it to the owner only.

### Done — security pass (started)
- **Firestore rules** (`firestore.rules`, deployed): tenant isolation, deny-by-default, role/owner write control, approvals limited to managers/approvers, `ivy_chats` author-only, `connection_secrets` fully locked.
- **Secret split**: OAuth tokens / API keys / SMTP passwords → locked `connection_secrets` (`connectionSecrets.ts`); `connections` now secret-free; one-time `migrateConnectionSecrets` run on existing data.

### Next
- Per-connection within-org read enforcement in rules (needs query rewrites; currently app-layer)
- Tokens `connection_secrets` → Secret Manager
- Remove all debug fns + one-time `migrateConnectionSecrets`
- Ivy dashboard briefing card; live Excel append via Graph workbook API
- See `USERS_AND_ROLES.md` for the full users/roles/access spec + status

## Users & Roles — plan (next up)

Model the client described:
- **Roles:** `owner`, `admin`, `employee` + orthogonal `can_approve` flag. (Manager/Viewer from the old mock are dropped unless a read-only role is needed.)
- **Integrations per user:**
  - A user may use the **org owner's (shared) integrations** — but only **with permission** (owner/admin grants access).
  - A user may **add their own integrations** freely (no permission needed); these are **personal**, scoped to that user.
- **Daily per-user digest:** every day **Ivy generates an "org users report" for the owner** — what each user did + summaries pulled from that user's connections (e.g. their Zoho activity). The owner sees the org-wide roll-up of all users.
- **Visibility:** regular org users **cannot** see other users' activity/reports or the org-wide digest — that's owner-only. *(Confirm exact scope: what else are non-owners restricted from — analytics, other users' inbox, settings?)*

Build steps (once confirmed):
1. `acceptInvite` callable — invited email signs up → linked to the org with role/can_approve (instead of creating a new org). Wire into post-login landing.
2. Member-management callables (role-checked + seat-limited): `inviteMember`, `updateMemberRole`, `setCanApprove`, `removeMember`, `revokeInvite`.
3. Connection ownership model: mark connections as **shared (org)** vs **personal (user)**; per-user grant to use shared ones; scope agent tool access accordingly.
4. Daily `orgUsersReport` (scheduled) → per-user activity + connection summaries, delivered to the owner.
5. Rebuild the Users page on real data (members + pending invites), actions gated by viewer role.
6. Frontend permission gating on settings/integrations for non-admins.

## Deferred / flagged (security pass before production)
- ✅ Firestore **security rules** deployed (`firestore.rules`): tenant isolation, deny-by-default, role/owner write control, `connection_secrets` fully locked, `ivy_chats` author-only.
- ✅ **Secret split**: OAuth tokens / API keys / SMTP passwords → locked `connection_secrets` collection (clients denied); `connections` is now secret-free. Migration run.
- Per-connection within-org read enforcement is still app-layer (`useAccess`) — rules can't filter queries; hardening needs query rewrites (follow-up).
- All refresh tokens/creds → **Secret Manager** (interim: `connection_secrets`, function-only)
- **Remove debug fns**: `pingGemini`, `pingZoho`, `pingMicrosoft`, `pingStorage`, `zohoSearchDebug`, `zohoBackfillDebug`, `zohoFieldsDebug`, `crmReportDebug`, `reportGenDebug`, `runGmailAgentDebug`, `runZohoAgentDebug`, `mercuryDebug`, `quotationDebug`, `zohoQuoteDebug`, `zohoLeadsDebug` (+ helpers `mercuryRawGet`, `debugRecentQuote`, `debugLeadsRaw`) + one-time `migrateConnectionSecrets`
- ✅ Firestore rules deployed; ✅ role enforcement in member/access callables (+ owner-gated mode, quotation branding, owner analysis). Remaining: invite **emails**, per-connection read rules hardening
- Vercel production wiring: `FRONTEND_URL`, OAuth redirect allowlists, Firebase Auth authorized domains
- WhatsApp **permanent** (System User) token
- Real-time push (Gmail/Zoho webhooks) instead of polling
- Agent **memory** (later); web widget

## Corrections to `ellipse-desk-architecture.md` (AI-drafted, partly wrong)
- Agents are **per-connection + Ivy (personal agent)**, NOT domain agents (Inbox/Assistant/Calendar).
- Personal Assistant = **Ivy**, built **last** (doc said build it first).
- Wallet is **subscription dates only**, NOT a credit balance debited by token usage.
