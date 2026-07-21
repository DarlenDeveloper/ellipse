export type Integration = {
  id: string;
  name: string;
  description: string;
  logo: string | null; // path to svg, or null for icon-based
  tileClass: string;
  connected: boolean;
};

export const integrations: Integration[] = [
  {
    id: "google-workspace",
    name: "Google Workspace",
    description: "Connect Gmail, Calendar, Contacts, and Drive in one go with your Google Workspace account.",
    logo: "/logos/google-workspace.svg",
    tileClass: "bg-blue-50",
    connected: false,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect WhatsApp Business to message customers in real time.",
    logo: "/logos/whatsapp.svg",
    tileClass: "bg-green-50",
    connected: false,
  },
  {
    id: "zoho",
    name: "Zoho",
    description: "Sync contacts, deals, and mail from your Zoho CRM workspace.",
    logo: "/logos/zoho.svg",
    tileClass: "bg-red-50",
    connected: false,
  },
  {
    id: "odoo",
    name: "Odoo",
    description: "Connect Odoo CRM, sales, and support modules to Ellipse.",
    logo: "/logos/odoo.svg",
    tileClass: "bg-purple-50",
    connected: false,
  },
  {
    id: "microsoft365",
    name: "Microsoft 365",
    description: "Connect Outlook, Teams, Calendar, and OneDrive with your Microsoft 365 account.",
    logo: "/logos/microsoft365.svg",
    tileClass: "bg-orange-50",
    connected: false,
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Sync leads, contacts, opportunities, and cases from your Salesforce CRM.",
    logo: "/logos/salesforce.svg",
    tileClass: "bg-sky-50",
    connected: false,
  },
  {
    id: "smtp",
    name: "SMTP / IMAP",
    description: "Connect any custom email server via SMTP and IMAP protocols.",
    logo: null,
    tileClass: "bg-slate-100",
    connected: false,
  },
  {
    id: "website",
    name: "Website",
    description: "Add a tracking tag for visitor analytics — plus a web chat agent for your site.",
    logo: null,
    tileClass: "bg-indigo-50",
    connected: false,
  },
];
