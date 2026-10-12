"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/error-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "client",
        message: error.message,
        stack: error.stack,
        url: window.location.href,
        context: error.digest ? { digest: error.digest } : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 14, padding: 24, textAlign: "center" }}>
      <h2 style={{ margin: 0, color: "var(--ink)" }}>אירעה שגיאה</h2>
      <p style={{ margin: 0, color: "var(--muted)", maxWidth: 480 }}>{error.message || "משהו השתבש. השגיאה תועדה."}</p>
      <button onClick={reset}>נסה שוב</button>
    </div>
  );
}
