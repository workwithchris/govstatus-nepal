"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: replaces the root layout, so it must render its own
 * <html>/<body> and cannot rely on the app's theme/providers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafafa",
          color: "#171717",
          fontFamily: "system-ui, Arial, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ padding: 24 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#4d4d4d", fontSize: 14 }}>
            The application hit an unexpected error.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #ebebeb",
              background: "#171717",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
