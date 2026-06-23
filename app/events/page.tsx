"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatWindow } from "@/lib/format";

type Participant = { id: string; userId: string; user: { firstName: string; profilePic: string | null } };

type Event = {
  id: string;
  name: string;
  distanceKm: number;
  date: string;
  windowStart: string;
  windowEnd: string;
  location: string | null;
  participants: Participant[];
};

type Me = { userId: string; profilePic: string | null; firstName: string };

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/events").then((r) => r.json()),
      fetch("/api/me").then((r) => r.json()).catch(() => null),
    ]).then(([eventsData, meData]) => {
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      if (meData?.userId) { setCurrentUserId(meData.userId); setMe(meData); }
      setLoading(false);
    });
  }, []);

  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.windowEnd) > now);
  const past = events.filter((e) => new Date(e.windowEnd) <= now);

  function statusLabel(e: Event) {
    const start = new Date(e.windowStart);
    const end = new Date(e.windowEnd);
    if (now >= start && now <= end) return { text: "● Live", color: "text-[#39FF72] bg-[#39FF72]/10 border border-[#39FF72]/30" };
    if (now < start) {
      const days = Math.ceil((start.getTime() - now.getTime()) / 86400000);
      const label = days <= 1 ? "Today" : `In ${days}d`;
      return { text: label, color: "text-[#00B7FF] bg-[#00B7FF]/10 border border-[#00B7FF]/30" };
    }
    return { text: "Finished", color: "text-white/40 bg-white/5 border border-white/10" };
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0B0D12] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#FF2D94] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-white/40 text-sm">Loading races…</p>
        </div>
      </main>
    );
  }

  function EventCard({ e }: { e: Event }) {
    const status = statusLabel(e);
    const isIn = currentUserId ? e.participants.some((p) => p.userId === currentUserId) : false;
    const isLive = now >= new Date(e.windowStart) && now <= new Date(e.windowEnd);

    return (
      <Link href={`/events/${e.id}`}>
        <div className={`bg-[#12151D] rounded-2xl overflow-hidden border transition-all active:scale-[0.99] ${isLive ? "border-[#FF2D94]/60 shadow-[0_0_20px_rgba(255,45,148,0.15)]" : "border-white/8"}`}>
          {/* Top accent bar */}
          <div className={`h-0.5 w-full ${isLive ? "bg-[#39FF72]" : "bg-gradient-to-r from-[#FF2D94] to-[#00B7FF]"}`} />
          <div className="p-4">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="font-black text-[#F4F4F7] text-lg truncate leading-tight">{e.name}</p>
                <p className="text-sm text-white/50 mt-0.5">
                  {e.distanceKm}km{e.location && ` · ${e.location}`}
                </p>
                <p className="text-xs text-[#00B7FF]/80 mt-0.5 font-semibold">
                  🕐 {formatWindow(new Date(e.windowStart), new Date(e.windowEnd))}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${status.color}`}>{status.text}</span>
                {!isIn && (
                  <span className="text-xs text-[#FF2D94] font-semibold border border-[#FF2D94]/50 px-2 py-0.5 rounded-full">Join</span>
                )}
              </div>
            </div>

            {/* Participants */}
            <div className="flex items-center gap-2 mt-3">
              <div className="flex -space-x-2">
                {e.participants.slice(0, 6).map((p) => (
                  p.user.profilePic
                    ? <img key={p.id} src={p.user.profilePic} className="w-7 h-7 rounded-full border-2 border-[#13151C] object-cover" alt="" />
                    : <div key={p.id} className="w-7 h-7 rounded-full border-2 border-[#13151C] bg-[#FF2D94] flex items-center justify-center text-xs font-black text-white">{p.user.firstName[0]}</div>
                ))}
                {e.participants.length > 6 && (
                  <div className="w-7 h-7 rounded-full border-2 border-[#13151C] bg-white/10 flex items-center justify-center text-xs text-white/50 font-semibold">
                    +{e.participants.length - 6}
                  </div>
                )}
              </div>
              <span className="text-xs text-white/40">{e.participants.length} runner{e.participants.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0D12] max-w-[430px] mx-auto">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-[#0B0D12] border-b border-white/8">
        {/* Neon glows */}
        <div className="absolute top-0 left-1/4 w-72 h-40 bg-[#FF2D94]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-[#00B7FF]/8 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar: profile + new button */}
        <div className="flex items-center justify-between px-5 pt-5">
          <Link href="/profile">
            {me?.profilePic
              ? <img src={me.profilePic} className="w-9 h-9 rounded-full object-cover border-2 border-white/20" alt={me.firstName} />
              : <div className="w-9 h-9 rounded-full bg-[#FF2D94]/20 border-2 border-[#FF2D94]/40 flex items-center justify-center text-sm font-black text-[#FF2D94]">
                  {me?.firstName?.[0] ?? "?"}
                </div>
            }
          </Link>
          <Link href="/events/new"
            className="bg-[#FF2D94] text-white text-sm font-black px-5 py-2 rounded-full shadow-[0_0_16px_rgba(255,45,148,0.5)]">
            + New Race
          </Link>
        </div>

        {/* Centred logo lockup */}
        <div className="flex flex-col items-center pt-4 pb-8 px-5 relative">
          <img src="/raceparty-icon.png" alt="" className="w-16 h-16 mb-3" />
          <img src="/raceparty-wordmarkx.png" alt="RaceParty" className="h-14 w-auto" />
          <p className="text-xs mt-2 font-black tracking-widest uppercase">
            <span className="text-[#FF2D94] neon-pink">Predict</span>
            <span className="text-white/30"> · </span>
            <span className="text-[#00B7FF] neon-blue">Race</span>
            <span className="text-white/30"> · </span>
            <span className="text-[#39FF72] neon-green">Get Roasted</span>
          </p>
        </div>
      </div>

      {/* Event list */}
      <div className="px-4 py-5">
        {events.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <p className="text-4xl">🏃</p>
            <p className="text-white/40 font-semibold">No races yet.</p>
            <Link href="/events/new" className="inline-block text-[#FF2D94] font-bold border border-[#FF2D94]/50 px-4 py-2 rounded-full text-sm">
              Create the first one →
            </Link>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="space-y-3 mb-6">
            <p className="text-xs font-black text-[#FF2D94] uppercase tracking-widest px-1">Upcoming</p>
            {upcoming.map((e) => <EventCard key={e.id} e={e} />)}
          </div>
        )}

        {past.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-black text-white/30 uppercase tracking-widest px-1">Past</p>
            {past.map((e) => <EventCard key={e.id} e={e} />)}
          </div>
        )}
      </div>
    </main>
  );
}
