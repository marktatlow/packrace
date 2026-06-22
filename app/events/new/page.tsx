"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewEventPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const fd = new FormData(e.currentTarget);

    // datetime-local gives us a local-time string e.g. "2026-06-23T05:00"
    // new Date() in the browser interprets this as local (BST), then toISOString() converts to UTC
    const toUTC = (val: FormDataEntryValue | null) =>
      val ? new Date(val as string).toISOString() : null;

    const windowStart = toUTC(fd.get("windowStart"));
    const windowEnd = toUTC(fd.get("windowEnd"));

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        distanceKm: fd.get("distanceKm"),
        date: windowStart, // use window start as the event date
        windowStart,
        windowEnd,
        location: fd.get("location"),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      setSaving(false);
      return;
    }

    const event = await res.json();
    router.push(`/events/${event.id}`);
  }

  const inputClass = "w-full bg-[#0D0F14] border border-white/10 rounded-xl px-4 py-3 text-[#F4F4F7] text-sm focus:outline-none focus:border-[#FF2D94] placeholder-white/25 transition-colors";
  const labelClass = "block text-xs font-black text-white/50 uppercase tracking-widest mb-1.5";

  return (
    <main className="min-h-screen bg-[#0D0F14] max-w-[430px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/events" className="text-white/50 text-xl hover:text-white transition-colors">←</Link>
        <img src="/raceparty-wordmarkx.png" alt="RaceParty" className="h-7 w-auto" />
        <div className="w-7" />
      </div>
      <h1 className="text-2xl font-black text-[#F4F4F7] mb-6">New Race</h1>

      {/* BST notice */}
      <div className="bg-[#00B7FF]/10 border border-[#00B7FF]/30 rounded-xl px-4 py-3 mb-6 flex items-center gap-2">
        <span className="text-[#00B7FF] text-lg">🕐</span>
        <p className="text-[#00B7FF] text-xs font-bold">All times are in BST (British Summer Time, GMT+1)</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={labelClass}>Race name</label>
          <input name="name" required placeholder="Parkrun Saturday" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Distance (km)</label>
          <input name="distanceKm" type="number" step="0.01" min="0.1" required placeholder="5" className={inputClass} />
        </div>

        <div className="bg-[#13151C] border border-white/8 rounded-2xl p-4 space-y-4">
          <div>
            <p className="text-xs font-black text-[#00B7FF] uppercase tracking-widest mb-0.5">Activity Window <span className="text-[#00B7FF]/60 normal-case font-semibold">(BST)</span></p>
            <p className="text-xs text-white/40">Strava runs within this window count as results.</p>
          </div>
          <div>
            <label className={labelClass}>Window opens <span className="text-[#00B7FF] normal-case font-semibold">(BST)</span></label>
            <input name="windowStart" type="datetime-local" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Window closes <span className="text-[#00B7FF] normal-case font-semibold">(BST)</span></label>
            <input name="windowEnd" type="datetime-local" required className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Location (optional)</label>
          <input name="location" placeholder="Victoria Park, London" className={inputClass} />
        </div>

        {error && <p className="text-[#FF6A3D] text-sm font-semibold">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-[#FF2D94] text-white font-black py-4 rounded-2xl text-base disabled:opacity-50 shadow-[0_0_20px_rgba(255,45,148,0.4)] transition-shadow mt-2"
        >
          {saving ? "Creating…" : "Create Race"}
        </button>
      </form>
    </main>
  );
}
