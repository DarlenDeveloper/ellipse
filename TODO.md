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
- [ ] Gmail agent: read → analyze (Gemini) → suggest (Supervised) / act (Unsupervised)
- [ ] Send / reply from within the inbox (`messages.send`)
- [ ] Real-time ingestion (`users.watch` + Pub/Sub) instead of manual sync
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

Remaining (the 50%):
- [x] Verified connect end-to-end (read 46 modules via `pingZoho`)
- [ ] Test Supervised `create_record` through the gate
- [ ] Register Zoho actions as Gemini function declarations (Zoho agent)
- [ ] Read/enrich: look up inbound contacts in Zoho to add CRM context to conversations
- [ ] Real-time: Notification API webhook (subscribe + scheduled renewal)
- [ ] Move refresh token Firestore → Secret Manager (matches Gmail tech debt)

### Odoo — ⚪ 0%  (reuse Zoho framework — near-identical OAuth2 + REST)
### Microsoft 365 — ⚪ 0%
### Salesforce — ⚪ 0%
### SMTP / IMAP — ⚪ 0%

## Core platform
- [x] Auth (email + Google) + route protection
- [x] Onboarding (enterprise, subscription wallet, connections, invites, owner role) — incremental/resumable
- [x] `executeAgentAction` gate (mode + tier + subscription) — deployed
- [x] Gemini 3.1 flash-lite wrapper — deployed & verified
- [ ] Boss / Personal agent (coordinates connection agents) — LAST
- [ ] `pending_actions` approval flow (test Supervised)
- [ ] Mode switcher persisted to Firestore
- [ ] Daily → weekly summaries

## Deferred / flagged
- [ ] Firestore security rules (still test mode ⚠️)
- [ ] Invite emails (currently just a doc)
- [ ] Web widget (Intercom-style, text + calls)
- [ ] Node 20 → newer runtime; bump firebase-functions
- [ ] Consider unified API (Nango/Merge) for remaining connections
