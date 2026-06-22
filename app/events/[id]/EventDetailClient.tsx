"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import type { RaceCardCommentary } from "@/lib/racecard";
import WaiverModal from "@/app/components/WaiverModal";
import RunnerCard, { ReactionBar } from "./RunnerCard";
import type { ReactionsMap, CommentsMap } from "./page";
import CommentThread from "./CommentThread";

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
  initialReactions: ReactionsMap;
  initialComments: CommentsMap;
};

export default function EventDetailClient({
  event, participants, currentUserId, isParticipant, inviteLink, windowStarted, windowEnded, raceCard: initialRaceCard, initialReactions, initialComments
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
  const [showWaiver, setShowWaiver] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [reactions, setReactions] = useState<ReactionsMap>(initialReactions);
  const predictInput = useRef<HTMLInputElement>(null);

  const handleReact = useCallback(async (targetType: "runner" | "tipster", targetId: string, emoji: string) => {
    // Optimistic update
    setReactions((prev) => {
      const current = prev[targetId]?.[emoji] ?? { count: 0, mine: false };
      const mine = !current.mine;
      return {
        ...prev,
        [targetId]: {
          ...prev[targetId],
          [emoji]: { count: current.count + (mine ? 1 : -1), mine },
        },
      };
    });
    // Persist
    await fetch("/api/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, targetType, targetId, emoji }),
    });
  }, [event.id]);

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
    setShowWaiver(false);
    const res = await fetch(`/api/events/${event.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waiverAccepted: true }),
    });
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
  const winner = withResults[0] ?? null; // closest prediction (sorted by diff)
  const fastest = withResults.length > 0
    ? withResults.reduce((best, p) => p.actualTimeSecs! < best.actualTimeSecs! ? p : best, withResults[0])
    : null;
  // Dark horse: beat Tips' estimate by the most (vdotPredictedSecs - actualTimeSecs, highest positive margin)
  const darkHorse = withResults.length > 0
    ? withResults
        .filter((p) => p.vdotPredictedSecs && p.actualTimeSecs! < p.vdotPredictedSecs)
        .sort((a, b) => (b.vdotPredictedSecs! - b.actualTimeSecs!) - (a.vdotPredictedSecs! - a.actualTimeSecs!))[0] ?? null
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


  return (
    <main className="min-h-screen bg-[#F7F5F2] max-w-[430px] mx-auto pb-16">

      {/* ── HERO BANNER ── */}
      <div className="relative bg-[#FF6B35] overflow-hidden">
        {/* Decorative runners */}
        <svg viewBox="0 0 80 100" className="absolute right-4 top-2 w-20 h-24 text-white opacity-10 -rotate-3" fill="currentColor">
          <circle cx="52" cy="10" r="9"/><path d="M52 19 C48 30 40 38 34 48 L26 68" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/><path d="M44 30 L60 22 M40 42 L28 38" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M34 48 L46 70 L42 86" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/><path d="M26 68 L14 82" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
        </svg>
        <svg viewBox="0 0 80 100" className="absolute right-20 bottom-0 w-12 h-16 text-white opacity-10 rotate-6" fill="currentColor">
          <circle cx="52" cy="10" r="9"/><path d="M52 19 C48 30 40 38 34 48 L26 68" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/><path d="M44 30 L60 22 M40 42 L28 38" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M34 48 L46 70 L42 86" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/><path d="M26 68 L14 82" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
        </svg>
        {/* Dashed finish line at bottom */}
        <div className="absolute bottom-0 left-0 right-0 flex gap-2 px-4 py-1 opacity-20">
          {Array.from({length: 20}).map((_, i) => <div key={i} className="h-2 flex-1 bg-white rounded-full"/>)}
        </div>

        <div className="px-4 pt-10 pb-8">
          <Link href="/events" className="inline-flex items-center gap-1 text-white/70 text-xs font-semibold mb-4">
            ← All Races
          </Link>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-white text-2xl font-black leading-tight">{event.name}</h1>
              <p className="text-white/70 text-sm mt-1">
                {eventDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                {" · "}{event.distanceKm}km
                {event.location && ` · ${event.location}`}
              </p>
              <p className="text-white/50 text-xs mt-0.5">
                Window {windowStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}–{windowEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            {/* Status badge */}
            <div className="shrink-0 mt-1">
              {windowEnded ? (
                <span className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-white/20 text-white">🏁 Finished</span>
              ) : windowStarted ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-green-400 text-white">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"/>Live
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-white/20 text-white">📅 Open</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── WAIVER MODAL ── */}
      {showWaiver && (
        <WaiverModal
          onAccept={joinEvent}
          onCancel={() => setShowWaiver(false)}
        />
      )}

      {/* ── JOIN BANNER ── */}
      {!joined && (
        <div className="mx-4 mt-4 bg-white border-2 border-[#FF6B35] rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm">
          <p className="text-sm text-gray-700 font-semibold">You&apos;re not in this race yet.</p>
          <button onClick={() => setShowWaiver(true)} disabled={joining}
            className="bg-[#FF6B35] text-white font-black px-4 py-2 rounded-xl text-sm whitespace-nowrap disabled:opacity-50 shadow-sm">
            {joining ? "Joining..." : "Join Race"}
          </button>
        </div>
      )}

      <div className="px-4 py-5 space-y-6">

        {/* ══ SECTION 1 — YOUR PREDICTION ══ */}
        {joined && (
          <section>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Your Prediction</p>
            <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border ${!windowStarted ? "border-[#FF6B35]" : "border-gray-100"}`}>
              {!windowStarted && <div className="h-1 bg-[#FF6B35]" />}
              {windowStarted && !windowEnded && <div className="h-1 bg-green-400" />}
              {windowEnded && <div className="h-1 bg-gray-200" />}
              <div className="p-4">
                {me?.predictedTimeSecs ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-4xl font-black text-gray-900 tabular-nums">{formatTime(me.predictedTimeSecs)}</p>
                      {me.vdotPredictedSecs && (
                        <p className="text-xs text-gray-400 mt-1">Strava est. {formatTime(me.vdotPredictedSecs)}</p>
                      )}
                    </div>
                    {!windowStarted && (
                      <button onClick={() => predictInput.current?.focus()}
                        className="text-xs text-[#FF6B35] border border-[#FF6B35] px-3 py-1.5 rounded-lg font-semibold">
                        Edit
                      </button>
                    )}
                    {windowStarted && !windowEnded && (
                      <span className="text-xs text-amber-500 font-black bg-amber-50 px-3 py-1.5 rounded-lg">🔒 Locked</span>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No prediction yet — enter one below</p>
                )}
                {!windowStarted && (
                  <div className="mt-3 flex gap-2">
                    <input ref={predictInput} placeholder="mm:ss or h:mm:ss"
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[#FF6B35]" />
                    <button onClick={savePrediction} disabled={saving}
                      className="bg-[#FF6B35] text-white text-sm font-black px-4 py-2 rounded-xl disabled:opacity-50 shadow-sm">
                      {saving ? "…" : "Save"}
                    </button>
                  </div>
                )}
                {!windowStarted && (
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Locks when window opens · {windowStart.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ══ SECTION 2 — RESULTS ══ */}
        <section>
          {/* Section header */}
          <div className="flex items-baseline justify-between mb-3">
            <div>
              {windowEnded
                ? <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Post-Race Results</p>
                : windowStarted
                ? <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">● Live</p>
                : <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pre-Race</p>
              }
              <p className="text-xl font-black text-gray-900">Predictions vs. Actual</p>
            </div>
            {(windowStarted || windowEnded) && (
              <button onClick={fetchResults} disabled={fetchingResults}
                className="text-xs text-[#FF6B35] font-bold disabled:opacity-40">
                {fetchingResults ? "…" : "🔄 Refresh"}
              </button>
            )}
          </div>

          {/* Winner hero card */}
          {winner && hasAnyActual && (
            <div className="relative bg-[#F2591E] rounded-2xl p-4 mb-1 overflow-hidden shadow-md">
              <svg viewBox="0 0 80 100" className="absolute right-2 top-0 w-16 h-20 text-white opacity-10" fill="currentColor">
                <circle cx="52" cy="10" r="9"/><path d="M52 19 C48 30 40 38 34 48 L26 68" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/><path d="M44 30 L60 22 M40 42 L28 38" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M34 48 L46 70 L42 86" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/><path d="M26 68 L14 82" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
              </svg>
              <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-2">👑 Winner — Closest Prediction</p>
              <div className="flex items-center gap-3">
                {winner.profilePic
                  ? <img src={winner.profilePic} className="w-14 h-14 rounded-full object-cover border-2 border-white flex-shrink-0" alt="" />
                  : <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white flex items-center justify-center text-xl font-black text-white flex-shrink-0">{winner.firstName[0]}</div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-black text-white">{winner.firstName}</p>
                  <p className="text-white/70 text-xs">
                    Predicted {formatTime(winner.predictedTimeSecs!)} · missed by <span className="text-white font-black">{Math.abs(winner.actualTimeSecs! - winner.predictedTimeSecs!)}s</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-3xl font-black text-white tabular-nums">{formatTime(winner.actualTimeSecs!)}</p>
                  <p className="text-white/50 text-[10px] uppercase tracking-wide">actual</p>
                </div>
              </div>
            </div>
          )}

          {/* Expandable runner cards */}
          <div className="space-y-2.5">
            {sorted.map((p, idx) => {
              const verdict = commentary?.tips.find((t) => t.name === p.firstName);
              return (
                <RunnerCard
                  key={p.id}
                  p={p}
                  rank={idx}
                  isWinner={!!(winner?.userId === p.userId && hasAnyActual)}
                  isMe={p.userId === currentUserId}
                  isFastest={!!(fastest?.userId === p.userId && withResults.length > 1)}
                  isSandbagger={!!(sandbagger?.userId === p.userId && withResults.length > 1)}
                  isPb={!!(pbAlert?.userId === p.userId)}
                  verdict={verdict}
                  reactions={reactions[p.id] ?? {}}
                  isExpanded={expandedCard === p.id}
                  onToggle={() => setExpandedCard(expandedCard === p.id ? null : p.id)}
                  onReact={(emoji) => handleReact("runner", p.id, emoji)}
                  eventId={event.id}
                  windowEnded={windowEnded}
                  currentUserId={currentUserId}
                  comments={initialComments[p.id] ?? []}
                />
              );
            })}
          </div>

          {/* Refresh button */}
          {(windowStarted || windowEnded) && (
            <button onClick={fetchResults} disabled={fetchingResults}
              className="w-full text-xs text-gray-500 font-semibold py-2 rounded-xl border border-[#ECE7DF] hover:border-[#F2591E] hover:text-[#F2591E] transition-colors disabled:opacity-40 bg-white">
              {fetchingResults ? "Fetching results…" : "🔄 Refresh Results"}
            </button>
          )}

          {/* Stat chips */}
          {withResults.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {fastest && (
                <div className="bg-white rounded-2xl shadow-sm border border-[#ECE7DF] p-4">
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider mb-1">⚡ Speed Demon</p>
                  <p className="text-[#1A2233] font-bold">{fastest.firstName}</p>
                  <p className="text-blue-500 font-black text-xl tabular-nums">{formatTime(fastest.actualTimeSecs!)}</p>
                </div>
              )}
              {darkHorse && (
                <div className="bg-white rounded-2xl shadow-sm border border-[#ECE7DF] p-4">
                  <p className="text-[10px] font-black text-purple-500 uppercase tracking-wider mb-1">🐴 Dark Horse</p>
                  <p className="text-[#1A2233] font-bold">{darkHorse.firstName}</p>
                  <p className="text-purple-500 font-black text-xl tabular-nums">+{darkHorse.vdotPredictedSecs! - darkHorse.actualTimeSecs!}s faster</p>
                </div>
              )}
              {winner && (
                <div className="bg-white rounded-2xl shadow-sm border border-[#FFF1EA] p-4 col-span-2">
                  <p className="text-[10px] font-black text-[#F2591E] uppercase tracking-wider mb-1">🎯 Oracle — Nailed It</p>
                  <p className="text-[#1A2233] font-bold">{winner.firstName} called it closest</p>
                  <p className="text-[#F2591E] font-black text-xl tabular-nums">Off by {Math.abs(winner.actualTimeSecs! - winner.predictedTimeSecs!)}s</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ══ SECTION 3 — TIPS ══ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">AI Tipster</p>
              <p className="text-xl font-black text-gray-900">🎙️ Tips</p>
            </div>
            {joined && (
              <div className="flex gap-2">
                <button onClick={generateRaceCard} disabled={generatingCard}
                  className="bg-[#FF6B35] text-white text-xs font-black px-3 py-2 rounded-xl disabled:opacity-50 whitespace-nowrap shadow-sm">
                  {generatingCard ? "Generating…" : commentary ? "Regenerate" : "Generate"}
                </button>
                {commentary && (
                  <button onClick={copyRaceCard}
                    className="bg-white border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-2 rounded-xl hover:border-[#FF6B35] hover:text-[#FF6B35] transition-colors whitespace-nowrap shadow-sm">
                    {cardCopied ? "Copied!" : "Share"}
                  </button>
                )}
              </div>
            )}
          </div>

          {commentary ? (
            <div className="space-y-3">
              <div className="bg-white rounded-2xl shadow-sm border border-[#ECE7DF] p-4">
                <p className="text-gray-600 text-sm leading-relaxed italic">{commentary.intro}</p>
                <ReactionBar
                  reactions={reactions[event.id] ?? {}}
                  onReact={(emoji) => handleReact("tipster", event.id, emoji)}
                />
              </div>
              {commentary.tips.map((tip, idx) => {
                const style = tip.label ? labelStyles[tip.label] : null;
                const lightStyles: Record<string, { bg: string; text: string }> = {
                  SHARP:        { bg: "bg-green-50",  text: "text-green-600" },
                  "DARK HORSE": { bg: "bg-purple-50", text: "text-purple-600" },
                  SANDBAGGING:  { bg: "bg-amber-50",  text: "text-amber-600" },
                  PAP:          { bg: "bg-red-50",    text: "text-red-600" },
                };
                const ls = tip.label ? lightStyles[tip.label] : null;
                return (
                  <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-black text-gray-900">{tip.name}</span>
                      {ls && tip.label && style && (
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${ls.bg} ${ls.text}`}>
                          {style.emoji} {tip.label}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed">{tip.tip}</p>
                  </div>
                );
              })}
              {/* Post-race overall summary */}
              {windowEnded && commentary.postRaceIntro && (
                <div className="bg-[#1A2233] rounded-2xl p-4">
                  <p className="text-[10px] font-black text-[#F2591E] uppercase tracking-wider mb-2">🎩 Tips' Closing Memo</p>
                  <p className="text-white/90 text-sm leading-relaxed italic">{commentary.postRaceIntro}</p>
                </div>
              )}

              <p className="text-center text-xs text-gray-300">
                Generated {new Date(raceCard!.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-[#ECE7DF] p-8 text-center">
              <p className="text-4xl mb-2">🎙️</p>
              <p className="text-gray-400 text-sm font-semibold">No tips yet.</p>
              {joined && <p className="text-gray-300 text-xs mt-1">Tap Generate — Tips will size up every runner.{windowEnded ? " Results are in — post-race verdicts included." : ""}</p>}
            </div>
          )}
        </section>

        {/* ══ SECTION 4 — RACE BANTER ══ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Race Banter</p>
            <span className="text-[10px] text-gray-300">· event chat</span>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#ECE7DF] p-4">
            <CommentThread
              eventId={event.id}
              targetType="event"
              targetId={event.id}
              currentUserId={currentUserId}
              initialComments={initialComments[event.id] ?? []}
            />
          </div>
        </section>

        {/* ══ SECTION 5 — ACTIONS ══ */}
        <section className="space-y-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Race Options</p>

          <div className="bg-white rounded-2xl shadow-sm border border-[#ECE7DF] p-4">
            <p className="text-xs text-gray-500 font-bold mb-2">Invite Friends</p>
            <div className="flex gap-2 items-center">
              <p className="text-xs text-gray-400 flex-1 truncate font-mono">{inviteLink}</p>
              <button onClick={copyInvite} className="bg-[#F2591E] text-white text-xs font-black px-3 py-1.5 rounded-lg whitespace-nowrap shadow-sm">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <button onClick={refreshEstimates} disabled={refreshingEstimates}
            className="w-full bg-white border border-[#ECE7DF] text-gray-500 font-semibold py-2.5 rounded-xl text-xs disabled:opacity-40 hover:border-[#F2591E] hover:text-[#F2591E] transition-colors shadow-sm">
            {refreshingEstimates ? "Refreshing Strava estimates…" : "⚡ Refresh Strava Estimates"}
          </button>
        </section>

      </div>
    </main>
  );
}
