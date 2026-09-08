import { cache } from "react";
import { QueryClient } from "@tanstack/react-query";

/**
 * Per-request QueryClient (React's `cache` dedupes within one SSR render).
 * Server components and client components both call this during SSR so the
 * prefetched data is visible to the render tree; on the browser it returns a
 * fresh client hydrated from the server payload.
 */
export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    })
);