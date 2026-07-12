export type Integration = {
  id: string;
  name: string;
  description: string;
  mark: string;
  tileClass: string;
  connected: boolean;
};

export const integrations: Integration[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Sync and manage your Gmail inbox and threads directly within Ellipse.",
    mark: "G",
    tileClass: "bg-red-500 text-white",
    connected: true,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect WhatsApp Business to message customers in real time.",
    mark: "W",
    tileClass: "bg-green-500 text-white",
    connected: true,
  },
  {
    id: "zoho",
    name: "Zoho",
    description: "Sync contacts, deals, and mail from your Zoho CRM workspace.",
    mark: "Z",
    tileClass: "bg-orange-500 text-white",
    connected: false,
  },
  {
    id: "odoo",
    name: "Odoo",
    description: "Connect Odoo CRM, sales, and support modules to Ellipse.",
    mark: "O",
    tileClass: "bg-purple-600 text-white",
    connected: true,
  },
  {
    id: "smtp",
    name: "SMTP / IMAP",
    description: "Connect any custom email server via SMTP and IMAP protocols.",
    mark: "@",
    tileClass: "bg-slate-700 text-white",
    connected: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Get notifications and manage threads from your Slack workspace.",
    mark: "S",
    tileClass: "bg-fuchsia-600 text-white",
    connected: false,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Track payments and revenue attribution across all channels.",
    mark: "S",
    tileClass: "bg-indigo-500 text-white",
    connected: true,
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Sync campaigns and marketing contacts into your inbox.",
    mark: "M",
    tileClass: "bg-yellow-400 text-black",
    connected: false,
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Connect Microsoft Outlook mail and calendar to Ellipse.",
    mark: "O",
    tileClass: "bg-blue-500 text-white",
    connected: false,
  },
];
