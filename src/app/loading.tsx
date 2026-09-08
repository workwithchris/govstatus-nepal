import { ProbeLoader } from "@/features/services-monitor";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center px-4 py-10 sm:px-6 lg:py-14">
      <ProbeLoader variant="page" />
    </main>
  );
}
