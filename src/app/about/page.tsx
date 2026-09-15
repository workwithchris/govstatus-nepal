import type { Metadata } from "next";

import { AboutContent } from "./AboutContent";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description:
    "IsGovOnline exists — an independent uptime tracker for Nepal's digital public services, and how it works.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd({ name: "About", path: "/about" })
          ),
        }}
      />
      <AboutContent />
    </main>
  );
}
