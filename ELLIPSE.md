# Ellipse

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

### 2. Connectors
- Gmail (OAuth2)
- SMTP/IMAP
- WhatsApp Business API
- Zoho CRM/Mail
- Odoo CRM/Support

### 3. Channel Agents (Gemini-powered)
- Per-channel AI agents
- Auto-categorize, summarize, draft replies
- Tone adaptation per channel (formal for email, casual for WhatsApp)
- Human-in-the-loop approval flow

### 4. Web Agents
- Autonomous browser agents that can perform web tasks on behalf of the user
- Research, scrape, fill forms, monitor pages
- Triggered by Boss Agent or manually
- Report findings back into the inbox/thread

### 5. Boss Agent
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
- Connector settings UI
- Agent config UI
- Analytics dashboard UI

**Evening:**
- Firebase setup (Auth, Firestore, Functions)
- Gmail connector backend
- Message ingestion + real-time sync

### Day 2 — Intelligence + Polish

**Morning:**
- Channel agent (Gemini integration via Cloud Functions)
- Boss Agent orchestration logic
- Web Agent infrastructure

**Afternoon:**
- WhatsApp + SMTP connectors
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
  connectors/{connectorId}
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
│            BOSS AGENT               │
│   (Orchestrator — Gemini)           │
├─────────┬─────────┬────────┬────────┤
│ Gmail   │WhatsApp │ SMTP   │  Web   │
│ Agent   │ Agent   │ Agent  │ Agent  │
└─────────┴─────────┴────────┴────────┘
     │          │        │        │
  Gmail API  WA API   IMAP    Browser
```

---

## User Roles

| Role | Permissions |
|------|-------------|
| Owner | Full access, billing, delete org |
| Admin | Manage members, connectors, agents, settings |
| Manager | View analytics, manage threads, approve agent actions |
| Agent/Member | Use inbox, respond to messages, view assigned threads |
| Viewer | Read-only access to inbox and analytics |

---

## Status

🟡 In Development
