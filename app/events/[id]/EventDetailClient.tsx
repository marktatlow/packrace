"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import type { RaceCardCommentary } from "@/lib/racecard";

type Participant = {
  id: string;
  userId: string;
  name: string;
  firstName: string;
  profilePic: string | null;
  predictedTimeSecs: number | null;
  actualTimeSecs: number | null;
  vdotPredictedSecs: number | null;
  personalBestSecs: number | null;
  resultFetchedAt: string | null;
};

type SortKey = "predicted" | "actual" | "diff" | "vdot" | "pb";

const labelStyles: Record<string, { bg: string; text: string; emoji: string }> = {
  SHARP:        { bg: "bg-green-500/20",  text: "text-green-400",  emoji: "⚡" },
  "DARK HORSE": { bg: "bg-purple-500/20", text: "text-purple-400", emoji: "🐴" },
  SANDBAGGING:  { bg: "bg-amber-500/20",  text: "text-amber-400",  emoji: "🎭" },
  PAP:          { bg: "bg-red-500/20",    text: "text-red-400",    emoji: "💩" },
};

type Props = {
  event: {
    id: string;
    name: string;
    distanceKm: number;
    date: string;
    windowStart: string;
    windowEnd: string;
    location: string | null;
  };
  participants: Participant[];
  currentUserId: string;
  isParticipant: boolean;
  inviteLink: string;
  windowStarted: boolean;
  windowEnded: boolean;
  raceCard: { commentary: string; generatedAt: string } | null;
};

function Avatar({ p }: { p: Participant }) {
  return p.profilePic
    ? <img src={p.profilePic} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt={p.firstName} />
    : <div className="w-8 h-8 rounded-full bg-[#2A2A4A] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">{p.firstName[0]}</div>;
}

function pctDiff(predicted: number, actual: number): number {
  return Math.abs((actual - predicted) / predicted) * 100;
}

export default function EventDetailClient({
  event, participants, currentUserId, isParticipant, inviteLink, windowStarted, windowEnded, raceCard: initialRaceCard
}: Props) {
  const [tab, setTab] = useState<"predict" | "leaderboard" | "tips">(windowEnded ? "leaderboard" : "predict");
  const [raceCard, setRaceCard] = useState(initialRaceCard);
  const commentary: RaceCardCommentary | null = raceCard ? JSON.parse(raceCard.commentary) : null;
  const [sort, setSort] = useState<SortKey>(windowEnded ? "actual" : "predicted");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [fetchingResults, setFetchingResults] = useState(false);
  const [refreshingEstimates, setRefreshingEstimates] = useState(false);
  const [generatingCard, setGeneratingCard] = useState(false);
  const [raceCardUrl, setRaceCardUrl] = useState<string | null>(null);
  const [cardCopied, setCardCopied] = useState(false);
  const [localParticipants, setLocalParticipants] = useState(participants);
  const [joined, setJoined] = useState(isParticipant);
  const predictInput = useRef<HTMLInputElement>(null);

  const me = localParticipants.find((p) => p.userId === currentUserId);
  const eventDate = new Date(event.date);

  // Compute Strava Est. for current user on mount if not yet stored
  useEffect(() => {
    if (!joined || me?.vdotPredictedSecs) return;
    fetch(`/api/events/${event.id}/strava-est`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.vdotPredictedSecs) {
          setLocalParticipants((prev) =>
            prev.map((p) => p.userId === currentUserId ? { ...p, vdotPredictedSecs: data.vdotPredictedSecs } : p)
          );
        }
      })
      .catch(() => {});
  }, [joined]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch live results every 15 min during active window
  useEffect(() => {
    if (!windowStarted || windowEnded) return;

    async function fetchLive() {
      try {
        // Trigger Strava pull
        await fetch("/api/results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: event.id }),
        });
        // Fetch updated participants without reloading the page
        const res = await fetch(`/api/events/${event.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data.participants)) return;
        setLocalParticipants((prev) =>
          prev.map((p) => {
            const updated = data.participants.find((u: { userId: string; actualTimeSecs: number | null; resultFetchedAt: string | null }) => u.userId === p.userId);
            if (!updated) return p;
            return { ...p, actualTimeSecs: updated.actualTimeSecs, resultFetchedAt: updated.resultFetchedAt };
          })
        );
      } catch { /* silent */ }
    }

    fetchLive();
    const interval = setInterval(fetchLive, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const windowEnd = new Date(event.windowEnd);
  const windowStart = new Date(event.windowStart);
  const hasAnyActual = localParticipants.some((p) => p.actualTimeSecs);

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function joinEvent() {
    setJoining(true);
    const res = await fetch(`/api/events/${event.id}/join`, { method: "POST" });
    if (res.ok) { setJoined(true); window.location.reload(); }
    setJoining(false);
  }

  async function savePrediction() {
    const val = predictInput.current?.value;
    if (!val) return;
    const parts = val.split(":").map(Number);
    const secs = parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + (parts[1] || 0);
    setSaving(true);
    await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predictedTimeSecs: secs }),
    });
    setLocalParticipants((prev) =>
      prev.map((p) => p.userId === currentUserId ? { ...p, predictedTimeSecs: secs } : p)
    );
    setSaving(false);
  }

  async function generateRaceCard() {
    setGeneratingCard(true);
    const res = await fetch(`/api/events/${event.id}/racecard`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setRaceCard({ commentary: data.commentary, generatedAt: data.generatedAt });
      setTab("tips");
    }
    const url = `${window.location.origin}/race-card/${event.id}`;
    setRaceCardUrl(url);
    setGeneratingCard(false);
  }

  async function copyRaceCard() {
    if (!raceCardUrl) return;
    await navigator.clipboard.writeText(raceCardUrl);
    setCardCopied(true);
    setTimeout(() => setCardCopied(false), 2000);
  }

  async function refreshEstimates() {
    setRefreshingEstimates(true);
    await fetch(`/api/events/${event.id}/refresh-estimates`, { method: "POST" });
    const res = await fetch(`/api/events/${event.id}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.participants)) {
        setLocalParticipants((prev) =>
          prev.map((p) => {
            const u = data.participants.find((x: { userId: string; vdotPredictedSecs: number | null }) => x.userId === p.userId);
            return u ? { ...p, vdotPredictedSecs: u.vdotPredictedSecs } : p;
          })
        );
      }
    }
    setRefreshingEstimates(false);
  }

  async function fetchResults() {
    setFetchingResults(true);
    await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id }),
    });
    const res = await fetch(`/api/events/${event.id}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.participants)) {
        setLocalParticipants((prev) =>
          prev.map((p) => {
            const u = data.participants.find((x: { userId: string; actualTimeSecs: number | null; resultFetchedAt: string | null }) => x.userId === p.userId);
            return u ? { ...p, actualTimeSecs: u.actualTimeSecs, resultFetchedAt: u.resultFetchedAt } : p;
          })
        );
      }
    }
    setFetchingResults(false);
  }

  const hasAnyVdot = localParticipants.some((p) => p.vdotPredictedSecs);
  const hasAnyPb = localParticipants.some((p) => p.personalBestSecs);

  // Sort leaderboard
  const sorted = [...localParticipants].sort((a, b) => {
    if (sort === "predicted") {
      if (!a.predictedTimeSecs) return 1;
      if (!b.predictedTimeSecs) return -1;
      return a.predictedTimeSecs - b.predictedTimeSecs;
    }
    if (sort === "actual") {
      if (!a.actualTimeSecs) return 1;
      if (!b.actualTimeSecs) return -1;
      return a.actualTimeSecs - b.actualTimeSecs;
    }
    if (sort === "vdot") {
      if (!a.vdotPredictedSecs) return 1;
      if (!b.vdotPredictedSecs) return -1;
      return a.vdotPredictedSecs - b.vdotPredictedSecs;
    }
    if (sort === "pb") {
      if (!a.personalBestSecs) return 1;
      if (!b.personalBestSecs) return -1;
      return a.personalBestSecs - b.personalBestSecs;
    }
    // diff
    if (!a.predictedTimeSecs || !a.actualTimeSecs) return 1;
    if (!b.predictedTimeSecs || !b.actualTimeSecs) return -1;
    return pctDiff(a.predictedTimeSecs, a.actualTimeSecs) - pctDiff(b.predictedTimeSecs, b.actualTimeSecs);
  });

  const tabClass = (t: string) =>
    `flex-1 py-3 text-sm font-semibold transition-colors ${tab === t ? "text-[#FF6B35] border-b-2 border-[#FF6B35]" : "text-gray-500 border-b-2 border-transparent"}`;

  const sortBtn = (key: SortKey) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${sort === key ? "bg-[#FF6B35] text-white" : "bg-[#0D0D0D] text-gray-400 border border-[#2A2A4A]"}`;

  return (
    <main className="min-h-screen bg-[#0D0D0D] max-w-[430px] mx-auto pb-10">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/events" className="text-gray-400 text-xl">←</Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-white truncate">{event.name}</h1>
            <p className="text-gray-400 text-sm">
              {event.distanceKm}km · {eventDate.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
              {event.location && ` · ${event.location}`}
            </p>
          </div>
          {windowStarted && !windowEnded && (
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-500/20 text-green-400 whitespace-nowrap">Live</span>
          )}
          {windowEnded && (
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-500/20 text-gray-400 whitespace-nowrap">Ended</span>
          )}
        </div>

        <div className="flex border-b border-[#2A2A4A]">
          <button className={tabClass("predict")} onClick={() => setTab("predict")}>Predict</button>
          <button className={tabClass("leaderboard")} onClick={() => setTab("leaderboard")}>Leaderboard</button>
          <button className={tabClass("tips")} onClick={() => setTab("tips")}>
            🎙️ Tips{commentary && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#FF6B35] inline-block align-middle" />}
          </button>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Join banner */}
        {!joined && (
          <div className="bg-[#1A1A2E] border border-[#FF6B35] rounded-2xl p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-300">You're not in this event yet.</p>
            <button onClick={joinEvent} disabled={joining}
              className="bg-[#FF6B35] text-white font-bold px-4 py-2 rounded-xl text-sm whitespace-nowrap disabled:opacity-50">
              {joining ? "Joining..." : "Join Event"}
            </button>
          </div>
        )}

        {/* PREDICT TAB */}
        {tab === "predict" && (
          <>
            {/* Invite */}
            <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Invite friends</p>
              <div className="flex gap-2 items-center">
                <p className="text-xs text-gray-300 flex-1 truncate font-mono">{inviteLink}</p>
                <button onClick={copyInvite} className="bg-[#FF6B35] text-white text-xs font-bold px-3 py-2 rounded-lg whitespace-nowrap">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* My prediction */}
            {me && joined && (
              <div className="bg-[#1A1A2E] border-2 border-[#FF6B35] rounded-2xl p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">Your prediction</p>
                {me.predictedTimeSecs ? (
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-black text-white">{formatTime(me.predictedTimeSecs)}</span>
                    {!windowStarted && (
                      <button onClick={() => predictInput.current?.focus()}
                        className="text-xs text-[#FF6B35] border border-[#FF6B35] px-3 py-1 rounded-lg">
                        Edit
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm mb-3">No prediction yet — enter one below</p>
                )}

                {!windowStarted && (
                  <div className="mt-3 flex gap-2">
                    <input ref={predictInput} placeholder="mm:ss or h:mm:ss"
                      className="flex-1 bg-[#0D0D0D] border border-[#2A2A4A] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FF6B35]" />
                    <button onClick={savePrediction} disabled={saving}
                      className="bg-[#FF6B35] text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50">
                      {saving ? "..." : "Save"}
                    </button>
                  </div>
                )}
                {windowStarted && !windowEnded && (
                  <p className="text-xs text-amber-400 mt-2">🔒 Predictions locked — window is open</p>
                )}
                {windowEnded && (
                  <p className="text-xs text-gray-500 mt-2">🏁 Window closed</p>
                )}
              </div>
            )}

            {/* Window info */}
            <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-gray-300">Activity window</p>
              <p>Opens: {windowStart.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              <p>Closes: {windowEnd.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-gray-500 pt-1">Predictions lock when the window opens. Results pull from Strava after it closes.</p>
            </div>

            {/* Race card */}
            {joined && (
              <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-white">🎙️ Race Card</p>
                    <p className="text-xs text-gray-500">AI tipster commentary for the group</p>
                  </div>
                  <button
                    onClick={generateRaceCard}
                    disabled={generatingCard}
                    className="bg-[#FF6B35] text-white text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-50 whitespace-nowrap"
                  >
                    {generatingCard ? "Generating..." : "Generate"}
                  </button>
                </div>
                {raceCardUrl && (
                  <div className="flex gap-2 items-center mt-2">
                    <p className="text-xs text-gray-300 flex-1 truncate font-mono">{raceCardUrl}</p>
                    <button onClick={copyRaceCard} className="bg-[#2A2A4A] text-white text-xs font-bold px-3 py-2 rounded-lg whitespace-nowrap">
                      {cardCopied ? "Copied!" : "Copy link"}
                    </button>
                  </div>
                )}
                {!raceCardUrl && (
                  <a href={`/race-card/${event.id}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[#FF6B35] underline">
                    View race card →
                  </a>
                )}
              </div>
            )}
          </>
        )}

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" && (
          <>
            {windowStarted && !windowEnded && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <span className="text-green-400 text-xs font-semibold">Live — pulling results every 15 min</span>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={refreshEstimates} disabled={refreshingEstimates}
                className="flex-1 bg-[#1A1A2E] border border-[#2A2A4A] text-gray-300 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors">
                {refreshingEstimates ? "Refreshing..." : "⚡ Refresh Str. Est."}
              </button>
              {(windowStarted || windowEnded) && (
                <button onClick={fetchResults} disabled={fetchingResults}
                  className="flex-1 bg-[#1A1A2E] border border-[#2A2A4A] text-gray-300 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors">
                  {fetchingResults ? "Fetching..." : "🔄 Refresh Results"}
                </button>
              )}
            </div>

            {/* Leaderboard — fixed grid, no scroll */}
            <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl overflow-hidden">
              {/* Column headers — tappable to sort */}
              {/* Grid: rank(20) | name(flex) | Est(42) | Actual(42) | Diff(36) | Str.Est(42) | PB(36) */}
              <div className="grid grid-cols-[20px_1fr_42px_42px_36px_46px_36px] items-center px-2 py-2 border-b border-[#2A2A4A] gap-x-1">
                <span />
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Name</span>
                <button onClick={() => setSort("predicted")} className="text-right">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${sort === "predicted" ? "text-[#FF6B35]" : "text-gray-500"}`}>Est.</span>
                </button>
                <button onClick={() => hasAnyActual && setSort("actual")} className="text-right">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${sort === "actual" ? "text-[#FF6B35]" : "text-gray-500"} ${!hasAnyActual ? "opacity-30" : ""}`}>Act.</span>
                </button>
                <button onClick={() => hasAnyActual && setSort("diff")} className="text-right">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${sort === "diff" ? "text-[#FF6B35]" : "text-gray-500"} ${!hasAnyActual ? "opacity-30" : ""}`}>Diff</span>
                </button>
                <button onClick={() => hasAnyVdot && setSort("vdot")} className="text-right">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${sort === "vdot" ? "text-[#FF6B35]" : "text-gray-500"} ${!hasAnyVdot ? "opacity-30" : ""}`}>Str.Est</span>
                </button>
                <button onClick={() => hasAnyPb && setSort("pb")} className="text-right">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${sort === "pb" ? "text-[#FF6B35]" : "text-gray-500"} ${!hasAnyPb ? "opacity-30" : ""}`}>PB</span>
                </button>
              </div>

              {sorted.length === 0 && (
                <p className="text-center text-gray-500 text-sm py-8">No participants yet.</p>
              )}

              {sorted.map((p, idx) => {
                const isMe = p.userId === currentUserId;
                const hasBoth = p.predictedTimeSecs && p.actualTimeSecs;
                const diff = hasBoth ? pctDiff(p.predictedTimeSecs!, p.actualTimeSecs!) : null;
                const medal = sort === "diff" && diff !== null
                  ? (idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`)
                  : `${idx + 1}`;

                return (
                  <div key={p.id}
                    className={`grid grid-cols-[20px_1fr_42px_42px_36px_46px_36px] items-center px-2 py-2.5 border-b border-[#2A2A4A] last:border-0 gap-x-1 ${isMe ? "bg-[#FF6B35]/5" : ""}`}>
                    <span className="text-[11px] text-gray-500 text-center">{medal}</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      {p.profilePic
                        ? <img src={p.profilePic} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />
                        : <div className="w-6 h-6 rounded-full bg-[#2A2A4A] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">{p.firstName[0]}</div>
                      }
                      <span className={`text-xs truncate font-medium ${isMe ? "text-[#FF6B35]" : "text-white"}`}>{p.firstName}</span>
                    </div>
                    <span className={`text-[11px] text-right tabular-nums ${sort === "predicted" ? "text-white font-bold" : "text-gray-400"}`}>
                      {p.predictedTimeSecs ? formatTime(p.predictedTimeSecs) : <span className="text-gray-700">—</span>}
                    </span>
                    <span className={`text-[11px] text-right tabular-nums ${sort === "actual" ? "text-white font-bold" : "text-gray-400"}`}>
                      {p.actualTimeSecs ? formatTime(p.actualTimeSecs) : <span className="text-gray-700">—</span>}
                    </span>
                    <span className={`text-[11px] text-right font-bold tabular-nums ${diff === null ? "text-gray-700" : diff < 1 ? "text-green-400" : diff < 3 ? "text-amber-400" : "text-[#E63946]"}`}>
                      {diff !== null ? `${diff.toFixed(1)}%` : "—"}
                    </span>
                    <span className={`text-[11px] text-right tabular-nums ${sort === "vdot" ? "text-white font-bold" : "text-gray-400"}`}>
                      {p.vdotPredictedSecs ? formatTime(p.vdotPredictedSecs) : <span className="text-gray-700">—</span>}
                    </span>
                    <span className={`text-[11px] text-right tabular-nums ${sort === "pb" ? "text-white font-bold" : "text-gray-400"}`}>
                      {p.personalBestSecs ? formatTime(p.personalBestSecs) : <span className="text-gray-700">—</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* TIPS TAB */}
        {tab === "tips" && (
          <>
            {/* Generate / share controls */}
            {joined && (
              <div className="flex gap-2">
                <button onClick={generateRaceCard} disabled={generatingCard}
                  className="flex-1 bg-[#FF6B35] text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-50">
                  {generatingCard ? "Generating..." : commentary ? "Regenerate" : "Generate Tips"}
                </button>
                {commentary && (
                  <button onClick={copyRaceCard}
                    className="bg-[#1A1A2E] border border-[#2A2A4A] text-gray-300 font-semibold px-4 py-3 rounded-2xl text-sm hover:border-[#FF6B35] transition-colors">
                    {cardCopied ? "Copied!" : "Share link"}
                  </button>
                )}
              </div>
            )}

            {commentary ? (
              <>
                <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
                  <p className="text-gray-300 text-sm leading-relaxed italic">{commentary.intro}</p>
                </div>

                <div className="space-y-3">
                  {commentary.tips.map((tip, idx) => {
                    const style = tip.label ? labelStyles[tip.label] : null;
                    return (
                      <div key={idx} className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-white">{tip.name}</span>
                          {style && tip.label && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                              {style.emoji} {tip.label}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">{tip.tip}</p>
                      </div>
                    );
                  })}
                </div>

                <p className="text-center text-xs text-gray-600">
                  Generated {new Date(raceCard!.generatedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </>
            ) : (
              <div className="text-center py-12 space-y-3">
                <div className="text-4xl">🎙️</div>
                <p className="text-gray-400 text-sm">No tips yet.</p>
                {joined && <p className="text-gray-600 text-xs">Tap "Generate Tips" above — Tip will size up every runner.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
