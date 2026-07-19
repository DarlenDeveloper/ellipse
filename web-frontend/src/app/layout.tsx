import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

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
    <html lang="en" className={poppins.variable}>
      <body className="antialiased bg-[#f7f7f8] font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
