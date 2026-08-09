import React from "react"
import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const poppins = Poppins({ weight: ["300", "400", "500", "600", "700"], subsets: ["latin"], variable: "--font-poppins" });

export const metadata: Metadata = {
  title: 'ELLIPSE — Every conversation. One intelligent workspace.',
  description: 'Connect every business channel and let ELLIPSE agents manage conversations, surface priorities, and take action with your team in control.',
  keywords: ['AI agents', 'unified inbox', 'business communication', 'workflow automation', 'agentic workspace'],
  authors: [{ name: 'ELLIPSE' }],
  openGraph: {
    title: 'ELLIPSE — Every conversation. One intelligent workspace.',
    description: 'Connect every business channel and put intelligent agents to work across your organisation.',
    type: 'website',
    url: 'https://agentic.ai',
    siteName: 'ELLIPSE',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ELLIPSE — Every conversation. One intelligent workspace.',
    description: 'Connect every business channel and put intelligent agents to work across your organisation.',
  },
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
