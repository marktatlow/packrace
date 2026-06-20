"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatTime } from "@/lib/format";

type Event = {
  id: string;
  name: string;
  distanceKm: number;
  date: string;
  windowStart: string;
  windowEnd: string;
  location: string | null;
  participants: { id: string; user: { firstName: string; profilePic: string | null } }[];
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => { setEvents(data); setLoading(false); });
  }, []);

  const now = new Date();

  const upcoming = events.filter((e) => new Date(e.windowEnd) > now);
  const past = events.filter((e) => new Date(e.windowEnd) <= now);

  function statusLabel(e: Event) {
    const start = new Date(e.windowStart);
    const end = new Date(e.windowEnd);
    if (now < start) {
      const days = Math.ceil((start.getTime() - now.getTime()) / 86400000);
      return { text: `Starts in ${days}d`, color: "text-[#FF6B35]" };
    }
    if (now >= start && now <= end) return { text: "Live now", color: "text-green-400" };
    return { text: "Ended", color: "text-gray-500" };
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0D0D0D] max-w-[430px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">My Events</h1>
        <Link
          href="/events/new"
          className="bg-[#FF6B35] text-white text-sm font-bold px-4 py-2 rounded-xl"
        >
          + New
        </Link>
      </div>

      {events.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <div className="text-4xl">🏁</div>
          <p className="text-gray-400">No events yet.</p>
          <Link href="/events/new" className="text-[#FF6B35] font-semibold">
            Create your first event →
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Upcoming</p>
          {upcoming.map((e) => {
            const status = statusLabel(e);
            return (
              <Link key={e.id} href={`/events/${e.id}`}>
                <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 active:opacity-80">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-white">{e.name}</p>
                      <p className="text-sm text-gray-400 mt-0.5">
                        {e.distanceKm}km · {new Date(e.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        {e.location && ` · ${e.location}`}
                      </p>
                    </div>
                    <span className={`text-xs font-bold ${status.color}`}>{status.text}</span>
                  </div>
                  <div className="flex -space-x-2 mt-3">
                    {e.participants.slice(0, 6).map((p) => (
                      p.user.profilePic
                        ? <img key={p.id} src={p.user.profilePic} className="w-7 h-7 rounded-full border-2 border-[#1A1A2E] object-cover" alt="" />
                        : <div key={p.id} className="w-7 h-7 rounded-full border-2 border-[#1A1A2E] bg-[#2A2A4A] flex items-center justify-center text-xs font-bold">{p.user.firstName[0]}</div>
                    ))}
                    {e.participants.length > 6 && (
                      <div className="w-7 h-7 rounded-full border-2 border-[#1A1A2E] bg-[#2A2A4A] flex items-center justify-center text-xs text-gray-400">
                        +{e.participants.length - 6}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Past</p>
          {past.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`}>
              <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 opacity-60 active:opacity-40">
                <p className="font-bold text-white">{e.name}</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {e.distanceKm}km · {new Date(e.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
