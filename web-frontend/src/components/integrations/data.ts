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
    id: "gmail",
    name: "Gmail",
    description: "Sync and manage your Gmail inbox and threads directly within Ellipse.",
    logo: "/logos/gmail.svg",
    tileClass: "bg-red-50",
    connected: true,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect WhatsApp Business to message customers in real time.",
    logo: "/logos/whatsapp.svg",
    tileClass: "bg-green-50",
    connected: true,
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
    connected: true,
  },
  {
    id: "smtp",
    name: "SMTP / IMAP",
    description: "Connect any custom email server via SMTP and IMAP protocols.",
    logo: null,
    tileClass: "bg-slate-100",
    connected: false,
  },
];
