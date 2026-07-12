import type { Metadata } from "next";
import "./globals.css";

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
      <body className="antialiased">{children}</body>
    </html>
  );
}
