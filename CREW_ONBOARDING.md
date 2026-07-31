# Ellipse Crew Onboarding — Office Pilot

Use this checklist for the first controlled Mercury Computers staff rollout. This is a pilot, not a public launch.

## Before anyone signs in

- Add `crm.mercurycomputerslimited.com` in Firebase Console → Authentication → Settings → Authorized domains.
- Confirm Google is enabled under Authentication → Sign-in method.
- Open `https://crm.mercurycomputerslimited.com/login` in a private window and complete one Google sign-in.
- Confirm the latest frontend is deployed; localhost changes do not reach the CRM domain automatically.
- Reconnect Zoho so the new Writer/mail-merge scopes are granted.
- In Settings → Quotation, enter the exact Zoho Quotes mail-merge template name.
- Keep workspace mode **Supervised** during onboarding.
- Ask each employee to open Settings → Notifications and click **Enable push**. Browser permission must be granted by the employee; the organization cannot grant it remotely.

## Add the crew

1. Owner invites each real work email from Users.
2. Assign `employee` by default. Use `admin` only for people who manage members/integrations/settings.
3. Grant `can_approve` separately and only where needed.
4. The invitee signs in with the invited email so `acceptInvite` links the correct organization.
5. Verify the member appears under Mercury’s Team Members before granting integrations.

## Shared integration access

- Employees request only the company connections they need.
- Owner/admin reviews the exact list and approves or denies it.
- Approval means immediate use of the existing company connection; there is no second “add” step.
- A shared grant does not make the connection personal and does not let the employee disconnect it.
- Remove unwanted grants from Users → Manage access.
- Employees can connect personal Google Workspace and Zoho accounts. They are stored separately from company credentials and only that employee may use/disconnect them.
- Personal Google Workspace and Zoho credentials are live. Personal Microsoft 365 and password/API connectors are still rolling out; do not promise those yet.

## Notifications and push test

1. Sign in as an employee and enable browser push from Settings → Notifications.
2. Keep the employee signed in, then minimize or close the CRM tab.
3. Trigger one controlled event: send a new test email, create a pending agent action, or submit an integration-access request.
4. Confirm the operating-system notification appears and opens the correct Inbox, Approvals, Users, or Integrations page.
5. Reopen the app and confirm the bell shows the same notification and unread count.
6. Use **Mark all read**, refresh, and confirm the read state persists.

Push notes:

- Chrome, Edge and supported desktop/Android browsers work after permission is granted.
- On iPhone/iPad, install the CRM to the Home Screen first; web push is unavailable from a normal browser tab.
- If permission was denied, the employee must re-enable notifications in browser/site settings. The application cannot override a browser denial.
- Every browser/profile/device has its own token, so enable push separately on each device.
- Production push requires the latest frontend deployment because the service worker and web manifest are frontend files.

## Incoming attachment test

1. Send a brand-new email containing a safe PDF or image to Gmail, Outlook and/or the connected IMAP mailbox.
2. Run sync or wait for the scheduled five-minute sync.
3. Confirm the Inbox message shows a downloadable attachment card.
4. Confirm Data contains the corresponding `email_attachment` document with source/provenance metadata.
5. Ask Ivy about the selected conversation and confirm the attachment name/type/document reference is present in its context.

Inbound limits are 10 files, 10 MB per file and 25 MB total per email. Executables and unsafe MIME types are skipped. Emails ingested before this feature was deployed are not automatically backfilled; test with a new message.

## Five-minute permission test per employee

- Without a grant: the connection agent is absent and Ivy refuses that source.
- With one grant: only that connection’s agent/data/tools become available.
- Agents must not show organization action totals as the employee’s work.
- Ivy must refuse reports for ungranted sources.
- Employee cannot manage company integrations, roles or settings.
- Employee with `can_approve=false` cannot approve actions.

## Quotation smoke test

1. Use a test customer and an exact Zoho Product name/SKU with a valid unit price.
2. Ask Ivy to create the Zoho quotation.
3. Review and approve the compound action.
4. Confirm Lead/Account/Contact and Quote in Zoho.
5. Confirm the official PDF appears in Ellipse Data.
6. Send the saved PDF to a test inbox and verify the exact attachment opens.

## Known limitations to state clearly

- Organization audit logs are not built yet; this is the next launch-priority feature.
- Some within-organization per-connection reads are still enforced in the application layer and need server-side hardening before public launch.
- Personal Google Workspace and Zoho are live in the backend; other personal providers remain deferred.
- Outlook reply attachments above 3 MB are not supported yet.
- Browser push depends on employee permission and browser/platform support; it is not SMS and does not bypass Focus/Do Not Disturb settings.
- Firebase Functions Node.js 20 must be upgraded before October 30, 2026.
- Existing debug functions must be removed before public launch.

## If something goes wrong

- Google error mentioning `unauthorized-domain`: verify Firebase Authorized Domains.
- Employee sees the wrong source: revoke grants, hard refresh, sign out/in, and record the account/source/time for investigation.
- Zoho PDF merge fails: verify reconnect/scopes, template name and exact Product records/prices.
- Keep screenshots, affected user email, timestamp and requested action. Until org audit logs exist, these details are essential for diagnosis.
- Push missing: confirm Settings says enabled, browser site permission is Allow, the latest frontend is deployed, and test outside the active CRM tab.
- Attachment missing: confirm it is a new email, within size/count limits, non-executable, and that the relevant mailbox sync completed.
