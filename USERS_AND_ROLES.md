# Users & Roles — Spec

Plan for letting other employees sign up and work inside an organization. Not built yet — starting later. Source of truth for this milestone; see `IMPLEMENTATION.md` for the overall system.

---

## Goals

1. Invited employees can **sign up and land in the right org** (not create a new one).
2. Employees can use the **owner's shared integrations — only with permission**, and can **add their own personal integrations freely** (no permission needed).
3. Every day, **Ivy generates a per-user "org users report" for the owner** — what each user did + summaries from their connections (e.g. Zoho).
4. **Non-owners can't** see other users' activity or the org-wide digest (owner-only). *(Open question — confirm full restriction list, see below.)*

---

## Role model

Keep it lean: three roles + one orthogonal flag.

| Role | Can do |
|------|--------|
| **Owner** | Everything — plan/billing, delete org, manage all members (incl. admins), agent mode, quotation branding, owner-only analytics, receives the daily org-users digest. |
| **Admin** | Manage members (not the owner), integrations, agents, knowledge base, quotation branding. No billing / delete-org. |
| **Employee** | Inbox, agent chat, create docs/quotations, view own analytics. No settings / member management. |
| `can_approve` (flag) | Orthogonal to role — grants approving pending agent actions in `/approvals`. Any role can hold it. |

Old mock tiers (Manager, Viewer) are **dropped** unless we later need a true read-only role.

### Existing data (already in place)
- `users/{uid}`: `{ email, display_name, enterprise_id, role, can_approve, status, created_at }`. Creator becomes `role: "owner", can_approve: true` at onboarding.
- `invites/{enterpriseId}_{email}`: `{ enterprise_id, email, role, can_approve, status: "pending", created_at }` — written at onboarding Team step, but **never consumed yet** (the gap).
- Onboarding invite roles today: `admin | employee`.
- Owner is already enforced server-side for: agent **mode**, **quotation branding**, **owner analysis**.

---

## Integration ownership (shared vs personal)

Add an ownership dimension to connections.

- **Shared (org) connection** — the owner's integrations. An employee may use one **only if granted permission**.
- **Personal (user) connection** — added by an employee for themselves; scoped to that user; no permission needed to create.

Proposed data:
- On each `connections/{…}` doc: `scope: "org" | "personal"`, `owner_uid` (for personal), and for shared ones a grant list (e.g. `shared_with: [uid]` or a separate `connection_grants` collection `{enterprise_id, connection_id, uid, granted_by}`).
- Agent tool gating (`toolsFor`) must consider which connections the **current caller** may use: org connections they've been granted + their own personal ones. `askAgent` already receives `callerUid` → thread it into the connected-set resolution.

> Note: current `askAgent` builds the connected set from all active org connections regardless of user. This must become **per-user** once personal/shared scoping exists.

---

## Join flow (invited employee → member)

**Phase 1 (build now): email-match auto-link via a secure callable.** No email infra required.

1. Owner/Admin adds an invite (email + role + can_approve) → `invites/{enterpriseId}_{email}` (via `inviteMember`, seat-limited).
2. Invitee signs up / logs in with that email. Post-login landing checks for a pending invite.
3. Callable **`acceptInvite`** (server-side, admin SDK):
   - Verifies a `pending` invite exists for the **authenticated user's own email**.
   - Sets `users/{uid}.enterprise_id/role/can_approve` atomically.
   - Marks the invite `accepted`.
   - Enforces seat limit again at accept time.
4. Landing logic (`getLandingRoute`): if `enterprise_id` is null **but** a pending invite exists → auto-accept (or show a "Join {Org}" screen) instead of sending them to `/onboarding` to create a new org.
5. Also offer a **copyable invite link** for convenience.

**Phase 2 (later): tokened invite emails** — generate a token, email a `/join?token=…` link, deliver via the org's connected email channel (reuse `send_email` infra) or a transactional provider.

Security: linking must be server-side only (callable). Never let the client self-assign `enterprise_id`/`role`. Firestore rules must forbid a user from editing their own `enterprise_id`/`role` directly.

---

## Daily "org users report" (owner-only)

- Scheduled function (reuse the timezone-aware scheduler pattern from `reports.ts`), runs at the org's local midnight.
- For each user in the org: gather their activity (agent chats, actions executed/approved, docs/quotations created, replies sent) + summaries from **their** connections (e.g. their Zoho figures).
- Ivy composes a per-user digest; the owner gets the org-wide roll-up. Store under something like `user_reports/` or `reports/` with a user dimension.
- Delivered to the owner (in-app Data page card and/or email). Non-owners don't see it.

---

## Member-management callables (all role-checked)

- `inviteMember(enterpriseId, email, role, canApprove)` — owner/admin; seat-limited (Starter 1 / Business 5 / Enterprise ∞, counting active members + pending invites); only owner can invite/assign **admin**.
- `updateMemberRole(uid, role)` — owner/admin; can't change the owner; only owner manages admins.
- `setCanApprove(uid, value)` — owner/admin.
- `removeMember(uid)` — owner/admin; unlink (`enterprise_id: null` / `status: "disabled"`); can't remove owner.
- `revokeInvite(enterpriseId, email)` — owner/admin; delete the invite doc.
- `grantConnection(uid, connectionId)` / `revokeConnection(...)` — owner/admin; manage access to shared integrations.

Every one re-checks the caller's role server-side (like `saveQuotationBranding` already does).

---

## Frontend work

- **Rebuild `/users` page on real data** (currently 100% mocked): list `users where enterprise_id == X` + pending `invites where enterprise_id == X and status == pending`; show role, can_approve, status. Actions (invite, change role, toggle approve, remove, revoke, copy link) gated by the viewer's role.
- **Join screen / landing** wiring for `acceptInvite`.
- **Integrations page**: show shared vs personal; "request/use owner's" vs "add your own"; admins manage grants.
- **Permission gating**: hide/disable settings, integrations management, and member management for employees. (UI gating for UX; callables + Firestore rules are the real enforcement.)

---

## Build order / progress

1. ✅ `acceptInvite` callable + landing wiring (invited users join the right org via login/signup/Google). **Done + deployed.**
2. ✅ Member-management callables (`inviteMember`, `updateMemberRole`, `setMemberCanApprove`, `removeMember`, `revokeInvite`) — role-checked + seat-limited. **Done + deployed.**
3. ✅ Users page rebuilt on real data (members + pending invites), actions gated by viewer role. **Done.**
4. 🟡 Shared-integration access — **request/approve + per-user gating done + deployed** (`access.ts`: `requestSharedAccess`/`respondAccessRequest`/`revokeSharedAccess`; `askAgent` filters connections per user). Requests are exact selections. Approval makes the existing company connection immediately usable. **Personal Google Workspace and personal Zoho are implemented** with owner-scoped OAuth state, connections/secrets, tool execution, approval continuity and personal disconnect. Microsoft 365 and credential/API personal connectors still require the same adaptation.
5. ✅ Daily owner-only team digest (`orgUsers.ts` → `generateOrgUsersReport`, hooked into `scheduledReports` + `generateReportsNow`): per-member chats/messages/agents/topics (from `ivy_chats`), personal integrations, shared-access status, + org connection snapshot; Ivy writes a grounded narrative + Word/Excel. Stored `owner_only:true`; **Data page shows it to the owner only.** **Done + deployed.**
6. ✅ Frontend permission gating — Integrations page is view-only for non-admins (connect/disconnect/update blocked, with a pointer to request access on Team); settings mode + quotation branding already owner-gated. **Done.**

**Milestone complete.** (Deferred: personal per-user OAuth connect pipeline; tokened invite emails — both in the security pass.)

### Confirmed rule (from the client)
- **Shared integrations** (owner's connections): an employee may use them **only when the owner or an admin approves their request** — and access is **per connection type** (e.g. grant WhatsApp only), not all-or-nothing.
- **Additional integrations a user adds** are always allowed for that user, and are **logged and rolled into the owner's end-of-day summary**.

### Access model (implemented)
- `connection_grants/{enterpriseId}_{uid}.types: string[]` — the specific shared connection types a member may use. Owner/admin implicitly get all.
- `access_requests/{enterpriseId}_{uid}` — carries the requested `types`; owner/admin approve (grants those types) or deny. `setConnectionGrants` lets a manager set the exact set directly.
- Backend gating: `allowedConnectionTypes` (in `access.ts`) → agent tools per user = granted shared types + own personal connections.
- **Frontend data scoping** via `useAccess()` hook: Inbox, Dashboard (QuickStats/Statistics/RecentThreads/PendingApprovals), Approvals, Website, Data, Analytics and Agents filter to the member's grants. Integrations labels an employee grant **Access approved / Company access approved**, never “personally connected,” and employees cannot disconnect the owner’s integration.
- Organization action counts are not reliable per-user attribution yet; employees must not see org-wide totals presented as their own. Proper attribution belongs in the organization audit-log model.

### ⚠️ Remaining access hardening
Firestore tenant rules are deployed and deny unknown collections by default. Task reads are assignee/creator-or-manager; personal calendar reads are owner-only. Per-connection filtering for Inbox/analytics within the same organization is still app-layer (`useAccess`), because the current document/query shape does not let rules authorize grant arrays cleanly. That boundary still needs query/data-model hardening before production.

---

## Open questions (confirm before/at build)

1. **What exactly are employees blocked from?** (The described sentence "the org users can't ___" was cut off.) Assumed: can't see other users' activity/reports or the org-wide digest, and can't manage settings/integrations/members. Confirm whether they also can't see org-wide analytics / other users' inbox threads.
2. Should shared-integration access be **per-connection** grants or a single "can use org integrations" toggle per user?
3. Daily digest delivery: in-app only, or also email to the owner?
4. Do we need a read-only **Viewer** role after all?
5. Personal integrations for employees — allowed on all tiers, or Business+ only (seat/tier implications)?
