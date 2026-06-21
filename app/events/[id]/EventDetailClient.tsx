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

type SortKey = "predicted" | "actual" | "diff";

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

export default function EventDetailClient({
  event, participants, currentUserId, isParticipant, inviteLink, windowStarted, windowEnded, raceCard: initialRaceCard
}: Props) {
  const [raceCard, setRaceCard] = useState(initialRaceCard);
  const commentary: RaceCardCommentary | null = raceCard ? JSON.parse(raceCard.commentary) : null;
  const [sort, setSort] = useState<SortKey>("diff");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [fetchingResults, setFetchingResults] = useState(false);
  const [refreshingEstimates, setRefreshingEstimates] = useState(false);
  const [generatingCard, setGeneratingCard] = useState(false);
  const [cardCopied, setCardCopied] = useState(false);
  const [localParticipants, setLocalParticipants] = useState(participants);
  const [joined, setJoined] = useState(isParticipant);
  const predictInput = useRef<HTMLInputElement>(null);

  const me = localParticipants.find((p) => p.userId === currentUserId);
  const eventDate = new Date(event.date);
  const windowStart = new Date(event.windowStart);
  const windowEnd = new Date(event.windowEnd);
  const hasAnyActual = localParticipants.some((p) => p.actualTimeSecs);

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

  // Auto-fetch live results every 5 min during active window
  useEffect(() => {
    if (!windowStarted || windowEnded) return;

    async function fetchLive() {
      try {
        const res = await fetch(`/api/events/${event.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data.participants)) return;

        const missingResult = data.participants.some(
          (u: { actualTimeSecs: number | null }) => !u.actualTimeSecs
        );

        if (missingResult) {
          await fetch("/api/results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: event.id }),
          });
          const res2 = await fetch(`/api/events/${event.id}`);
          if (!res2.ok) return;
          const data2 = await res2.json();
          if (Array.isArray(data2.participants)) {
            setLocalParticipants((prev) =>
              prev.map((p) => {
                const u = data2.participants.find((x: { userId: string; actualTimeSecs: number | null; resultFetchedAt: string | null }) => x.userId === p.userId);
                return u ? { ...p, actualTimeSecs: u.actualTimeSecs, resultFetchedAt: u.resultFetchedAt } : p;
              })
            );
          }
        } else {
          setLocalParticipants((prev) =>
            prev.map((p) => {
              const u = data.participants.find((x: { userId: string; actualTimeSecs: number | null; resultFetchedAt: string | null }) => x.userId === p.userId);
              return u ? { ...p, actualTimeSecs: u.actualTimeSecs, resultFetchedAt: u.resultFetchedAt } : p;
            })
          );
        }
      } catch { /* silent */ }
    }

    fetchLive();
    const interval = setInterval(fetchLive, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    }
    setGeneratingCard(false);
  }

  async function copyRaceCard() {
    await navigator.clipboard.writeText(`${window.location.origin}/race-card/${event.id}`);
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

  // Sort participants
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
    // diff — closest prediction first
    const aDiff = a.predictedTimeSecs && a.actualTimeSecs ? Math.abs(a.actualTimeSecs - a.predictedTimeSecs) : Infinity;
    const bDiff = b.predictedTimeSecs && b.actualTimeSecs ? Math.abs(b.actualTimeSecs - b.predictedTimeSecs) : Infinity;
    return aDiff - bDiff;
  });

  // Badges
  const withResults = sorted.filter((p) => p.predictedTimeSecs && p.actualTimeSecs);
  const winner = withResults[0] ?? null;
  const fastest = withResults.length > 0
    ? withResults.reduce((best, p) => p.actualTimeSecs! < best.actualTimeSecs! ? p : best, withResults[0])
    : null;
  const sandbagger = withResults.length > 1
    ? withResults.reduce((worst, p) => {
        const gap = p.actualTimeSecs! - p.predictedTimeSecs!;
        const worstGap = worst.actualTimeSecs! - worst.predictedTimeSecs!;
        return gap > worstGap ? p : worst;
      }, withResults[0])
    : null;
  const pbAlert = withResults.find(
    (p) => p.personalBestSecs && p.actualTimeSecs && p.actualTimeSecs < p.personalBestSecs
  ) ?? null;

  const rankIcon = (idx: number) => idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;

  return (
    <main className="min-h-screen bg-[#0D0D0D] max-w-[430px] mx-auto pb-16">

      {/* ── TOP HEADER ── */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/events" className="text-gray-500 text-lg leading-none">←</Link>
          <span className="text-xs font-bold text-[#FF6B35] uppercase tracking-widest">PackRace</span>
        </div>
        <h1 className="text-2xl font-black text-white leading-tight">{event.name}</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {eventDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          {" · "}{event.distanceKm}km
          {event.location && ` · ${event.location}`}
        </p>

        {/* Status pill */}
        <div className="mt-3">
          {windowEnded ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-gray-500/20 text-gray-400">
              🏁 Race Finished
            </span>
          ) : windowStarted ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-green-500/20 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live Results
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-[#FF6B35]/20 text-[#FF6B35]">
              📅 Predictions Open
            </span>
          )}
        </div>
      </div>

      {/* ── JOIN BANNER ── */}
      {!joined && (
        <div className="mx-4 mb-4 bg-[#1A1A2E] border border-[#FF6B35] rounded-2xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-gray-300">You&apos;re not in this event yet.</p>
          <button onClick={joinEvent} disabled={joining}
            className="bg-[#FF6B35] text-white font-bold px-4 py-2 rounded-xl text-sm whitespace-nowrap disabled:opacity-50">
            {joining ? "Joining..." : "Join Event"}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════
          SECTION 1 — YOUR PREDICTION
      ══════════════════════════════════════ */}
      {joined && (
        <section className="px-4 mb-6">
          <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Your Prediction</p>

          <div className={`bg-[#1A1A2E] rounded-2xl p-4 border ${windowStarted ? "border-[#2A2A4A]" : "border-[#FF6B35]"}`}>
            {me?.predictedTimeSecs ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-black text-white tabular-nums">{formatTime(me.predictedTimeSecs)}</p>
                  {me.vdotPredictedSecs && (
                    <p className="text-xs text-gray-500 mt-1">Strava est. {formatTime(me.vdotPredictedSecs)}</p>
                  )}
                </div>
                {!windowStarted && (
                  <button onClick={() => predictInput.current?.focus()}
                    className="text-xs text-[#FF6B35] border border-[#FF6B35] px-3 py-1.5 rounded-lg">
                    Edit
                  </button>
                )}
                {windowStarted && !windowEnded && (
                  <span className="text-xs text-amber-400 font-semibold">🔒 Locked</span>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No prediction yet — enter one below</p>
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
          </div>

          {/* Window info */}
          {!windowStarted && (
            <p className="text-xs text-gray-600 mt-2 text-center">
              Window opens {windowStart.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════
          SECTION 2 — RESULTS / LEADERBOARD
      ══════════════════════════════════════ */}
      <section className="px-4 mb-6">
        {/* Section header */}
        <div className="mb-3">
          {windowEnded ? (
            <>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Post-Race Results</p>
              <p className="text-xl font-black text-white">Predictions vs. Actual</p>
            </>
          ) : windowStarted ? (
            <>
              <p className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Live</p>
              <p className="text-xl font-black text-white">Predictions vs. Actual</p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Pre-Race</p>
              <p className="text-xl font-black text-white">Prediction Challenge</p>
            </>
          )}
        </div>

        {/* Winner hero card */}
        {winner && hasAnyActual && (
          <div className="bg-gradient-to-br from-[#FF6B35]/20 to-transparent border-2 border-[#FF6B35] rounded-2xl p-4 mb-4">
            <p className="text-[10px] font-bold text-[#FF6B35] uppercase tracking-widest mb-3">👑 Winner — Closest Prediction</p>
            <div className="flex items-center gap-3">
              {winner.profilePic
                ? <img src={winner.profilePic} className="w-14 h-14 rounded-full object-cover border-2 border-[#FF6B35] flex-shrink-0" alt="" />
                : <div className="w-14 h-14 rounded-full bg-[#2A2A4A] border-2 border-[#FF6B35] flex items-center justify-center text-xl font-black text-white flex-shrink-0">{winner.firstName[0]}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-lg font-black text-white">{winner.firstName}</p>
                <p className="text-xs text-gray-400">
                  Predicted {formatTime(winner.predictedTimeSecs!)} · Missed by{" "}
                  <span className="text-green-400 font-bold">{Math.abs(winner.actualTimeSecs! - winner.predictedTimeSecs!)}s</span>
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-3xl font-black text-white tabular-nums">{formatTime(winner.actualTimeSecs!)}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Actual</p>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard table */}
        <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[32px_1fr_56px_56px_48px] items-center px-3 py-2.5 border-b border-[#2A2A4A]">
            <span />
            <button onClick={() => setSort("predicted")} className="text-left">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${sort === "predicted" ? "text-[#FF6B35]" : "text-gray-500"}`}>Runner</span>
            </button>
            <button onClick={() => setSort("predicted")} className="text-right">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${sort === "predicted" ? "text-[#FF6B35]" : "text-gray-500"}`}>Pred.</span>
            </button>
            <button onClick={() => hasAnyActual && setSort("actual")} className="text-right">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${sort === "actual" ? "text-[#FF6B35]" : "text-gray-500"} ${!hasAnyActual ? "opacity-30" : ""}`}>Result</span>
            </button>
            <button onClick={() => hasAnyActual && setSort("diff")} className="text-right">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${sort === "diff" ? "text-[#FF6B35]" : "text-gray-500"} ${!hasAnyActual ? "opacity-30" : ""}`}>Off by</span>
            </button>
          </div>

          {sorted.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-8">No participants yet.</p>
          )}

          {sorted.map((p, idx) => {
            const isMe = p.userId === currentUserId;
            const diffSecs = p.predictedTimeSecs && p.actualTimeSecs
              ? Math.abs(p.actualTimeSecs - p.predictedTimeSecs) : null;
            const isWinner = winner?.userId === p.userId && hasAnyActual;
            const isFastest = fastest?.userId === p.userId && withResults.length > 1;
            const isSandbagger = sandbagger?.userId === p.userId && withResults.length > 1;
            const isPb = pbAlert?.userId === p.userId;

            return (
              <div key={p.id} className={`border-b border-[#2A2A4A] last:border-0 ${isMe ? "bg-[#FF6B35]/5" : ""}`}>
                <div className="grid grid-cols-[32px_1fr_56px_56px_48px] items-center px-3 py-3 gap-x-1">
                  <span className="text-base text-center leading-none">{rankIcon(idx)}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    {p.profilePic
                      ? <img src={p.profilePic} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                      : <div className="w-8 h-8 rounded-full bg-[#2A2A4A] flex items-center justify-center text-xs font-black text-white flex-shrink-0">{p.firstName[0]}</div>
                    }
                    <span className={`text-sm font-bold truncate ${isMe ? "text-[#FF6B35]" : "text-white"}`}>{p.firstName}</span>
                  </div>
                  <span className={`text-xs text-right tabular-nums ${sort === "predicted" ? "text-white font-bold" : "text-gray-500"}`}>
                    {p.predictedTimeSecs ? formatTime(p.predictedTimeSecs) : <span className="text-gray-700">—</span>}
                  </span>
                  <span className={`text-sm text-right tabular-nums font-bold ${p.actualTimeSecs ? "text-white" : "text-gray-700"}`}>
                    {p.actualTimeSecs ? formatTime(p.actualTimeSecs) : "—"}
                  </span>
                  <span className={`text-xs text-right font-bold tabular-nums ${
                    diffSecs === null ? "text-gray-700"
                    : diffSecs <= 15 ? "text-green-400"
                    : diffSecs <= 45 ? "text-amber-400"
                    : "text-[#E63946]"
                  }`}>
                    {diffSecs !== null ? `${diffSecs}s` : "—"}
                  </span>
                </div>
                {/* Badges */}
                {(isWinner || isFastest || isSandbagger || isPb) && (
                  <div className="flex gap-1.5 px-3 pb-2.5 flex-wrap">
                    {isWinner   && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF6B35]/20 text-[#FF6B35]">👑 CLOSEST PREDICTION</span>}
                    {isFastest  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">⚡ FASTEST RUNNER</span>}
                    {isSandbagger && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">🎭 BIGGEST SANDBAGGER</span>}
                    {isPb       && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">🏅 NEW PB</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live refresh / ended refresh row */}
        {(windowStarted || windowEnded) && (
          <button onClick={fetchResults} disabled={fetchingResults}
            className="mt-3 w-full text-xs text-gray-600 font-semibold py-2 rounded-xl border border-[#2A2A4A] hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors disabled:opacity-40">
            {fetchingResults ? "Fetching results…" : "🔄 Refresh Results"}
          </button>
        )}

        {/* Stat chips */}
        {withResults.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {fastest && withResults.length > 1 && (
              <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-3">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">⚡ Fastest Runner</p>
                <p className="text-white font-bold">{fastest.firstName}</p>
                <p className="text-blue-400 font-black text-xl tabular-nums">{formatTime(fastest.actualTimeSecs!)}</p>
              </div>
            )}
            {sandbagger && (
              <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-3">
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">🎭 Biggest Sandbagger</p>
                <p className="text-white font-bold">{sandbagger.firstName}</p>
                <p className="text-amber-400 font-black text-xl tabular-nums">
                  +{sandbagger.actualTimeSecs! - sandbagger.predictedTimeSecs!}s
                </p>
              </div>
            )}
            {pbAlert && (
              <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-3 col-span-2">
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">🏅 PB Alert</p>
                <p className="text-white font-bold">{pbAlert.firstName} set a new personal best!</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════
          SECTION 3 — TIPS (AI Commentary)
      ══════════════════════════════════════ */}
      <section className="px-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">AI Tipster</p>
            <p className="text-xl font-black text-white">🎙️ Tips</p>
          </div>
          {joined && (
            <div className="flex gap-2">
              <button onClick={generateRaceCard} disabled={generatingCard}
                className="bg-[#FF6B35] text-white text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-50 whitespace-nowrap">
                {generatingCard ? "Generating…" : commentary ? "Regenerate" : "Generate"}
              </button>
              {commentary && (
                <button onClick={copyRaceCard}
                  className="bg-[#1A1A2E] border border-[#2A2A4A] text-gray-300 text-xs font-semibold px-3 py-2 rounded-xl hover:border-[#FF6B35] transition-colors whitespace-nowrap">
                  {cardCopied ? "Copied!" : "Share link"}
                </button>
              )}
            </div>
          )}
        </div>

        {commentary ? (
          <div className="space-y-3">
            <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
              <p className="text-gray-300 text-sm leading-relaxed italic">{commentary.intro}</p>
            </div>
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
            <p className="text-center text-xs text-gray-700">
              Generated {new Date(raceCard!.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ) : (
          <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-6 text-center">
            <p className="text-3xl mb-2">🎙️</p>
            <p className="text-gray-500 text-sm">No tips yet.</p>
            {joined && <p className="text-gray-700 text-xs mt-1">Tap Generate above — Tips will size up every runner.</p>}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════
          SECTION 4 — ACTIONS
      ══════════════════════════════════════ */}
      <section className="px-4 space-y-3">
        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Event</p>

        {/* Invite link */}
        <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
          <p className="text-xs text-gray-500 font-semibold mb-2">Invite Friends</p>
          <div className="flex gap-2 items-center">
            <p className="text-xs text-gray-400 flex-1 truncate font-mono">{inviteLink}</p>
            <button onClick={copyInvite} className="bg-[#FF6B35] text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Window info */}
        <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 text-xs text-gray-500 space-y-1">
          <p className="text-gray-400 font-semibold">Activity Window</p>
          <p>Opens: {windowStart.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          <p>Closes: {windowEnd.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        </div>

        {/* Strava Est refresh */}
        <button onClick={refreshEstimates} disabled={refreshingEstimates}
          className="w-full bg-[#1A1A2E] border border-[#2A2A4A] text-gray-600 font-semibold py-2.5 rounded-xl text-xs disabled:opacity-40 hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors">
          {refreshingEstimates ? "Refreshing Strava estimates…" : "⚡ Refresh Strava Estimates"}
        </button>
      </section>
    </main>
  );
}
