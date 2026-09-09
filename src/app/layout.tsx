import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { Footer } from "@/components/common/footer";
import { Navbar } from "@/components/common/navbar";
import { Providers } from "@/app/providers";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

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
    default: "IsGovOnline — Uptime for Nepal's Digital Government",
    template: "%s · IsGovOnline",
  },
  description:
    "Real-time uptime monitor, health checker, and reliability tracker for Nepali government portals and digital public services — national portals, ministries, banks, and palikas.",
  applicationName: "IsGovOnline",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "IsGovOnline",
    title: "IsGovOnline — Is the government online?",
    description:
      "Live uptime and health checks for Nepal's essential citizen, finance, and ministry portals — refreshed every 5 minutes.",
    locale: "en_NP",
  },
  twitter: {
    card: "summary_large_image",
    title: "IsGovOnline — Is the government online?",
    description:
      "Live uptime and health checks for Nepal's essential citizen, finance, and ministry portals.",
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
      name: "IsGovOnline",
      url: SITE_URL,
      description:
        "Real-time uptime monitor for Nepal's digital government portals.",
      inLanguage: "en",
    },
    {
      "@type": "Organization",
      name: "IsGovOnline",
      alternateName: "नेपाल सरकार स्टेटस",
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
