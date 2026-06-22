"use client";

import { useEffect, useState } from "react";

export default function ReconnectBanner() {
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.needsReconnect) {
          setRedirecting(true);
          setTimeout(() => {
            window.location.href = "/auth/strava";
          }, 2500);
        }
      })
      .catch(() => {});
  }, []);

  if (!redirecting) return null;

  return (
    <div className="w-full bg-[#FF6A3D] text-white text-sm flex items-center justify-center px-4 py-3 gap-2 shadow-[0_0_16px_rgba(255,106,61,0.4)]">
      <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span>Reconnecting your Strava account…</span>
    </div>
  );
}
