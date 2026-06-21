"use client";

import { useEffect, useState } from "react";

export default function ReconnectBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.needsReconnect) setShow(true);
      })
      .catch(() => {});
  }, []);

  function handleReconnect() {
    window.location.href = "/auth/strava";
  }

  if (!show) return null;

  return (
    <div className="w-full bg-[#E63946] text-white text-sm flex items-center justify-between px-4 py-3 gap-3">
      <span>
        ⚠️ Your Strava connection has expired — we can&apos;t pull your results until you reconnect.
      </span>
      <button
        onClick={handleReconnect}
        className="shrink-0 bg-white text-[#E63946] font-semibold px-3 py-1 rounded hover:bg-red-50 transition-colors"
      >
        Reconnect Strava
      </button>
    </div>
  );
}
