import React from "react"
import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'

const poppins = Poppins({ weight: ["300", "400", "500", "600", "700"], subsets: ["latin"], variable: "--font-poppins" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: 'ELLIPSE | AI Business Automation & Management Software',
  description: SITE_DESCRIPTION,
  keywords: ['business automation software', 'business management software', 'AI business assistant', 'AI agents for business', 'workflow automation', 'unified inbox', 'CRM automation', 'customer communication management', 'human in the loop AI', 'agentic workspace', 'Ivy AI assistant'],
  authors: [{ name: 'ELLIPSE' }],
  creator: 'ELLIPSE',
  publisher: 'ELLIPSE',
  category: 'Business Software',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    title: 'ELLIPSE | AI Business Automation & Management Software',
    description: SITE_DESCRIPTION,
    type: 'website',
    url: SITE_URL,
    siteName: 'ELLIPSE',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ELLIPSE | AI Business Automation & Management Software',
    description: SITE_DESCRIPTION,
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
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/apple-touch-icon.png`,
        description: SITE_DESCRIPTION,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        alternateName: 'Ellipse Desk',
        description: SITE_DESCRIPTION,
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage: 'en',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: SITE_NAME,
        alternateName: 'Ellipse Desk',
        url: SITE_URL,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Business automation and management software',
        operatingSystem: 'Web, iOS, Android',
        description: SITE_DESCRIPTION,
        featureList: [
          'Unified multi-channel inbox',
          'Connection-specific AI agents',
          'Ivy coordinating AI assistant',
          'CRM and workflow automation',
          'Human-reviewed agent approvals',
          'Task, document and quotation creation',
          'Business analytics and reports',
          'Role-based organisation access',
          'Mobile companion application',
        ],
        offers: [
          { '@type': 'Offer', name: 'Starter', price: '89.99', priceCurrency: 'USD', url: `${SITE_URL}/#pricing` },
          { '@type': 'Offer', name: 'Growth', price: '149.99', priceCurrency: 'USD', url: `${SITE_URL}/#pricing` },
          { '@type': 'Offer', name: 'Enterprise', price: '499', priceCurrency: 'USD', url: `${SITE_URL}/#pricing` },
        ],
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  }

  return (
    <html lang="en">
      <head>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="ELLIPSE product information for AI systems" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
        />
      </head>
      <body className={`${poppins.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
