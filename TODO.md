# Ellipse — TODO

Progress tracker. See `IMPLEMENTATION.md` for the full plan and `ellipse-desk-architecture.md` for reference.

## Connections

### Google Workspace (Gmail) — 🟡 70%
Done:
- [x] Google OAuth connect flow (consent → callback → tokens)
- [x] Store connection (`connections/{enterpriseId}_google-workspace`) + account email
- [x] Ingest recent 15 inbox emails → `conversations` + `messages` + `analytics_events`
- [x] Auto-sync on connect + manual Sync button
- [x] Unified inbox displays real Gmail threads (live via onSnapshot)

Remaining (the 30%):
- [x] Gmail agent (`runGmailAgent`): read → CRM-aware analyze (Gemini) → suggest reply (Supervised) / send (Unsupervised)
- [x] Send / reply from within (`sendGmailReply`, threaded) — routed through gate as `gmail` `send_reply`
- [ ] Send/reply UI button in the inbox reading pane
- [x] Auto-sync: `scheduledGmailSync` polls every 5 min (no manual button)
- [ ] True real-time push (`users.watch` + Pub/Sub) — upgrade from polling later
- [ ] Move refresh token from Firestore → Secret Manager (security)
- [ ] Handle Calendar + Contacts (Workspace is more than Gmail)

### WhatsApp — ⏸️ ON HOLD (code built; blocked on Meta app publishing / Business Verification)
Built & deployed:
- [x] `connections/whatsapp.ts` — config store, connection test, Graph API send, inbound webhook parser
- [x] `whatsappWebhook` (verified) + `connectWhatsapp` callable; connect modal on Integrations
- [x] `whatsapp` target routing in gate; email agent is channel-aware (WhatsApp tone)
- [x] Verified pipeline end-to-end via simulated Meta payload (ingest + agent fired)
On hold (Meta-side blocker):
- [ ] Meta won't deliver REAL inbound on an unpublished app → needs Business Verification + publish
- [ ] Alternative if Meta stalls: 360dialog adapter (sandbox key already obtained)

### SMTP / IMAP — 🟡 80%
Done:
- [x] `connections/smtp.ts` — config store, connection test, IMAP ingest, SMTP send
- [x] `connectSmtp` (test + save) + `syncSmtp` callables; credentials form modal on Integrations
- [x] Auto-sync `scheduledImapSync` (every 5 min) + `smtp` target routing in gate
- [x] Email agent is channel-aware — SMTP convos reply via SMTP, Gmail via Gmail
Remaining:
- [ ] Test end-to-end with a real mailbox (need IMAP/SMTP creds)
- [ ] Move credentials Firestore → Secret Manager (security, later)

### Zoho CRM — 🟡 50%
Done:
- [x] Client creds in Secret Manager (`ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET`)
- [x] OAuth connect flow (`startZohoConnect` → consent → `zohoOAuthCallback`), deployed
- [x] DC-aware token exchange (captures `accounts-server`) + store `connections/{enterpriseId}_zoho`
- [x] Manual token refresh, cached + rate-limit friendly (refresh only on expiry)
- [x] Action executors: `searchByEmail`, `createRecord`, `updateRecord`, `addNote`
- [x] Real `executeAction()` routing for `targetSystem: "zoho"` (replaces stub)
- [x] Integrations page Connect button wired

Done (agent):
- [x] Verified connect end-to-end (read 46 modules via `pingZoho`)
- [x] Read/enrich: `enrichFromZoho` looks up Contact/Lead by email + related Deals
- [x] Zoho agent (`runZohoAgent`): enrich → Gemini (reply + CRM tools) → route through gate
- [x] Zoho actions registered as Gemini function declarations (create_record, update_record, add_note)

Remaining:
- [x] Test `runZohoAgent` on a real conversation (verified: Lead written to Zoho after approval)
- [x] Approval executor (`onPendingActionApproved`): approved pending_action → executes to Zoho
- [x] Backfill: `backfillZoho` pulls last 30d Leads/Contacts/Deals → analytics_events (on connect; verified 31 records)
- [x] Backfill pagination (cursor via `more_records`, batched writes, 25-page cap)
- [x] Analytics page wired to real data (analytics_events + pending_actions)
- [x] Dashboard de-mocked (QuickStats, Statistics, RecentThreads now live via `useEnterpriseId`)
- [ ] Real-time: Notification API webhook (subscribe + scheduled renewal)
- [ ] Move refresh token Firestore → Secret Manager (matches Gmail tech debt)
- [ ] Auto-run `runZohoAgent` on new email ingest (currently manual)
- [ ] Remove temporary debug fns before ship (`pingZoho`, `zohoSearchDebug`, `zohoBackfillDebug`, `runZohoAgentDebug`)

### Odoo — ⚪ 0%  (reuse Zoho framework — near-identical OAuth2 + REST)
### Microsoft 365 — 🟡 30% (connection working)
Done:
- [x] Azure app registration (multi-tenant + personal accounts) + secrets `MS_CLIENT_ID` / `MS_CLIENT_SECRET`
- [x] OAuth connect (`startMicrosoftConnect` → consent → `microsoftOAuthCallback`), Graph `common` authority
- [x] Token store + refresh (rotated refresh token handled); verified via `pingMicrosoft` (read /me)
- [x] Integrations card wired (redirect flow)
Remaining:
- [ ] File generation capability (parked): `save_document`, `create_spreadsheet` (exceljs) → OneDrive/SharePoint
- [ ] Outlook as a channel (mail ingest + send) — optional, reuse email agent
- [ ] Decide save location (OneDrive vs SharePoint) + add Files/Mail scopes (may need admin consent)
- [ ] Move refresh token → Secret Manager (security)
- [ ] Remove temporary `pingMicrosoft` before ship
### Salesforce — ⚪ 0%

## Core platform
- [x] Auth (email + Google) + route protection
- [x] Onboarding (enterprise, subscription wallet, connections, invites, owner role) — incremental/resumable
- [x] `executeAgentAction` gate (mode + tier + subscription) — deployed
- [x] Gemini 3.1 flash-lite wrapper — deployed & verified
- [x] Auto-trigger: `onMessageCreated` runs Gmail + Zoho agents on new inbound message (mode-aware)
- [x] Agent replies sign off with the enterprise name (no placeholder)
- [ ] Ivy (personal agent, coordinates connection agents) — LAST
- [x] `pending_actions` approval flow — `onPendingActionApproved` executes approved actions
- [x] Approvals page (`/approvals`, sidebar) — table view, per-agent logos, status column (rows persist), search + filters
- [x] Agents page — live monitoring from connections + pending_actions (status, counts, last active) + search
- [x] Verified full Supervised loop: email → sync → agent → pending → approve → Lead written to Zoho ✅
- [ ] Mode switcher persisted to Firestore
- [ ] Daily → weekly summaries

## Website analytics
- [x] Tracker script served via `webTag`; snippet generated in the Website integration Connect modal
- [x] `collectWebEvent` public endpoint (CORS, sendBeacon) → writes `web` events to analytics_events
- [x] `registerWebsite` callable generates/returns a site key per enterprise
- [x] Install checker: `verifyWebsiteInstall` fetches the URL, confirms tag present + site live, then activates connection
- [x] Website integration card (Connect → generate snippet + verify); marks Connected
- [x] `/website` page is analytics-only, now with: real-time online, bounce rate, new vs returning, top countries + cities, top pages
- [x] Tag enriched (session id + new-visitor flag); collector does server-side IP geo (country/city, cached)
- [ ] Rate-limit collect endpoint per site/IP (abuse protection) — later
- [ ] Surface `web` channel on the main Analytics page volume chart
- [ ] Search Console integration (SEO: queries, impressions, clicks, position) — reuse Google connection + webmasters scope
- [ ] Website chat agent (lives on the connected website) — later

## Knowledge base
- [x] Settings → Knowledge Base tab (CRUD, live Firestore `knowledge_base`)
- [x] KB injected into Gmail + Zoho agent prompts (facts shape replies)
- [ ] Chunk/embed KB for retrieval when it grows large (currently full dump into prompt)

## Deferred / flagged
- [ ] Firestore security rules (still test mode ⚠️)
- [ ] Invite emails (currently just a doc)
- [ ] Web widget (Intercom-style, text + calls)
- [ ] Node 20 → newer runtime; bump firebase-functions
- [ ] Consider unified API (Nango/Merge) for remaining connections
