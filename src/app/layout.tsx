import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { Footer } from "@/components/common/footer";
import { Navbar } from "@/components/common/navbar";
import { Providers } from "@/app/providers";

import "./globals.css";

const SITE_URL = "https://govstatusnepal.techyatraa.com";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "GovStatus Nepal — Uptime for Nepal's Digital Government",
    template: "%s · GovStatus Nepal",
  },
  description:
    "Real-time uptime monitor, health checker, and reliability tracker for Nepali government portals and digital public services — national portals, ministries, banks, and palikas.",
  applicationName: "GovStatus Nepal",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "GovStatus Nepal",
    title: "GovStatus Nepal — Is the government online?",
    description:
      "Live uptime and health checks for Nepal's essential citizen, finance, and ministry portals — refreshed every 5 minutes.",
    locale: "en_NP",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "GovStatus Nepal — real-time government uptime monitor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GovStatus Nepal — Is the government online?",
    description:
      "Live uptime and health checks for Nepal's essential citizen, finance, and ministry portals.",
    images: ["/og.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "GovStatus Nepal",
      url: SITE_URL,
      description:
        "Real-time uptime monitor for Nepal's digital government portals.",
      inLanguage: "en",
    },
    {
      "@type": "Organization",
      name: "GovStatus Nepal",
      url: SITE_URL,
      description:
        "Independent uptime tracker for Nepali government and public services.",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <Providers>
          <Navbar />
          <div className="flex-1">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
