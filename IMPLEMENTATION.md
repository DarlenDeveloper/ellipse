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
- **WhatsApp** (Meta Cloud API) — webhook, send, agent; shared human-reviewed Inbox reply composer alongside Gmail, SMTP, and Outlook
- **Zoho CRM** — OAuth (DC-aware), enrich, backfill, write executors, **rich reporting** (see ZOHO.md)
- **Website analytics** — tracker, collector, verify-install, `/website` analytics page
- **Mercury Store** (custom external REST API, key-auth) — products/orders/quotations/repairs read+write; server-side `q` search + cursor pagination sweep (whole catalog, not just first page); standalone Mercury agent + Ivy tools (`store_list`/`store_get`/`store_create`/`store_update`, writes gated). See `External-integration-API.md`.

### Done — agents & intelligence
- **One agent per connection** sharing `replyBase` (gmail/smtp/microsoft/whatsapp), Zoho CRM agent, Website agent
- **Triage gate** (`agents/triage.ts`): heuristic (skip no-reply/automated) + Gemini classifier → `{engage,is_lead}`. Personal-assistant mode: engages real human emails incl. personal; leads stay strict. WhatsApp inbound always engages.
- **Ivy + direct agent chat** (`askAgent`): two-pass Gemini (reason → tools → grounded reply), temperature 0 on final answer, strict no-hallucination. Ivy orchestrates across all agents; each agent scoped to its own tools. Connected-integration list injected so clarifying questions only offer connected sources.
- **Chat UI**: animated `IvyOrb`, floating `IvyBubble` (all pages), wide `/ivy` page with agent selector + history dropdown (persisted to `ivy_chats`).
- **Safe Markdown rendering across agent surfaces**: Ivy/full agent chat, floating Ivy bubble, and Inbox AI panels render headings, bold text, lists, links, inline code, and fenced code blocks as React elements (no raw HTML injection).
- **Custom agents**: user-defined agents (name, specialty, ability checklist) in `custom_agents`; appear in the selector; scoped tools.
- **Document creation** (`create_document`) + **multi-source reports** (`generate_report`): deterministic Excel/Word built in code from live data (NO AI-authored figures). Saved to `documents` → Data page; mirrored to OneDrive when MS365 connected (gated).
- **Owner-only Quote Owner analysis** (`generate_owner_analysis`): per-employee quote performance, gated to org owner (role check).
- **Quotation / proforma generation** (`create_quotation`): deterministic branded PDF (pdfkit) matching the client's proforma layout — letterhead (logo + company block), line-item table, subtotal/VAT/total, prepared-by, terms. Amounts computed in code (no AI figures). Auto proforma number `PREFIX/YY/Mon/NNNNN`. Branding configured in **Settings → Quotation** (owner-only, logo upload) via `saveQuotationBranding`. Can build from a real Zoho quote (`get_zoho_quote` pulls the `Quoted_Items` line items).
- **Send email** (`send_email`): agent sends a brand-new email to ANY address, optional attachment (e.g. the quotation PDF via `attachDocumentId`). Routed through the gate — supervised → queued in Approvals; attachment support added to Gmail/SMTP/Outlook. Channel auto-picked (Gmail → MS365 → SMTP).
- **List leads** (`list_leads`): real Zoho lead rows (name, company, owner, status, source, date), newest-first, optional period filter — fixes agents guessing lead lists from the aggregate summary.
- **Knowledge base file upload** (`ingestKnowledgeFile`): upload PDFs/images/text (e.g. sample quotations); text extracted via Gemini multimodal (verbatim) and fed to agents as context. Settings → Knowledge Base "Upload File".
- Approvals page, Agents page (live monitoring), Data page (folder/file repository)

### Done — Inbox intelligence & usability (2026-07-27)
- **Working global Inbox search** across conversation title, sender/customer, raw channel ID, and friendly integration names (Gmail, Outlook, WhatsApp, SMTP/IMAP); first match auto-selects and empty states are explicit.
- Removed the decorative Inbox top-right icons/filter and replaced the old message toolbar with working **AI Brief**, **Draft reply**, **Create tasks**, and **Ask Ivy** actions.
- **Personalized AI Brief** is grounded in the selected conversation and authenticated employee context; structured sections cover relevance, changes, actions, risks/deadlines, and next step.
- **Human-reviewed AI replies**: generated drafts flow into the real reply composer for Gmail, Outlook/MS365, SMTP/IMAP, and WhatsApp. The employee edits and explicitly sends; generation never auto-sends.
- **Email rendering cleanup**: tenant-constrained message query, visible loading/error/empty states, CRLF normalization, invisible newsletter-spacer removal, repeated-blank-line collapse, safe HTML-to-text cleanup, clickable links, and readable 760px body width.
- Conversation backlinks are supported via `/inbox?conversation={id}` and select the requested thread when permitted.

### Done — Tasks + personal Calendar foundation (2026-07-27, deployed)
- **Real Tasks page** replaces dummy sprint cards with live Firestore tasks and a four-stage Kanban (`todo`, `in_progress`, `blocked`, `done`).
- Manual task creation supports title, description, priority, assignee, and due date. Employees see tasks assigned to or created by them; owners/admins receive the organization task view.
- **Structured Inbox task extraction** (`extractConversationTasks`): Gemini returns validated JSON proposals, not prose. Employees review/edit title, description, priority, and deadline before confirming.
- Human-confirmed creation (`createTask`) records source conversation/channel, AI confidence context, assignee, timestamps, and a fingerprint that blocks duplicate tasks from the same conversation.
- Task status/content changes use the authenticated `updateTask` callable; task cards link back to their source conversation.
- **Real personal Calendar page** replaces dummy events. `createCalendarEvent`/`updateCalendarEvent` create local Ellipse events owned by the signed-in employee.
- Calendar crowding rule: task deadlines remain Tasks by default. Only explicit meetings/time blocks, or tasks where the employee checks “Add a 30-minute block to my calendar,” create calendar events.
- Calendar events are private to their owner in Firestore rules. Owners/admins oversee work through Tasks and do **not** automatically inherit employees' calendar events.
- Calendar records are provider-ready (`provider`, `provider_event_id`, `sync_status`, `task_id`) for later Google Calendar / Microsoft Graph synchronization.
- Deployed to Firebase project `ellipse-desk`: `extractConversationTasks`, `createTask`, `updateTask`, `createCalendarEvent`, `updateCalendarEvent`, plus updated Firestore rules.

### Reports — how they work (anti-hallucination)
- Scheduled per-agent reports at local midnight (daily → weekly/monthly/quarterly/annual roll-ups), timezone-aware, stored in `reports/`.
- On-demand `generate_report(period, sources, detail)` — one Excel per connected source (Zoho / Website / messaging channels). Zoho detailed = Quotes line-items; **detailed is the default**.
- All report numbers come straight from the source API into the cells via `exceljs`/`docx` — the AI only picks the tool and phrases the message.

### Done — users, roles & access (this pass)
- **Roles**: `owner` / `admin` / `employee` + orthogonal `can_approve`.
- **Join flow** (`acceptInvite`): invited emails auto-link to the right org on signup/login (not a new org); wired into `getLandingRoute` + signup.
- **Member management** (role-checked + seat-limited callables): `inviteMember`, `updateMemberRole`, `setMemberCanApprove`, `removeMember`, `revokeInvite`. Owner untouchable; only owner manages admins.
- **Per-connection shared access**: employees request specific connections (`requestSharedAccess`), owner/admin approve/deny (`respondAccessRequest`) or set exact grants (`setConnectionGrants`); grants in `connection_grants/{eid}_{uid}.types`. Agent tools gated per user (`allowedConnectionTypes`).
- Employee **Connect** opens an explicit company-vs-personal choice. Personal Google Workspace and Zoho use separate owner-scoped connection/secret records and expiring one-time OAuth state. Gmail includes owned mailbox records and scoped sends/replies. Zoho live reads, gated writes, approvals and official quotation generation retain the employee credential context. Both support personal-only disconnect. Remaining providers still need migration.
- Owners/admins manage approved grants through a member-specific **Manage access** popup and can remove one integration grant without revoking the employee's other integrations.
- **Real Users page** on live data (members + pending invites + access requests), actions gated by viewer role.
- **Data scoping** via `useAccess` hook — Inbox, Dashboard (QuickStats/Statistics/RecentThreads/PendingApprovals), Approvals, Website, Data, Analytics all filter to the member's granted connections (owner/admin see all). Integrations shows per-connection "Connected" vs "No access — request it"; non-admins can't connect/disconnect.
- **Daily owner-only team digest** (`orgUsers.ts` → hooked into `scheduledReports`/`generateReportsNow`): per-member chats/agents/topics + shared-connection snapshot; `owner_only:true`; Data page shows it to the owner only.
- Access-request edits now replace the requested type list exactly (old selections are not silently accumulated). Approved shared connections are shown as **company access**, not as employee-owned connections.
- **Agent/Ivy enforcement:** direct connection-agent calls require a caller grant; report generation intersects sources with the caller's allowed connections; employees only see granted agents and do not see organization-wide action totals presented as their own.

### Done — Zoho-native quotation + file delivery (2026-07-28)
- Compound gated workflow: resolve/create Lead, Account and Contact → match exact Zoho Products → create Zoho Quote → download the official Quotes mail-merge PDF → save the exact bytes and provenance in Ellipse Data.
- Idempotent `quotation_workflows/{workflowKey}` prevents duplicate Quotes on retry/approval replay.
- Settings accepts the exact Zoho Quotes mail-merge template name.
- Gmail, SMTP/IMAP and Microsoft 365 replies can attach a saved Data document. Outlook inline reply attachments currently cap at 3 MB.
- Ivy can create a Zoho quotation, find a previously saved quotation, and attach it to a reply. Explicit inbound quotation requests can propose the compound workflow through Approvals.
- Activation requirement: reconnect Zoho for Writer/mail-merge scopes and configure the exact template name before the first live test.

### Done — inbound email attachments (2026-07-29)
- Gmail, Microsoft 365 and SMTP/IMAP ingestion now discover and download new inbound attachments instead of discarding MIME/Graph/mailparser attachment parts.
- Safe files are stored in Firebase Storage and represented in `documents` as `kind: email_attachment`, with source system, message/conversation, sender, connection scope, owner, content type, size and checksum/provenance metadata.
- Inbox messages retain attachment references and render downloadable cards. Inbox **Ask Ivy** receives attachment names, types, sizes and Data document IDs as grounded conversation context.
- Guardrails: maximum 10 files, 10 MB per file and 25 MB total; executable extensions and executable MIME types are rejected.
- Existing message documents remain idempotently skipped, so old emails are not backfilled automatically. A future explicit backfill tool must be bounded and deduplicated.

### Done — in-app and Web Push notifications (2026-07-29)
- Real-time Firestore notification bell with unread badge, 30-item panel, relative timestamps, deep links, per-item read state and **Mark all read**.
- Backend notification producers cover new inbound messages, pending approvals, approved/rejected/completed/failed actions, and shared-integration access requests/decisions.
- Notifications are per-user. Personal-connection messages target their credential owner; shared-message notifications target active organization members; approval notifications target managers and members with `can_approve`.
- Settings → Notifications is no longer mock UI: preferences persist on the user record and are enforced before in-app and push delivery.
- Firebase Cloud Messaging Web Push is live in backend code: public VAPID key, service worker, PWA manifest, per-device token registration/revocation, click-through links and invalid-token cleanup.
- Push is a secondary channel: FCM delivery errors are logged but never fail the underlying email, approval or agent action.
- Each browser/device requires explicit user permission. iOS/iPadOS requires the installed Home Screen PWA. The service worker and manifest become available on the production domain only after the frontend is deployed.

### Done — security pass (started)
- **Firestore rules** (`firestore.rules`, deployed): tenant isolation, deny-by-default, role/owner write control, approvals limited to managers/approvers, `ivy_chats` author-only, `connection_secrets` fully locked.
- Task reads are limited to managers or the task's assignee/creator. Personal calendar reads are owner-only; all task/calendar writes go through authenticated callables.
- **Secret split**: OAuth tokens / API keys / SMTP passwords → locked `connection_secrets` (`connectionSecrets.ts`); `connections` now secret-free; one-time `migrateConnectionSecrets` run on existing data.
- Notification reads are recipient-only; clients may change only `read` and `read_at`. Push tokens are written through authenticated callables and are never client-readable.

### Next
- **Organization audit logs (launch priority):** immutable actor/action/target/result records for authentication, invitations, role/grant changes, approvals, agent/tool execution, connection lifecycle, document/report creation/download/sharing, and security failures. Owner/admin viewer with filters and retention policy.
- Per-connection within-org read enforcement in rules (needs query rewrites; currently app-layer)
- Tokens `connection_secrets` → Secret Manager
- Remove all debug fns + one-time `migrateConnectionSecrets`
- Ivy dashboard briefing card; live Excel append via Graph workbook API
- Google Calendar + Microsoft Graph event synchronization on top of the local provider-ready calendar model
- Node.js 20 Functions runtime upgrade before decommissioning on **2026-10-30**; upgrade `firebase-functions` in a controlled breaking-change pass
- Production Google login: authorize `crm.mercurycomputerslimited.com` in Firebase Auth, verify Google provider, and expose actionable Firebase auth errors instead of a generic failure.
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
