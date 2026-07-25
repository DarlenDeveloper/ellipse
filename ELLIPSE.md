# Ellipse

> **White-label deployment:** This instance is branded as **Mercury Computers Ltd** in the UI (logo, wordmark, page titles, chat widget), but the underlying platform, codebase, and backend project are **Ellipse** (Firebase project `ellipse-desk`). Ellipse is the product; Mercury Computers is the customer it's white-labeled for. Branding lives in the frontend only — swapping `public/mercury-logo.png` + the wordmark strings re-brands it for any customer.

## Unified Agentic Communication Hub

**One-liner:** Companies connect all their communication channels and let AI agents manage, prioritize, and act on conversations from a single intelligent inbox.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Auth | Firebase Auth |
| Database | Firestore (multi-tenant) |
| Real-time | Firestore onSnapshot |
| Backend | Firebase Cloud Functions |
| AI | Gemini API |
| Storage | Firebase Storage |
| Hosting | Vercel (frontend) + Firebase (backend) |

---

## Core Features

### 1. Unified Inbox
- Single pane of glass for all conversations across channels
- Cross-channel thread linking
- Smart grouping by customer, urgency, topic, sentiment
- Real-time updates

### 2. Integrations
- Google Workspace (OAuth2 — Gmail, Calendar, Contacts, Drive)
- Microsoft 365 (Outlook, Teams, Calendar, OneDrive)
- WhatsApp Business API
- Salesforce CRM
- Zoho CRM/Mail
- Odoo CRM/Support
- SMTP/IMAP

### 3. Channel Agents (Gemini-powered)
- Per-channel AI agents
- Auto-categorize, summarize, draft replies
- Tone adaptation per channel (formal for email, casual for WhatsApp)
- Human-in-the-loop approval flow

### 4. Web Agents
- Customer-facing chatbot widgets embedded on company websites
- Powered by Gemini, trained on company knowledge base
- Customizable appearance (colors, avatar, position, welcome message)
- Conversation logs fed back into the unified inbox
- Embed via script tag or iframe
- Configurable escalation to human agents

### 5. Ivy (Personal Agent)
- Orchestrates all channel agents + web agents
- Cross-channel decisions (consolidate threads, escalate, follow-up)
- Configurable playbooks and rules
- Reasoning log for transparency

### 6. Personalized Analytics
- Response time per channel/agent/team member
- Sentiment trends
- Customer journey maps
- Agent performance (override rate)
- Custom KPIs per org

---

## 2-Day Sprint Plan

### Day 1 — Core Platform (UI First)

**Morning:**
- Project scaffold (Next.js + Tailwind + shadcn/ui + Firebase)
- Auth pages (sign up, sign in)
- Dashboard layout (sidebar, pages)

**Afternoon:**
- Inbox UI
- Integrations settings UI
- Agent config UI
- Analytics dashboard UI

**Evening:**
- Firebase setup (Auth, Firestore, Functions)
- Google Workspace integration backend
- Message ingestion + real-time sync

### Day 2 — Intelligence + Polish

**Morning:**
- Channel agent (Gemini integration via Cloud Functions)
- Ivy (personal agent) orchestration logic
- Web Agent infrastructure

**Afternoon:**
- WhatsApp + SMTP integrations
- Analytics data pipeline
- Agent playbook configuration

**Evening:**
- Onboarding flow
- Landing page
- Deploy (Vercel + Firebase)

---

## Firestore Schema

```
orgs/{orgId}/
  settings/{doc}
  members/{userId}
  integrations/{integrationId}
  threads/{threadId}/
    messages/{messageId}
  agents/{agentId}
  webAgents/{taskId}
  analytics/{metricId}
```

---

## Agents Architecture

```
┌─────────────────────────────────────┐
│               IVY                   │
│   (Personal Agent — Gemini)         │
├─────────┬─────────┬────────┬────────┤
│ Gmail   │WhatsApp │ SMTP   │  Web   │
│ Agent   │ Agent   │ Agent  │ Agent  │
└─────────┴─────────┴────────┴────────┘
     │          │        │        │
  Gmail API  WA API   IMAP    Browser
```

---

## User Roles (planned model — next milestone)

Lean set + an orthogonal approval flag:

| Role | Permissions |
|------|-------------|
| Owner | Everything — billing/plan, delete org, manage all members (incl. admins), agent mode, quotation branding, owner-only analytics, receives the daily org-users digest |
| Admin | Manage members (not owner), integrations, agents, knowledge base, quotation branding; no billing/delete-org |
| Employee | Inbox, agent chat, create docs/quotations, view own analytics; no settings/member management |
| `can_approve` (flag) | Orthogonal to role — grants approving pending agent actions |

Integration ownership: an employee may use the **owner's shared integrations with permission**, and may **add their own personal integrations freely**. Ivy compiles a **daily per-user activity report for the owner** (summaries from each user's connections). Non-owners can't see other users' activity or the org-wide digest.

*(Old mock Manager/Viewer tiers dropped unless a read-only role is needed.)*

---

## Status

🟢 **Core built & deployed** (pre-production; security pass pending)

**Live:** Unified inbox (Gmail, SMTP, Outlook, WhatsApp) · per-connection agents + triage · Zoho CRM (enrich, write, rich reporting, `list_leads`, `get_zoho_quote`) · Website analytics · **Mercury Store** (custom key-auth API: products/orders/quotations/repairs with search + pagination) · Ivy + direct agent chat (floating bubble + `/ivy` page) · custom agents · document + multi-source report generation (deterministic, saved to Data, mirrored to OneDrive) · owner-only Quote Owner analysis · **quotation/proforma PDF generation** (branded, Settings → Quotation) · **send email with attachments** (gated) · **knowledge-base file upload** (PDF/image text extraction) · approvals flow · Data page.

**Note on this doc:** it's the original vision spec. For the accurate current state and build order, see **`IMPLEMENTATION.md`** (source of truth); Zoho capabilities in **`ZOHO.md`**; live task list in **`TODO.md`**.

**Roadmap:** users & roles (join flow, shared vs personal integrations, daily per-user digest) → security pass (Firestore rules, tokens → Secret Manager, remove debug fns, role enforcement, invite emails) → live Excel append (Graph workbook) → agent memory.

**Reality vs. this spec:** agents are **per-connection + Ivy** (not domain agents); Ivy was built after the connections, not first; wallet = subscription window (no credits). Backend is Firebase Functions; frontend deploys to Vercel.
