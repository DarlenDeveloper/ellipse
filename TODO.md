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
### Zoho CRM — ⚪ 0%
### Odoo — ⚪ 0%
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
