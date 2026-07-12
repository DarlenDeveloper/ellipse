import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Ellipse — Unified Agentic Communication Hub",
  description: "Connect all your channels. Let AI handle the rest.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#f7f7f8]">
        <Sidebar />
        <div className="ml-[230px] min-h-screen">{children}</div>
      </body>
    </html>
  );
}
