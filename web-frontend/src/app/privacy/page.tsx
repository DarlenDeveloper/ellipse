import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | ELLIPSE",
  description: "How ELLIPSE collects, uses, shares, secures and retains personal data across its dashboard, mobile companion, AI agents and integrations.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" summary="This Policy explains how ELLIPSE handles personal data when you visit our website, create an account, use the dashboard or mobile companion, connect business systems, interact with Ivy or other agents, or communicate with us.">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/[0.05]">
        <strong className="text-black">Our role depends on the data.</strong> We generally act as controller for account, billing, website and security data. For messages, CRM records, files and other content an organisation connects to ELLIPSE, that organisation generally acts as controller and ELLIPSE acts as its processor or service provider.
      </div>

      <LegalSection n="1" title="Scope and responsible organisation">
        <p>This Policy applies to ELLIPSE websites, web applications, mobile applications, support and related services (the “Services”). “ELLIPSE”, “we”, “us” and “our” refer to the ELLIPSE operator identified on your order form, invoice, subscription page or contract.</p>
        <p>It does not replace an organisation’s own privacy notice to employees, customers, suppliers or other individuals whose data the organisation places in ELLIPSE. Third-party websites and connected services have separate policies.</p>
      </LegalSection>

      <LegalSection n="2" title="Personal data we collect">
        <p><strong className="text-black">Account and profile data:</strong> name, work email, profile image, authentication identifiers, organisation, role, permissions, invitation status, timezone and preferences.</p>
        <p><strong className="text-black">Organisation and billing data:</strong> company name, industry, website, plan, subscription status, transaction references, billing contacts and tax information. Payment-card details may be collected directly by a payment provider rather than stored by ELLIPSE.</p>
        <p><strong className="text-black">Customer content:</strong> messages, email headers and bodies, chat content, contacts, attachments, CRM records, leads, quotes, orders, tasks, calendar entries, documents, reports, knowledge-base files, website conversations, prompts, instructions, agent outputs, approvals and edits.</p>
        <p><strong className="text-black">Integration data:</strong> connection type, account identifiers, authorised scopes, sync status, webhook data, API configuration and credentials or tokens required to operate the connection. Secret credentials are stored separately with restricted access where supported.</p>
        <p><strong className="text-black">Usage and device data:</strong> pages and features used, agent and tool activity, timestamps, error and diagnostic logs, browser and device type, operating system, app version, IP address, approximate location inferred from IP, push-notification tokens and notification preferences.</p>
        <p><strong className="text-black">Communications:</strong> support requests, feedback, survey responses, sales communications and records of notices or consent.</p>
      </LegalSection>

      <LegalSection n="3" title="Sources of data">
        <p>We receive data directly from you; from your organisation’s owners, administrators and users; from connected providers such as Google, Microsoft, Meta/WhatsApp, Zoho, Salesforce, Odoo and custom systems; from websites using an ELLIPSE widget or analytics integration; from devices and browsers; and from service providers assisting with authentication, hosting, security, support and payments.</p>
      </LegalSection>

      <LegalSection n="4" title="How and why we use data">
        <p>We process data to create and administer accounts; provide and personalise the Services; synchronise authorised integrations; display a unified inbox; operate Ivy and connection-specific agents; generate summaries, drafts, tasks, documents, quotations, reports and analytics; route approvals; execute authorised actions; deliver notifications; provide support; meter usage and bill subscriptions; secure and troubleshoot the Services; prevent abuse; comply with law; enforce agreements; and improve reliability and usability.</p>
        <p>Where applicable, our legal bases include performance of a contract, steps requested before entering a contract, legitimate interests in operating and securing a business service, compliance with legal obligations, and consent where required. When we rely on consent, you may withdraw it without affecting prior lawful processing.</p>
      </LegalSection>

      <LegalSection n="5" title="AI processing and human control">
        <p>Prompts and relevant Customer Data may be sent to configured AI model providers to produce an answer or perform an authorised workflow. We aim to limit context to what is relevant and available to the requesting user. Outputs and action traces may be retained with the relevant conversation, agent history, report or approval record.</p>
        <p>ELLIPSE may categorise, prioritise, summarise and recommend actions. Depending on organisation settings, an action may be disabled, queued for human review, edited, approved, rejected or executed automatically. Organisations should not use ELLIPSE as the sole basis for decisions producing legal or similarly significant effects on individuals.</p>
        <p>We do not use Customer Data to train a general-purpose ELLIPSE model unless the customer has expressly agreed to that separate use. Model providers process data under their applicable enterprise terms, configuration and retention controls.</p>
      </LegalSection>

      <LegalSection n="6" title="When we disclose data">
        <p><strong className="text-black">Within your organisation:</strong> according to roles, permissions, ownership, shared-connection grants and approval rights configured by your organisation.</p>
        <p><strong className="text-black">Service providers:</strong> cloud hosting, database, storage, authentication, AI inference, communications, monitoring, analytics, customer support, payments and security vendors that process data for us under contractual restrictions.</p>
        <p><strong className="text-black">Connected services:</strong> when you ask ELLIPSE to retrieve, send, update or create information in an authorised third-party system.</p>
        <p><strong className="text-black">Legal and safety reasons:</strong> where reasonably necessary to comply with law or valid process, protect rights and safety, investigate fraud or security incidents, or enforce agreements.</p>
        <p><strong className="text-black">Business transactions:</strong> in connection with financing, merger, acquisition, reorganisation or sale, subject to appropriate confidentiality and notice requirements.</p>
        <p>ELLIPSE does not sell personal data for money. We do not share personal data for cross-context behavioural advertising. If those practices change, we will update this Policy and provide legally required choices before doing so.</p>
      </LegalSection>

      <LegalSection n="7" title="International transfers">
        <p>ELLIPSE and its providers may process data in countries other than where you live. Where required, we use contractual, organisational and technical safeguards intended to provide an appropriate level of protection, and assess transfer requirements applicable to the data and destination. Customers remain responsible for lawful transfer of data they instruct us to process.</p>
      </LegalSection>

      <LegalSection n="8" title="Retention">
        <p>We retain personal data only for as long as reasonably necessary for the purposes described, including to provide an active workspace, maintain security and audit records, comply with tax or legal duties, resolve disputes and enforce agreements. Retention depends on data type, customer configuration, contractual instructions, sensitivity, legal requirements and whether deletion would affect other individuals.</p>
        <p>When an account or contract ends, data may remain for a limited period to permit export, recovery, fraud prevention, legal compliance and routine backup rotation. Some records may be retained longer where required by law or necessary for legal claims. An organisation may set or request additional retention rules for Customer Data.</p>
      </LegalSection>

      <LegalSection n="9" title="Security">
        <p>We use risk-based safeguards designed to protect confidentiality, integrity and availability, including tenant access controls, authentication, role and permission checks, restricted secret storage, encrypted network transport, logging, backups and incident response procedures. No online service can guarantee absolute security.</p>
        <p>You are responsible for strong credentials, secure devices, appropriate integration scopes, reviewing user access, removing departed personnel, maintaining lawful backups and promptly reporting suspected compromise.</p>
      </LegalSection>

      <LegalSection n="10" title="Your rights and choices">
        <p>Depending on your location and our role, you may have rights to be informed; access data; correct inaccurate data; request deletion; restrict or object to processing; receive portable data; withdraw consent; complain to a regulator; and receive information about certain automated processing. Rights may be limited by law, security, confidentiality, the rights of others, or our role as processor.</p>
        <p>If your data is controlled by an ELLIPSE customer—such as your employer or a company you contacted—submit your request to that organisation first. We will assist it as required. For ELLIPSE-controlled data, email <a className="font-medium text-black underline" href="mailto:privacy@ellipsedesk.com">privacy@ellipsedesk.com</a>. We may verify identity and authority before responding.</p>
      </LegalSection>

      <LegalSection n="11" title="Regional disclosures">
        <p><strong className="text-black">Uganda:</strong> processing is subject where applicable to the Data Protection and Privacy Act, 2019 and related regulations. Individuals may contact the Personal Data Protection Office. ELLIPSE customers remain responsible for their registration and controller obligations where required.</p>
        <p><strong className="text-black">EEA and United Kingdom:</strong> individuals may exercise applicable GDPR rights and complain to their local supervisory authority. Where ELLIPSE is a processor, the customer controls the request.</p>
        <p><strong className="text-black">California:</strong> where the CCPA applies, residents may request to know, correct or delete covered personal information, and may exercise rights without discriminatory treatment. ELLIPSE does not sell or share personal information as those terms are used for cross-context behavioural advertising.</p>
      </LegalSection>

      <LegalSection n="12" title="Cookies and local technology">
        <p>We use cookies, local storage, authentication state, service workers and similar technologies that are necessary to sign users in, remember preferences, protect sessions, deliver push notifications, measure service performance and maintain functionality. If we introduce non-essential advertising or marketing cookies, we will provide choices where required.</p>
      </LegalSection>

      <LegalSection n="13" title="Children">
        <p>The Services are designed for organisations and are not directed to children. Users must be at least 18. We do not knowingly collect personal data directly from children for account creation. If you believe a child has provided account data, contact us so we can investigate and take appropriate action.</p>
      </LegalSection>

      <LegalSection n="14" title="Mobile companion and notifications">
        <p>The mobile companion may process account identifiers, messages, agent conversations, approvals, attachments, device information and push tokens. Mobile platforms and notification providers may receive technical delivery information under their own policies. You can control notification permissions through your device and ELLIPSE preferences; disabling them does not stop essential in-app notices.</p>
      </LegalSection>

      <LegalSection n="15" title="Changes to this Policy">
        <p>We may update this Policy to reflect changes in the Services, providers, law or our practices. We will post the revised version and change the “last updated” date. If a change materially affects how we use personal data, we will provide additional notice through the Services, email or another appropriate channel where required.</p>
      </LegalSection>

      <LegalSection n="16" title="Contact and complaints">
        <p>Privacy questions and rights requests may be sent to <a className="font-medium text-black underline" href="mailto:privacy@ellipsedesk.com">privacy@ellipsedesk.com</a>. Include your name, organisation, relationship to ELLIPSE and the nature of your request, but do not email passwords, access tokens or unnecessary sensitive information.</p>
        <p>You may also complain to the competent data-protection authority. In Uganda, the regulator is the Personal Data Protection Office. Contact details for the applicable ELLIPSE legal entity or data protection representative should also appear on your order form or invoice.</p>
      </LegalSection>
    </LegalPage>
  );
}
