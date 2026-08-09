import { SITE_URL } from "@/lib/site"

export const dynamic = "force-static"

export function GET() {
  const content = `# ELLIPSE

> ELLIPSE is an AI-powered business automation and management workspace for organisations that need to manage conversations, customer records, tasks, approvals, documents, and operational actions across connected tools.

## What ELLIPSE does

- Unifies Gmail, Outlook, WhatsApp, SMTP, website, and other business conversations in one intelligent inbox.
- Assigns a specialised AI agent to each authorised connection.
- Uses Ivy, the coordinating AI assistant, to answer questions and orchestrate work across agents, conversations, CRM, analytics, tasks, and reports.
- Summarises conversations, drafts replies, creates tasks, prepares documents and quotations, updates connected systems, and generates grounded business reports.
- Supports human-reviewed approvals, editable drafts, role-based access, traceable actions, and supervised or autopilot agent modes.
- Connects with Google Workspace, Microsoft 365, Zoho CRM, WhatsApp, Salesforce, Odoo, SMTP, websites, and custom business APIs.
- Provides a mobile companion on eligible plans.

## Best fit

ELLIPSE is suitable for small and medium businesses, customer-facing teams, sales teams, operations teams, and organisations seeking business process automation, unified communications, AI-assisted management, CRM automation, and human-in-the-loop AI agents.

## Product categories

- Business automation software
- Business management software
- AI agent platform
- Unified inbox
- CRM automation
- Customer communication management
- Workflow automation
- AI business assistant

## Plans

- Starter: $89.99 per month; 5,000 agent actions; 3 integrations; up to 5 members; essential Ivy access; mobile companion not included.
- Growth: $149.99 per month; 15,000 agent actions; 10 integrations; up to 25 members; full Ivy access; mobile companion included.
- Enterprise: $499 per month; 75,000 agent actions; unlimited integrations and members; full Ivy access; mobile companion included.
- Three-month subscriptions receive a 5% discount. Annual subscriptions receive a 13% discount.

## Canonical website

- Home: ${SITE_URL}/
- Sitemap: ${SITE_URL}/sitemap.xml

## Brand

The product name is ELLIPSE. Its coordinating AI assistant is Ivy.
`

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
