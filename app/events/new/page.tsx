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
    const date = fd.get("date") as string;
    const windowStart = fd.get("windowStart") as string;
    const windowEnd = fd.get("windowEnd") as string;

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        distanceKm: fd.get("distanceKm"),
        date,
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

  const inputClass = "w-full bg-[#0D0D0D] border border-[#2A2A4A] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FF6B35]";
  const labelClass = "block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5";

  return (
    <main className="min-h-screen bg-[#0D0D0D] max-w-[430px] mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/events" className="text-gray-400 text-xl">←</Link>
        <h1 className="text-xl font-black text-white">New Event</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={labelClass}>Event name</label>
          <input name="name" required placeholder="Parkrun Saturday" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Distance (km)</label>
          <input name="distanceKm" type="number" step="0.01" min="0.1" required placeholder="5" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Event date</label>
          <input name="date" type="datetime-local" required className={inputClass} />
        </div>

        <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Activity window</p>
          <p className="text-xs text-gray-500">Runs within this window count as results.</p>
          <div>
            <label className={labelClass}>Window opens</label>
            <input name="windowStart" type="datetime-local" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Window closes</label>
            <input name="windowEnd" type="datetime-local" required className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Location (optional)</label>
          <input name="location" placeholder="Central Park" className={inputClass} />
        </div>

        {error && <p className="text-[#E63946] text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-[#FF6B35] text-white font-bold py-4 rounded-2xl text-base disabled:opacity-50 mt-2"
        >
          {saving ? "Creating..." : "Create Event"}
        </button>
      </form>
    </main>
  );
}
