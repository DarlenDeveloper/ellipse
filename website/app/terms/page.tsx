import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms and Conditions | ELLIPSE",
  description: "Terms governing access to and use of the ELLIPSE business automation and AI agent platform.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions" summary="These Terms govern your access to and use of ELLIPSE, including Ivy, connection-specific agents, the web dashboard, mobile companion, integrations, APIs, support, and related services.">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/[0.05]">
        <strong className="text-black">Important:</strong> ELLIPSE is a business tool that can prepare and, where authorised, execute actions in connected systems. You remain responsible for configuring permissions, reviewing outputs, supervising users and agents, and confirming that actions are appropriate for your organisation.
      </div>

      <LegalSection n="1" title="Agreement and contracting party">
        <p>These Terms and Conditions (“Terms”) form a binding agreement between the person or organisation using ELLIPSE (“Customer”, “you” or “your”) and the operator identified on the applicable order form, invoice, subscription page, or written agreement (“ELLIPSE”, “we”, “us” or “our”). If you accept these Terms for an organisation, you represent that you have authority to bind it.</p>
        <p>By creating an account, accepting an invitation, purchasing a subscription, or accessing the Services, you agree to these Terms and the Privacy Policy. If a signed agreement or order form conflicts with these Terms, the signed agreement or order form controls to the extent of that conflict.</p>
      </LegalSection>

      <LegalSection n="2" title="The Services">
        <p>ELLIPSE provides a multi-tenant business automation and communication workspace. Features may include a unified inbox; Gmail, Microsoft 365, WhatsApp, SMTP, CRM, website and custom API integrations; Ivy and connection-specific AI agents; task, calendar, document, quotation, reporting and analytics tools; approval workflows; notifications; team chat; a mobile companion; and related support.</p>
        <p>We may improve, replace, add, or discontinue features. We will use commercially reasonable efforts to give advance notice of a material reduction to paid core functionality where practicable. Beta, preview, pilot, or experimental features are provided as-is and may change or end without notice.</p>
      </LegalSection>

      <LegalSection n="3" title="Eligibility, accounts and organisations">
        <p>You must be at least 18 years old and legally capable of entering a contract. You must provide accurate information, keep it current, protect credentials and devices, and promptly notify us of suspected unauthorised access. Accounts are personal and may not be shared.</p>
        <p>An organisation owner or administrator may invite users, assign roles, grant integration access, designate approvers, and control organisation data. Your organisation is responsible for its users, configuration, lawful instructions, connected accounts, and activity performed through its workspace.</p>
      </LegalSection>

      <LegalSection n="4" title="Plans, usage and billing">
        <p>Plans may be measured by agent actions, integrations, organisation size, Ivy access, mobile access, storage, or other limits shown at purchase. An “agent action” may include a model-assisted analysis, tool call, generated artefact, proposed action, execution, or other metered operation stated in the plan description.</p>
        <p>Subscription fees are billed in advance and exclude applicable taxes unless stated otherwise. Three-month and annual discounts apply only to the corresponding prepaid commitment. Renewals occur for the same term unless cancelled before the renewal date. Fees are non-refundable except where required by law, expressly stated in an order form, or caused by our billing error.</p>
        <p>If usage exceeds a plan limit, we may request an upgrade, restrict further metered actions, or charge agreed overage fees. We will not silently impose an unlisted overage charge. We may change future pricing with reasonable prior notice; changes apply no earlier than the next renewal unless you agree otherwise.</p>
      </LegalSection>

      <LegalSection n="5" title="Customer data and instructions">
        <p>“Customer Data” means information submitted, connected, generated, stored, or transmitted by you or your users through the Services, including messages, attachments, contacts, CRM records, prompts, instructions, knowledge files, reports and agent outputs. As between the parties, you retain your rights in Customer Data.</p>
        <p>You grant us a limited, non-exclusive right to host, copy, transmit, transform, display and otherwise process Customer Data solely to provide, secure, support and improve the Services, comply with law, and follow your documented instructions. You represent that you have all notices, permissions and lawful bases required to provide Customer Data and permit that processing.</p>
      </LegalSection>

      <LegalSection n="6" title="Connected services">
        <p>Integrations are governed by the third party’s own terms and privacy practices. You authorise ELLIPSE to access and act within connected services using the permissions you grant. You are responsible for selecting appropriate scopes, maintaining third-party accounts, and ensuring your use complies with provider rules.</p>
        <p>Third-party availability, API changes, rate limits, account suspensions or policy changes may affect features. We are not responsible for third-party services, but we will take reasonable steps to handle credentials securely and to communicate material integration failures.</p>
      </LegalSection>

      <LegalSection n="7" title="AI agents, Ivy and human oversight">
        <p>AI outputs may be incomplete, inaccurate, outdated, offensive, or unsuitable. Similar inputs may produce different outputs. You must independently verify material facts, calculations, legal or financial implications, recipients, attachments, quotations, CRM changes and external communications before relying on them.</p>
        <p>ELLIPSE may support Off, Supervised and Autopilot modes. Supervised mode can queue actions for review, but no technical control eliminates every risk. Autopilot should be enabled only after testing, applying least-privilege permissions, defining limits and monitoring outcomes. You are responsible for agent settings and authorised executions.</p>
        <p>The Services are not a substitute for professional legal, medical, accounting, employment, security, procurement or financial advice, and must not be used as the sole basis for decisions producing legal or similarly significant effects on individuals.</p>
      </LegalSection>

      <LegalSection n="8" title="Acceptable use">
        <p>You must not use the Services to violate law or third-party rights; send spam or deceptive communications; impersonate others; facilitate fraud, harassment or discrimination; distribute malware; bypass security or usage controls; scrape or probe systems without permission; expose credentials; process unlawfully obtained data; generate prohibited content; or use agents in high-risk contexts without appropriate qualified human review.</p>
        <p>You must not reverse engineer the Services except where law expressly permits it, resell or sublicense access without written permission, benchmark for a competing product without consent, overload infrastructure, or use outputs to train a competing model or service in breach of applicable rights.</p>
      </LegalSection>

      <LegalSection n="9" title="Security and administration">
        <p>We use reasonable technical and organisational safeguards appropriate to the nature of the Services. No system is completely secure. You must apply least privilege, promptly remove departed users, review integration grants, maintain secure endpoints, and avoid submitting unnecessary sensitive data.</p>
        <p>We may suspend access where reasonably necessary to address a security threat, unlawful activity, material breach, non-payment, provider restriction, or risk to the Services or others. Where practicable, we will limit the suspension and notify you.</p>
      </LegalSection>

      <LegalSection n="10" title="Confidentiality">
        <p>Each party may receive non-public information that a reasonable person would understand to be confidential. The receiving party will use it only for the agreement, protect it with reasonable care, and disclose it only to personnel and providers who need it and are bound by confidentiality duties. These duties do not apply to information independently developed, lawfully received without restriction, publicly available without breach, or required to be disclosed by law.</p>
      </LegalSection>

      <LegalSection n="11" title="Intellectual property and feedback">
        <p>ELLIPSE and its licensors retain all rights in the Services, software, designs, documentation, models, workflows, trademarks and improvements, excluding Customer Data. Subject to payment and these Terms, we grant you a limited, revocable, non-exclusive, non-transferable right to use the Services during the subscription term for internal business purposes.</p>
        <p>You may provide feedback voluntarily. You grant us a perpetual, worldwide, royalty-free right to use feedback without identifying you or disclosing your confidential information.</p>
      </LegalSection>

      <LegalSection n="12" title="Privacy and data protection">
        <p>Our Privacy Policy explains how we handle account, website and service data. Where ELLIPSE processes personal data contained in Customer Data on behalf of an organisation, the organisation generally acts as controller and ELLIPSE as processor or service provider. Additional data-processing terms may apply by written agreement.</p>
        <p>You are responsible for notices to employees, customers and other individuals whose data you connect; responding to requests concerning Customer Data; and ensuring lawful cross-border transfers and use of communications or monitoring features.</p>
      </LegalSection>

      <LegalSection n="13" title="Availability, support and changes">
        <p>Unless a service-level agreement states otherwise, the Services are provided on a commercially reasonable efforts basis without a guaranteed uptime or response time. Maintenance, emergencies, internet failures, third-party outages and force-majeure events may interrupt access. Support channels and response targets depend on your plan.</p>
      </LegalSection>

      <LegalSection n="14" title="Disclaimers">
        <p>To the maximum extent permitted by law, the Services and all AI outputs are provided “as is” and “as available”. We disclaim implied warranties of merchantability, satisfactory quality, fitness for a particular purpose, non-infringement, uninterrupted operation and error-free results. We do not warrant that an output is accurate or that the Services will meet every requirement. Nothing in these Terms excludes a warranty or right that cannot lawfully be excluded.</p>
      </LegalSection>

      <LegalSection n="15" title="Limitation of liability">
        <p>To the maximum extent permitted by law, neither party is liable for indirect, incidental, special, exemplary, punitive or consequential loss, or for lost profits, revenue, goodwill, anticipated savings, business opportunity or data, even if advised of the possibility.</p>
        <p>Except for payment obligations, breach of confidentiality, infringement or misuse of intellectual property, fraud, wilful misconduct, or liability that cannot be limited by law, each party’s aggregate liability arising from the Services will not exceed the fees paid or payable for the Services during the twelve months before the event giving rise to the claim. Any order form may specify a different cap.</p>
      </LegalSection>

      <LegalSection n="16" title="Indemnity">
        <p>You will defend and indemnify ELLIPSE and its personnel against third-party claims arising from unlawful Customer Data, your connected services, your violation of these Terms, or agent actions configured or approved by you, except to the extent caused by our breach or misconduct. We will promptly notify you and allow reasonable control of the defence, subject to our right to participate.</p>
      </LegalSection>

      <LegalSection n="17" title="Term, cancellation and termination">
        <p>These Terms continue while you use the Services. You may cancel renewal through available account controls or written notice. We may terminate for material breach that remains uncured after reasonable notice, immediately for serious security or unlawful conduct, or as otherwise permitted in an order form.</p>
        <p>After termination, access ends and you should export required data beforehand. We may retain or delete data according to the Privacy Policy, legal obligations and applicable data-processing terms. Provisions that by nature should survive—including payment, confidentiality, intellectual property, disclaimers, liability and dispute terms—will survive.</p>
      </LegalSection>

      <LegalSection n="18" title="Governing law, disputes and general terms">
        <p>The governing law and courts are those stated in your order form or signed agreement. If none is stated, the laws and courts of the jurisdiction in which the ELLIPSE contracting entity is established apply, without regard to conflict-of-law rules. Mandatory consumer or data-protection rights remain unaffected.</p>
        <p>Before filing a claim, each party will attempt in good faith for 30 days to resolve it through written notice, unless urgent injunctive relief is required. Neither party may assign the agreement without consent, except to an affiliate or in connection with a merger, reorganisation or sale of substantially all relevant assets. We may use subcontractors but remain responsible for our obligations.</p>
        <p>If a provision is unenforceable, it will be narrowed or removed without affecting the remainder. Failure to enforce is not a waiver. These Terms, the Privacy Policy, order forms and incorporated documents are the entire agreement concerning the Services. Notices may be delivered electronically. Headings are for convenience only.</p>
      </LegalSection>

      <LegalSection n="19" title="Changes and contact">
        <p>We may update these Terms to reflect product, legal or operational changes. We will post the revised version and update its date. For material changes, we will provide reasonable notice through the Services, email or another appropriate channel. Continued use after the effective date constitutes acceptance where permitted by law.</p>
        <p>Questions or legal notices may be sent to <a className="font-medium text-black underline" href="mailto:legal@ellipsedesk.com">legal@ellipsedesk.com</a>. Formal notices must also use any address identified on your order form or invoice.</p>
      </LegalSection>
    </LegalPage>
  );
}
