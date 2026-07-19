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
- [ ] Test `runZohoAgent` on a real conversation (Supervised → check `pending_actions`)
- [x] Approval executor (`onPendingActionApproved`): approved pending_action → executes to Zoho
- [ ] Real-time: Notification API webhook (subscribe + scheduled renewal)
- [ ] Move refresh token Firestore → Secret Manager (matches Gmail tech debt)
- [ ] Remove temporary `pingZoho` debug function before ship

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
- [x] `pending_actions` approval flow — `onPendingActionApproved` executes approved actions
- [x] Approvals page (`/approvals`, sidebar) — full detail + Approve/Reject; dashboard card shows count + links to it
- [ ] Mode switcher persisted to Firestore
- [ ] Daily → weekly summaries

## Deferred / flagged
- [ ] Firestore security rules (still test mode ⚠️)
- [ ] Invite emails (currently just a doc)
- [ ] Web widget (Intercom-style, text + calls)
- [ ] Node 20 → newer runtime; bump firebase-functions
- [ ] Consider unified API (Nango/Merge) for remaining connections
