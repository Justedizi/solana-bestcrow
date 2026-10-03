"use client";

import { useEffect, useState } from "react";

export function BackendStatus({ initialOnline }: { initialOnline: boolean }) {
  const [online, setOnline] = useState(initialOnline);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (active) setOnline(response.ok);
      } catch {
        if (active) setOnline(false);
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="status" role="status" aria-live="polite">
      <span className={online ? "dot online" : "dot"} aria-hidden="true" />
      <span>Backend {online ? "connected" : "unavailable"}</span>
    </div>
  );
}
