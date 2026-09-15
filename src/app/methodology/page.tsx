import type { Metadata } from "next";

import { MethodologyContent } from "./MethodologyContent";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Methodology",
  description:
    "How IsGovOnline measures uptime for Nepal's government portals, and what the statuses mean.",
  path: "/methodology",
});

export default function MethodologyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd({ name: "Methodology", path: "/methodology" })
          ),
        }}
      />
      <MethodologyContent />
    </main>
  );
}
