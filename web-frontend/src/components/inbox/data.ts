export type Message = {
  id: string;
  sender: string;
  email: string;
  initial: string;
  avatarColor: string;
  time: string;
  subject: string;
  preview: string;
};

export const messages: Message[] = [
  {
    id: "1",
    sender: "Priya Nair",
    email: "priya@team.corp",
    initial: "P",
    avatarColor: "bg-emerald-100 text-emerald-700",
    time: "9:14 AM",
    subject: "Sprint 11 Planning Action Items",
    preview: "Hey team, wrapping up the retro notes...",
  },
  {
    id: "2",
    sender: "Alex Design Team",
    email: "alex@designteam.corp",
    initial: "A",
    avatarColor: "bg-purple-200 text-purple-700",
    time: "10:30 AM",
    subject: "Q3 UI Kit Updates & Feedback",
    preview: "Hey team, I've just uploaded the latest...",
  },
  {
    id: "3",
    sender: "Dev Wren",
    email: "dev@team.corp",
    initial: "D",
    avatarColor: "bg-amber-100 text-amber-700",
    time: "8:45 AM",
    subject: "Re: API rate limit issue in prod",
    preview: "ust merged the hotfix should be resol...",
  },
  {
    id: "4",
    sender: "Marcus Obi",
    email: "marcus@team.corp",
    initial: "M",
    avatarColor: "bg-pink-100 text-pink-700",
    time: "Yesterday",
    subject: "Client demo debrief",
    preview: "Great session overall. A few follow-ups...",
  },
  {
    id: "5",
    sender: "Sofia Lund",
    email: "sofia@team.corp",
    initial: "S",
    avatarColor: "bg-gray-100 text-gray-600",
    time: "Yesterday",
    subject: "New brand guidelines doc shared",
    preview: "Hi, I've uploaded the updated brand g...",
  },
  {
    id: "6",
    sender: "Jordan Miles",
    email: "jordan@team.corp",
    initial: "J",
    avatarColor: "bg-violet-100 text-violet-700",
    time: "Yesterday",
    subject: "Quarterly review deck final version",
    preview: "Hey, attaching the final slides for tomo...",
  },
];
