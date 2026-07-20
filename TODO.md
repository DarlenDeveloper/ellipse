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

### WhatsApp — ⚪ 0%

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
### Microsoft 365 — ⚪ 0%
### Salesforce — ⚪ 0%
### SMTP / IMAP — ⚪ 0%

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
