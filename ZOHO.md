# Zoho CRM — Connection Capabilities & Notes

Reference for what the Ellipse ↔ Zoho CRM connection can access, and how we use it.
Source: Zoho CRM V8 API docs (https://www.zoho.com/crm/developer/docs/api/v8/).

---

## Current state (what we hold today)

**OAuth scopes granted now:**
- `ZohoCRM.modules.ALL` — read/write all module records
- `ZohoCRM.settings.ALL` — metadata (modules, fields, layouts, picklists)
- `ZohoCRM.notifications.ALL` — real-time change webhooks (not wired yet)

**Missing scopes** (cause of limitations we've hit):
- `ZohoCRM.coql.READ` — COQL failed earlier because of this → we switched to the records API
- `ZohoCRM.bulk.READ` / `.ALL` — no large async exports
- `ZohoCRM.users.READ` / `.ALL` — no users/roles/profiles
- `ZohoCRM.org.READ` — no org info
- `ZohoFiles.files.READ` / `.ALL` — no attachment upload/download

**What we actually use in code today:**
- Records API read (Leads/Contacts/Deals) with `fields`, `sort_by=Created_Time`, `per_page`, in-memory window filter
- `createRecord` / `updateRecord` / `addNote` (write, gated through approvals)
- `searchByEmail` (enrichment), `enrichFromZoho` (Contact/Lead + related Deals)
- `getSalesSummary`, `getOpenPipeline`, `getRecordsCreated`, `getLeadsCreated`, `getCrmReportData`
- `backfillZoho` (30d Leads/Contacts/Deals → analytics_events)
- Token: DC-aware, refresh-on-expiry, stored in Firestore (security debt)

---

## Full capability surface (V8 API)

Access is governed by OAuth scopes. Categories: `modules`, `settings`, `users`, `org`, `bulk`, `notifications`, `coql`, `ZohoFiles.files`.

### 1. Records (Core CRUD) — `ZohoCRM.modules.*`
Full read/create/update/delete on every module:
- Standard: **Leads, Contacts, Accounts, Deals, Campaigns, Cases, Solutions, Products, Vendors, Quotes, Sales Orders, Purchase Orders, Invoices, Price Books**
- Activities: **Tasks, Calls, Meetings/Events, Notes, Attachments**
- Any **custom modules**
- Supports: field selection (`fields=`), sorting, pagination, search by criteria/email/phone, get by external ID, subforms

### 2. Metadata — `ZohoCRM.settings.*`
- List modules; per-module **fields**, layouts, custom views, related lists
- **Picklist values** (display value, actual value, color, id)
- Lets us build reports/forms dynamically for each org's custom setup

### 3. Query / COQL — `ZohoCRM.coql.READ`
- SQL-like SELECT across modules (`select ... from Module where ... limit ...`)
- NOT granted yet → don't use until scope added

### 4. Bulk APIs — `ZohoCRM.bulk.*`
- Async read/write of large datasets (full historical exports)

### 5. Related records & counts — `ZohoCRM.modules.*`
- Related lists (Contact→Deals, Account→Deals), counts
- Cross-app related lists: Desk, Projects, Invoices, Subscriptions, Visits, Expenses

### 6. Notifications (webhooks) — `ZohoCRM.notifications.*`
- Real-time push on record create/update/delete (subscribe + scheduled renewal)
- This is how we'd get INSTANT lead alerts instead of 5-min polling

### 7. Users & Org — `ZohoCRM.users.*`, `ZohoCRM.org.*`
- Team members, roles, profiles, org info (deal-owner / rep attribution)

### 8. Files — `ZohoFiles.files.*`
- Attach/download files on records

### 9. Composite API — `ZohoCRM.modules.*`
- Combine up to 5 API calls in one request (efficiency)

---

## Recommended next steps to "nail it"

1. **Broaden connect scopes** to: `modules.ALL, settings.ALL, notifications.ALL, coql.READ, bulk.READ, users.READ, org.READ, ZohoFiles.files.READ` (requires user reconnect to grant).
2. **Real-time lead notifications** — wire the Notifications API (subscribe + renew) → instant lead capture, no polling.
3. **Metadata-driven reports** — use fields/picklist metadata so reports adapt to each org's custom fields.
4. **Deal owner / rep attribution** — via users scope, for per-rep performance in reports.

---

## Reporting features built on Zoho (live)

## Official quotation documents (live code; activation required)

- Ellipse no longer needs to manually recreate the official Zoho quotation file. The compound workflow creates a real `Quotes` record and calls Zoho CRM `download_mail_merge` to receive the official PDF bytes.
- Customer chain: Lead (prospect capture) plus Account and Contact (required Quote lookups). Product lines must resolve to exact Zoho `Products` records; ambiguity or missing price stops the workflow instead of guessing.
- The PDF is saved to Ellipse Data with Quote/customer/template/workflow provenance and SHA-256, then the same saved document can be attached to Gmail, SMTP or Outlook replies.
- Required OAuth scopes now include `ZohoCRM.settings.mailmerge.CREATE`, `ZohoWriter.documentEditor.ALL`, and `ZohoWriter.merge.ALL`. Existing Zoho installations must reconnect to grant them.
- Owner setup: create/confirm a Quotes mail-merge template, then enter its exact name under Settings → Quotation → Zoho quotation document.
- Outlook reply attachments above 3 MB still require a Microsoft Graph upload-session enhancement.

### Field mapping — client's detailed report columns → Quotes module API names
Verified from the org's live metadata (`settings/fields?module=Quotes`):

| Client column | Zoho API field | Notes |
|---|---|---|
| Subject | `Subject` | text |
| Account Name | `Account_Name` | lookup → `.name` |
| Proforma No. | `Prof_NO` | **custom** autonumber (per-org name; discover via metadata) |
| Quote Date | `Quote_Date` | date |
| Quote Owner | `Owner` | ownerlookup → `.name` (the employee who made the quote) |
| Deal Name | `Deal_Name` | lookup → `.name` |
| Quote Stage | `Quote_Stage` | picklist |
| Sub Total | `Sub_Total` | formula |

### Tools (all deterministic — numbers copied from Zoho into cells, never AI-authored)
- `getSalesSummary` / `getOpenPipeline` — new leads/contacts/deals, deals won, revenue, + current open pipeline (count + value, cursor-paginated).
- `getRecordsCreated` — window-scoped records, cursor pagination + early stop.
- `getQuotesDetailed` — the 8 client columns above.
- `getCrmReportData` — bundles counts + leads + deals + contacts for a window.
- `generate_report` (agent tool) — one Excel per connected source; Zoho = summary/detailed/both. **Detailed is the default** (Summary + Leads + Deals + Contacts + Quotes line-items; workbook opens on the Quotes tab).
- `generate_owner_analysis` (agent tool, **OWNER-ONLY**) — groups quotes by Quote Owner: count, total & avg sub-total, won count. Gated to `users/{uid}.role === "owner"` (tool not even offered to others + handler re-checks).
- `listModuleFields` — metadata-driven field discovery (used to find custom fields like Prof_NO).
- `getLeadsList` / `list_leads` (agent tool) — real lead rows (Full_Name, Company, Email, Phone, Lead_Status, Owner, Lead_Source, Created_Time), newest-first. **No forced window** by default (the Leads module may have only old entries); pass `days` to restrict to a period. Fixes agents guessing/flip-flopping lead lists from the aggregate summary. `get_sales_summary` also carries `recent_leads` (newest 10, window-independent) for "do we have any leads?".
- `getQuoteForQuotation` / `get_zoho_quote` (agent tool) — fetch one Quote (by proforma no / subject / account) INCLUDING line items, to build a branded proforma via `create_quotation`.

### Quotes line items (verified from live data)
- Subform field is **`Quoted_Items`** (this org), fallback `Product_Details`. Per-line fields: **`Product_Name`** (lookup → `.name`), **`List_Price`** (unit rate), **`Quantity`**, `Description`, `Discount`, `Net_Total`, `Total`, `Total_After_Discount`. Fetch via `GET Quotes/{id}` (the records list doesn't return the subform).

## Gotchas / lessons learned
- **Pagination caps at 2000 records with `page`/`per_page`.** For >2000 you MUST use `page_token` (cursor). The token is BOUND to the first call's params — resend the exact same `fields`, `sort_by`, `sort_order`, `per_page` and just append `&page_token=<next_page_token>`; never mix with `page`; don't URL-encode/alter the token. Errors seen: `DISCRETE_PAGINATION_LIMIT_EXCEEDED`, `TOKEN_BOUND_DATA_MISMATCH`, `REQUIRED_PARAM_MISSING`. Max 100,000 records via page_token; token valid 24h.
- **`getOpenPipeline` bug (fixed):** this org has 2600+ deals; the old single-page fetch errored past 2000 and silently returned 0 open deals. Now cursor-paginates all deals.
- **COQL needs its own `coql.READ` scope** — `modules.ALL` is NOT enough. Failed silently before (returned empty) → now surfaces errors + we use records API instead.
- **`fields=id` is invalid** in the records API `fields` param (id is implicit) → always request a real field, and **always include `Created_Time`** when filtering by a date window (we forgot this once → counts were always 0).
- **Records API vs COQL**: records API (`/{module}?fields=...&sort_by=Created_Time`) works under `modules.ALL` — prefer it until coql scope is added.
- **Never let the AI author report figures** — build report files (Excel) in code from raw Zoho rows to guarantee no hallucination. `generate_crm_report` does this.
- Endpoint base: `{api_domain}/crm/v8/...`; DC-specific `api_domain` captured at connect.
