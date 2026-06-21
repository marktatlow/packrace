"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

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

// SVG runner silhouette used decoratively
function RunnerSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 100" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <circle cx="52" cy="10" r="9" />
      <path d="M52 19 C48 30 40 38 34 48 L26 68" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M44 30 L60 22 M40 42 L28 38" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <path d="M34 48 L46 70 L42 86" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M26 68 L14 82" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

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
    if (now >= start && now <= end) return { text: "● Live", color: "text-green-600 bg-green-50" };
    if (now < start) {
      const days = Math.ceil((start.getTime() - now.getTime()) / 86400000);
      return { text: days === 0 ? "Today" : `In ${days}d`, color: "text-[#FF6B35] bg-[#FFF1EB]" };
    }
    return { text: "Finished", color: "text-gray-400 bg-gray-100" };
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="text-center space-y-3">
          <RunnerSvg className="w-12 h-16 text-[#FF6B35] mx-auto animate-bounce" />
          <p className="text-gray-400 text-sm">Loading races…</p>
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
        <div className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-[#E8E4DF] active:scale-[0.99] transition-transform ${isLive ? "ring-2 ring-[#FF6B35]" : ""}`}>
          {/* Orange top bar */}
          <div className={`h-1 w-full ${isLive ? "bg-green-400" : "bg-[#FF6B35]"}`} />
          <div className="p-4">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="font-black text-gray-900 text-lg truncate leading-tight">{e.name}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {new Date(e.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  {" · "}{e.distanceKm}km
                  {e.location && ` · ${e.location}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${status.color}`}>{status.text}</span>
                {!isIn && (
                  <span className="text-xs text-[#FF6B35] font-semibold border border-[#FF6B35] px-2 py-0.5 rounded-full">Join</span>
                )}
              </div>
            </div>

            {/* Participants */}
            <div className="flex items-center gap-2 mt-3">
              <div className="flex -space-x-2">
                {e.participants.slice(0, 6).map((p) => (
                  p.user.profilePic
                    ? <img key={p.id} src={p.user.profilePic} className="w-7 h-7 rounded-full border-2 border-white object-cover" alt="" />
                    : <div key={p.id} className="w-7 h-7 rounded-full border-2 border-white bg-[#FF6B35] flex items-center justify-center text-xs font-black text-white">{p.user.firstName[0]}</div>
                ))}
                {e.participants.length > 6 && (
                  <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-semibold">
                    +{e.participants.length - 6}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400">{e.participants.length} runner{e.participants.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F5F2] max-w-[430px] mx-auto">
      {/* Hero header */}
      <div className="relative bg-[#FF6B35] overflow-hidden px-5 pt-12 pb-8">
        {/* Background runner shapes */}
        <RunnerSvg className="absolute right-4 top-3 w-20 h-28 text-white opacity-10 -rotate-6" />
        <RunnerSvg className="absolute right-16 bottom-0 w-12 h-16 text-white opacity-10 rotate-3" />
        {/* Dashed track line */}
        <div className="absolute bottom-0 left-0 right-0 h-px border-b-2 border-dashed border-white opacity-20" />

        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1">PackRace</p>
            <h1 className="text-white text-3xl font-black leading-tight">Your Races</h1>
            <p className="text-white/70 text-sm mt-1">Predict. Run. Compare.</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Link href="/events/new"
              className="bg-white text-[#FF6B35] text-sm font-black px-4 py-2 rounded-xl shadow-sm">
              + New
            </Link>
            <Link href="/profile">
              {me?.profilePic
                ? <img src={me.profilePic} className="w-10 h-10 rounded-full object-cover border-2 border-white/50" alt={me.firstName} />
                : <div className="w-10 h-10 rounded-full bg-white/20 border-2 border-white/50 flex items-center justify-center text-sm font-black text-white">
                    {me?.firstName?.[0] ?? "?"}
                  </div>
              }
            </Link>
          </div>
        </div>
      </div>

      {/* Event list */}
      <div className="px-4 py-5">
        {events.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <RunnerSvg className="w-16 h-20 text-gray-200 mx-auto" />
            <p className="text-gray-400 font-semibold">No races yet.</p>
            <Link href="/events/new" className="inline-block text-[#FF6B35] font-bold border border-[#FF6B35] px-4 py-2 rounded-xl text-sm">
              Create the first one →
            </Link>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="space-y-3 mb-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Upcoming</p>
            {upcoming.map((e) => <EventCard key={e.id} e={e} />)}
          </div>
        )}

        {past.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Past</p>
            {past.map((e) => <EventCard key={e.id} e={e} />)}
          </div>
        )}
      </div>
    </main>
  );
}
