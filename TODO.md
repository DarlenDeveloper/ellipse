# Ellipse — TODO

Progress tracker. See `IMPLEMENTATION.md` for the full plan. (`ellipse-desk-architecture.md` is AI-drafted reference only — not source of truth.)

Core principle: **one agent per connection**, plus **Ivy** (boss agent) built LAST. Wallet = subscription window only (no credits).

## 🎯 Next major milestones (in order)

All connections are live (Gmail, WhatsApp, Outlook, Zoho, SMTP, Website). Agent quality (triage), reports + documents, the Data page, and **Ivy + direct agent chat** are done. Remaining big rocks:

1. **Custom agents** — let users add their own agent to the Agents page (define name, purpose/system prompt, which tools/channels it can use). Surfaces in the agent selector + chat.
2. **Microsoft 365 file *creation* agent abilities** (beyond report upload, which is done):
   - `create_spreadsheet` / `read` / `append_row` (Excel via Graph workbook API)
   - `save_document` — Word docs + **quotation PDFs** generated on request in a conversation (e.g. "send them a quote")
   - Cross-agent: any agent can request a document be created + saved/emailed (all gated).
3. **Security pass (before production)** — Firestore rules (incl. owner-only mode, per-user `ivy_chats`), tokens Firestore → Secret Manager, remove all debug fns.
4. **Agent memory** (WAY later) — persistent per-agent memory across chats/conversations so agents recall context and preferences over time.

Supporting: real-time push (Gmail/Zoho webhooks), Search Console, website chat agent, Ivy dashboard briefing card.

---

## ✅ Agent quality — triage gate (DONE)
- [x] `agents/triage.ts`: `isLikelyAutomated()` heuristic (no-reply/notification/security/billing/newsletter senders skipped cheaply)
- [x] `triageMessage()` — strict KB-aware Gemini classifier → `{engage, is_lead, category, reason}`
- [x] Gated in `onMessageCreated`: reply agent only when `engage`, Zoho agent only when `is_lead`
- [x] Channel-aware: WhatsApp inbound always `{engage, is_lead}` (real person); email channels get strict triage
- [x] Triage result persisted on the conversation; tightened `replyBase`/`zohoAgent` prompts against junk

## ✅ Reports + Data page (DONE)
- [x] `reports.ts` — per-agent periodic reports; **timezone-aware** (enterprise `timezone`)
- [x] `scheduledReports` (hourly) generates at each org's **local midnight**: daily always, weekly Mon, monthly 1st, quarterly, annual — idempotent deterministic doc ids
- [x] **Hierarchical roll-ups**: weekly/monthly built from daily reports; quarterly/annual from monthly (sums child metrics + synthesizes child summaries, not a raw re-scan)
- [x] Reports are **business-oriented** (sales, audience, customer inquiries + "what to watch"), not "what the AI did"
- [x] `generateReportsNow` callable → "Generate now" button for on-demand testing
- [x] **Document generation**: Word `.docx` narrative (via `docx`) + Excel `.xlsx` of leads (via `exceljs`) → Firebase Storage with download tokens
- [x] `/data` page — folder/file layout (folders = agents), period tabs, files table, report drawer with metric cards + summary + downloadable files
- [x] Data added to sidebar nav
- [ ] On-demand roll-ups only cover a single period (true roll-ups need child reports to exist; scheduler builds them over time)

## ✅ Microsoft 365 report storage (DONE) — external upload is GATED
- [x] `uploadFileToOneDrive` + `isMicrosoftConnected` (Graph, `Files.ReadWrite` already granted)
- [x] Report files mirror to the customer's OneDrive ("Ellipse Reports" folder) — **only if MS365 connected**
- [x] Routed through `executeAgentAction` as a `save_file` action (domain `files`, target `microsoft365`):
  - Supervised → pending approval in `/approvals`; on approve, `onPendingActionApproved` downloads from Storage → uploads to OneDrive → links `webUrl` back onto the report
  - Unsupervised → uploads immediately; Off/expired → nothing uploads
- [x] Data page shows per-file state: "Open in Microsoft 365" / "awaiting approval"

## ✅ Zoho — expanded from lead-creation to sales/reporting (DONE)
- [x] `coql` (Zoho query language), `getSalesSummary` (new leads/contacts/deals, deals won, revenue, pipeline, stage breakdown, top deals), `getLeadsCreated`, generic `getRecordsCreated`
- [x] Zoho report pulls real CRM sales numbers; leads Excel comes from real Zoho leads

## ✅ Onboarding + Settings (DONE this pass)
- [x] **Timezone** added to org creation (auto-detected, editable) — powers report scheduling
- [x] Settings General tab de-mocked → real enterprise data (name, website, industry, timezone) + agent approval **mode**, live Firestore read/write
- [x] Settings shell redesigned (grouped card nav + section headers); Knowledge Base UI redesigned (toolbar, collapsible add form, card grid, empty state)

## ✅ Ivy + direct agent chat (DONE)
- [x] `IvyOrb` — pure-CSS animated glassy sphere (swirling plasma, flowing wave, shine, slow rotation)
- [x] `IvyBubble` — floating orb on all authed pages (hidden on /ivy), quick chat panel + expand-to-full-view
- [x] `/ivy` wide page — greeting, big composer, suggestion chips, agent selector (Ivy or a specific agent)
- [x] Chat **history** persisted to `ivy_chats` (per user+enterprise); dropdown grouped Today/Yesterday/Earlier, click to reopen, New Chat resets
- [x] **`askAgent` backend** — two-pass Gemini (reason → call tools → natural reply)
- [x] **Ivy orchestrator**: tools across all agents — `search_conversations`, `get_reports`, `get_sales_summary`, `get_web_analytics`, `create_crm_lead`, `reply_to_conversation`
- [x] **Per-agent direct chat** scoped to that connection's tools (Zoho=CRM, messaging=channel convos+reply, Website=analytics); tools only offered if the connection is active
- [x] Every chat ACTION routes through `executeAgentAction` → respects mode/approval (Supervised queues in /approvals, Autopilot executes, Off/expired does nothing)
- [x] Removed the old "Ivy coming soon" card from the Agents page
- [ ] Ivy dashboard briefing card (daily summary across agents)

---

## Connections

### Google Workspace (Gmail) — 🟢 working
- [x] OAuth connect, token store, ingest, auto-sync (`scheduledGmailSync` 5 min), live inbox
- [x] Gmail agent (CRM-aware, gated `send_reply`, threaded), signs with org name
- [ ] Send/reply UI button in reading pane
- [ ] True real-time push (`users.watch` + Pub/Sub)
- [ ] Refresh token → Secret Manager
- [ ] Calendar + Contacts

### WhatsApp — ✅ working (Meta Cloud API, production)
- [x] Config store, webhook (verified), Graph send, connect modal, dedicated agent, live end-to-end
- [ ] Token → Secret Manager; media/button types; 24h-window template awareness

### SMTP / IMAP — 🟢 working
- [x] Config/test/ingest/send, auto-sync, channel-aware agent
- [ ] End-to-end test with a real mailbox; creds → Secret Manager

### Zoho CRM — 🟢 working (+ sales reporting)
- [x] OAuth (DC-aware), refresh, executors, enrich, backfill, agent, gated writes, sales/reporting reads
- [ ] Real-time Notification API webhook; refresh token → Secret Manager; auto-run on ingest already covered by `onMessageCreated`
- [ ] Remove debug fns (`pingZoho`, `zohoSearchDebug`, `zohoBackfillDebug`, `runZohoAgentDebug`)

### Microsoft 365 — 🟢 Outlook working + report storage
- [x] OAuth, token refresh, Outlook ingest + auto-sync, threaded reply, dedicated agent, OneDrive report upload (gated)
- [ ] File *creation* abilities (Excel workbook API, Word/quotation PDF on request)
- [ ] Refresh token → Secret Manager; remove `pingMicrosoft`

### Odoo — ⚪ 0% (reuse Zoho framework)
### Salesforce — ⚪ 0%

## Core platform
- [x] Auth + route protection; onboarding (now with timezone)
- [x] `executeAgentAction` gate (mode + tier + subscription); Gemini wrapper
- [x] `onMessageCreated` dispatch + triage gate; per-connection agents sharing `replyBase`
- [x] `pending_actions` approval flow (`onPendingActionApproved`) — now also executes `save_file`
- [x] Approvals page, Agents page (live monitoring)
- [ ] Ivy backend (LAST)
- [ ] Mode switcher persisted to Firestore

## Website analytics — 🟢 working
- [x] Tracker (`webTag`), collector (`collectWebEvent`, geo), register + verify install, analytics-only `/website` page (real-time, bounce, new vs returning, countries/cities, top pages)
- [x] Website logo added (`/logos/web.png`) across integrations, agents, reports
- [ ] Rate-limit collector; surface `web` on main Analytics chart; Search Console; website chat agent

## Knowledge base — 🟢 working
- [x] Settings KB CRUD (live Firestore), injected into all agents + triage; redesigned UI
- [ ] Chunk/embed for retrieval when large

## UI / branding polish
- [x] Real transparent per-connection logos; standalone (no colored tiles); blue active states
- [x] Dashboard/Website charts with granularity + ranges
- [x] Settings + Knowledge Base redesign; Data page; Ivy orb/bubble
- [ ] Wire inbox "Summarise" button

## Deferred / flagged (security pass before production)
- [ ] Firestore security rules (still test mode ⚠️)
- [ ] All refresh tokens/creds Firestore → Secret Manager
- [ ] Remove all debug fns (`ping*`, `*Debug`, `runGmailAgentDebug`, `runZohoAgentDebug`)
- [ ] Invite emails (currently just a doc)
- [ ] Node 20 → newer runtime; bump firebase-functions
- [ ] Web widget (Intercom-style)
- [ ] Consider unified API (Nango/Merge) for remaining connections
