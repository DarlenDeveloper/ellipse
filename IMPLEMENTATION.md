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

### Done
- Frontend UI (all pages)
- Firebase Auth (email + Google) + route protection
- Onboarding backend — incremental & resumable (enterprise, subscription/wallet, connections, invites, owner role)
- Login routing by onboarding status
- `executeAgentAction` gate — mode + tier + **subscription** check (credit logic removed)

### Next
- Gemini wrapper (model TBD — confirm exact id)
- First connection agent end-to-end

## Deferred / flagged
- Functions deploy (Blaze enabled ✅)
- Firestore **security rules** still test mode ⚠️
- Mode switcher not persisted to Firestore
- Invite **emails** not sent — just an `invites/{id}` doc for now
- Per-agent / per-connection modes (workspace-wide only for now)
- Web widget

## Corrections to `ellipse-desk-architecture.md` (AI-drafted, partly wrong)
- Agents are **per-connection + Ivy (personal agent)**, NOT domain agents (Inbox/Assistant/Calendar).
- Personal Assistant = **Ivy**, built **last** (doc said build it first).
- Wallet is **subscription dates only**, NOT a credit balance debited by token usage.
