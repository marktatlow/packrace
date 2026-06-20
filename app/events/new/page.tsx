"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      distanceKm: (form.elements.namedItem("distanceKm") as HTMLInputElement).value,
      date: (form.elements.namedItem("date") as HTMLInputElement).value,
      location: (form.elements.namedItem("location") as HTMLInputElement).value,
      description: (form.elements.namedItem("description") as HTMLTextAreaElement).value,
    };

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const event = await res.json();
      router.push(`/events/${event.id}`);
    } else {
      const err = await res.json();
      setError(err.error || "Failed to create event");
      setLoading(false);
    }
  }

  const inputClass = "w-full bg-[#0D0D0D] border border-[#2A2A4A] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#FF6B35] transition-colors";

  return (
    <main className="min-h-screen bg-[#0D0D0D] px-4 py-6 max-w-[430px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/events" className="text-gray-400 text-xl">←</Link>
        <h1 className="text-xl font-black">New Race</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Race Name *</label>
          <input name="name" required className={inputClass} placeholder="e.g. Centennial Park 10k" />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Distance (km) *</label>
          <input name="distanceKm" type="number" step="0.1" min="0.1" required className={inputClass} placeholder="10" />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Race Date *</label>
          <input name="date" type="datetime-local" required className={inputClass} />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Location</label>
          <input name="location" className={inputClass} placeholder="e.g. Centennial Park, Sydney" />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Description</label>
          <textarea name="description" rows={3} className={inputClass} placeholder="Any extra details..." />
        </div>

        {error && <p className="text-[#E63946] text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#FF6B35] hover:bg-[#e5602f] disabled:bg-gray-700 text-white font-bold py-4 rounded-2xl text-lg transition-colors"
        >
          {loading ? "Creating..." : "Create Race 🏁"}
        </button>
      </form>
    </main>
  );
}
