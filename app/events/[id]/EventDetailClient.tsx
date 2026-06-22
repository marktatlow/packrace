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
  SHARP:        { bg: "bg-[#39FF72]/10",  text: "text-[#39FF72]",  emoji: "⚡" },
  "DARK HORSE": { bg: "bg-[#00B7FF]/10",  text: "text-[#00B7FF]",  emoji: "🐴" },
  SANDBAGGING:  { bg: "bg-[#FF6A3D]/10",  text: "text-[#FF6A3D]",  emoji: "🎭" },
  PAP:          { bg: "bg-[#FF2D94]/10",  text: "text-[#FF2D94]",  emoji: "💩" },
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
    const interval = setInterval(fetchLive, 30 * 60 * 1000); // 30 min backup — webhook handles instant updates
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
    <main className="min-h-screen bg-[#0D0F14] max-w-[430px] mx-auto pb-16">

      {/* ── HERO BANNER ── */}
      <div className="relative bg-[#0D0F14] overflow-hidden border-b border-white/8">
        {/* Neon glow */}
        <div className="absolute top-0 left-0 w-48 h-48 bg-[#FF2D94]/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00B7FF]/8 rounded-full blur-3xl pointer-events-none translate-x-1/2 -translate-y-1/2" />

        <div className="px-4 pt-5 pb-6 relative">
          {/* Nav bar */}
          <div className="flex items-center justify-between mb-5">
            <Link href="/events" className="inline-flex items-center gap-1.5 text-white/65 text-xs font-black uppercase tracking-wider hover:text-white transition-colors">
              ← Races
            </Link>
            <img src="/raceparty-wordmarkx.png" alt="RaceParty" className="h-6 w-auto opacity-80" />
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-[#F4F4F7] text-2xl font-black leading-tight">{event.name}</h1>
              <p className="text-white/70 text-sm mt-1">
                {eventDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                {" · "}{event.distanceKm}km
                {event.location && ` · ${event.location}`}
              </p>
              {/* Window */}
              <p className="text-white/50 text-xs mt-0.5">
                {(() => {
                  const startDay = windowStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                  const endDay   = windowEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                  const startTime = windowStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                  const endTime   = windowEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
                  const sameDay = windowStart.toDateString() === windowEnd.toDateString();
                  return sameDay
                    ? `Window · ${startDay}, ${startTime} – ${endTime}`
                    : `Window · ${startDay} ${startTime} – ${endDay} ${endTime}`;
                })()}
              </p>
            </div>
            {/* Status badge */}
            <div className="shrink-0 mt-1">
              {windowEnded ? (
                <span className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-white/10 text-white/60 border border-white/10">🏁 Finished</span>
              ) : windowStarted ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-[#39FF72]/15 text-[#39FF72] border border-[#39FF72]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#39FF72] animate-pulse"/>Live
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-[#00B7FF]/10 text-[#00B7FF] border border-[#00B7FF]/30">📅 Open</span>
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
        <div className="mx-4 mt-4 bg-[#13151C] border border-[#FF2D94]/60 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-[0_0_20px_rgba(255,45,148,0.1)]">
          <p className="text-sm text-white/70 font-semibold">You&apos;re not in this race yet.</p>
          <button onClick={() => setShowWaiver(true)} disabled={joining}
            className="bg-[#FF2D94] text-white font-black px-4 py-2 rounded-xl text-sm whitespace-nowrap disabled:opacity-50 shadow-sm">
            {joining ? "Joining…" : "Join Race"}
          </button>
        </div>
      )}

      <div className="px-4 py-5 space-y-6">

        {/* ══ SECTION 1 — YOUR PREDICTION ══ */}
        {joined && (
          <section>
            <p className="text-[10px] font-black text-white/65 uppercase tracking-widest mb-2">Your Prediction</p>
            <div className={`bg-[#13151C] rounded-2xl shadow-sm overflow-hidden border ${!windowStarted ? "border-[#FF2D94]" : "border-white/10"}`}>
              {!windowStarted && <div className="h-1 bg-[#FF2D94]" />}
              {windowStarted && !windowEnded && <div className="h-1 bg-[#39FF72]" />}
              {windowEnded && <div className="h-1 bg-white/10" />}
              <div className="p-4">
                {me?.predictedTimeSecs ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-4xl font-black text-[#F4F4F7] tabular-nums">{formatTime(me.predictedTimeSecs)}</p>
                      {me.vdotPredictedSecs && (
                        <p className="text-xs text-white/65 mt-1">Strava est. {formatTime(me.vdotPredictedSecs)}</p>
                      )}
                    </div>
                    {!windowStarted && (
                      <button onClick={() => predictInput.current?.focus()}
                        className="text-xs text-[#FF2D94] border border-[#FF2D94] px-3 py-1.5 rounded-lg font-semibold">
                        Edit
                      </button>
                    )}
                    {windowStarted && !windowEnded && (
                      <span className="text-xs text-[#FF6A3D] font-black bg-[#FF6A3D]/10 px-3 py-1.5 rounded-lg">🔒 Locked</span>
                    )}
                  </div>
                ) : (
                  <p className="text-white/65 text-sm">No prediction yet — enter one below</p>
                )}
                {!windowStarted && (
                  <div className="mt-3 flex gap-2">
                    <input ref={predictInput} placeholder="mm:ss or h:mm:ss"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[#F4F4F7] text-sm focus:outline-none focus:border-[#FF2D94]" />
                    <button onClick={savePrediction} disabled={saving}
                      className="bg-[#FF2D94] text-white text-sm font-black px-4 py-2 rounded-xl disabled:opacity-50 shadow-sm">
                      {saving ? "…" : "Save"}
                    </button>
                  </div>
                )}
                {!windowStarted && (
                  <p className="text-xs text-white/65 mt-2 text-center">
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
                ? <p className="text-[10px] font-black text-white/65 uppercase tracking-widest">Post-Race Results</p>
                : windowStarted
                ? <p className="text-[10px] font-black text-[#39FF72] uppercase tracking-widest">● Live</p>
                : <p className="text-[10px] font-black text-white/65 uppercase tracking-widest">Pre-Race</p>
              }
              <p className="text-xl font-black text-[#F4F4F7]">Predictions vs. Actual</p>
            </div>
            {(windowStarted || windowEnded) && (
              <button onClick={fetchResults} disabled={fetchingResults}
                className="text-xs text-[#FF2D94] font-bold disabled:opacity-40">
                {fetchingResults ? "…" : "🔄 Refresh"}
              </button>
            )}
          </div>

          {/* Winner hero card */}
          {winner && hasAnyActual && (
            <div className="relative bg-[#FF2D94] rounded-2xl p-4 mb-1 overflow-hidden shadow-md">
              <svg viewBox="0 0 80 100" className="absolute right-2 top-0 w-16 h-20 text-white opacity-10" fill="currentColor">
                <circle cx="52" cy="10" r="9"/><path d="M52 19 C48 30 40 38 34 48 L26 68" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/><path d="M44 30 L60 22 M40 42 L28 38" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M34 48 L46 70 L42 86" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/><path d="M26 68 L14 82" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
              </svg>
              <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-2">👑 Winner — Closest Prediction</p>
              <div className="flex items-center gap-3">
                {winner.profilePic
                  ? <img src={winner.profilePic} className="w-14 h-14 rounded-full object-cover border-2 border-white/20 flex-shrink-0" alt="" />
                  : <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/20 flex items-center justify-center text-xl font-black text-white flex-shrink-0">{winner.firstName[0]}</div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-black text-white">{winner.firstName}</p>
                  <p className="text-white/70 text-xs">
                    Predicted {formatTime(winner.predictedTimeSecs!)} · missed by <span className="text-white font-black">{Math.abs(winner.actualTimeSecs! - winner.predictedTimeSecs!)}s</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-3xl font-black text-white tabular-nums">{formatTime(winner.actualTimeSecs!)}</p>
                  <p className="text-white/70 text-[10px] uppercase tracking-wide">actual</p>
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
              className="w-full text-xs text-white/60 font-semibold py-2 rounded-xl border border-white/10 hover:border-[#FF2D94] hover:text-[#FF2D94] transition-colors disabled:opacity-40 bg-[#13151C]">
              {fetchingResults ? "Fetching results…" : "🔄 Refresh Results"}
            </button>
          )}

          {/* ── TROPHY PRESENTATION (post-race only) ── */}
          {windowEnded && withResults.length >= 2 && (() => {
            // Worst performer: ran most seconds OVER their own prediction
            const worstPerformer = withResults.reduce((worst, p) => {
              const gap = p.actualTimeSecs! - p.predictedTimeSecs!;
              const worstGap = worst.actualTimeSecs! - worst.predictedTimeSecs!;
              return gap > worstGap ? p : worst;
            }, withResults[0]);
            // Beat own prediction by most (predicted - actual, most positive)
            const beatByMost = withResults
              .filter(p => p.actualTimeSecs! < p.predictedTimeSecs!)
              .sort((a, b) => (b.predictedTimeSecs! - b.actualTimeSecs!) - (a.predictedTimeSecs! - a.actualTimeSecs!))[0] ?? null;

            const trophies = [
              {
                icon: "⚡",
                title: "Speed Machine",
                subtitle: "Fastest finish",
                person: fastest,
                stat: fastest ? formatTime(fastest.actualTimeSecs!) : null,
                bg: "bg-[#00B7FF]/10",
                border: "border-blue-100",
                color: "text-blue-600",
              },
              {
                icon: "🎯",
                title: "Dead Eye",
                subtitle: "Closest prediction",
                person: winner,
                stat: winner ? `Off by ${Math.abs(winner.actualTimeSecs! - winner.predictedTimeSecs!)}s` : null,
                bg: "bg-[#1A1D26]",
                border: "border-[#FFE8DC]",
                color: "text-[#FF2D94]",
              },
              {
                icon: "🚀",
                title: "Rocket",
                subtitle: "Beat prediction by most",
                person: beatByMost,
                stat: beatByMost ? `${beatByMost.predictedTimeSecs! - beatByMost.actualTimeSecs!}s faster` : null,
                bg: "bg-[#39FF72]/10",
                border: "border-green-100",
                color: "text-[#39FF72]",
              },
              {
                icon: "🐌",
                title: "Slow Coach",
                subtitle: "Furthest over prediction",
                person: worstPerformer,
                stat: worstPerformer && worstPerformer.actualTimeSecs! > worstPerformer.predictedTimeSecs!
                  ? `+${worstPerformer.actualTimeSecs! - worstPerformer.predictedTimeSecs!}s over`
                  : "Everyone beat their time!",
                bg: "bg-[#FF6A3D]/10",
                border: "border-amber-100",
                color: "text-[#FF6A3D]",
              },
            ];

            return (
              <div>
                <p className="text-[10px] font-black text-white/65 uppercase tracking-widest mb-3">🏆 Trophy Presentation</p>
                <div className="grid grid-cols-2 gap-3">
                  {trophies.map(({ icon, title, subtitle, person, stat, bg, border, color }) => (
                    <div key={title} className={`${bg} border ${border} rounded-2xl p-4 flex flex-col items-center text-center`}>
                      <span className="text-3xl mb-2">{icon}</span>
                      <p className={`text-[10px] font-black uppercase tracking-wider ${color}`}>{title}</p>
                      <p className="text-[10px] text-white/65 mb-2">{subtitle}</p>
                      {person ? (
                        <>
                          <div className="mb-1">
                            {person.profilePic
                              ? <img src={person.profilePic} className="w-8 h-8 rounded-full object-cover mx-auto" alt="" />
                              : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-black text-white/70 mx-auto">{person.firstName[0]}</div>
                            }
                          </div>
                          <p className="text-sm font-black text-[#F4F4F7]">{person.firstName}</p>
                          <p className={`text-xs font-bold tabular-nums ${color}`}>{stat}</p>
                        </>
                      ) : (
                        <p className="text-xs text-white/65 italic">{stat ?? "—"}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Live stat chips (during race only) */}
          {!windowEnded && withResults.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {fastest && (
                <div className="bg-[#13151C] rounded-2xl shadow-sm border border-white/10 p-4">
                  <p className="text-[10px] font-black text-[#00B7FF] uppercase tracking-wider mb-1">⚡ Fastest so far</p>
                  <p className="text-[#F4F4F7] font-bold">{fastest.firstName}</p>
                  <p className="text-[#00B7FF] font-black text-xl tabular-nums">{formatTime(fastest.actualTimeSecs!)}</p>
                </div>
              )}
              {winner && (
                <div className="bg-[#13151C] rounded-2xl shadow-sm border border-white/10 p-4">
                  <p className="text-[10px] font-black text-[#FF2D94] uppercase tracking-wider mb-1">🎯 Leading</p>
                  <p className="text-[#F4F4F7] font-bold">{winner.firstName}</p>
                  <p className="text-[#FF2D94] font-black text-xl tabular-nums">Off by {Math.abs(winner.actualTimeSecs! - winner.predictedTimeSecs!)}s</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ══ SECTION 3 — TIPS ══ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <img src="/tips-avatar.jpeg" alt="Tips" className="w-12 h-12 rounded-full object-cover border-2 border-[#FF2D94] shadow-sm" />
              <div>
                <p className="text-[10px] font-black text-white/65 uppercase tracking-widest">AI Tipster</p>
                <p className="text-xl font-black text-[#F4F4F7]">Tips</p>
              </div>
            </div>
            {commentary && (
              <button onClick={copyRaceCard}
                className="bg-[#13151C] border border-white/10 text-white/70 text-xs font-semibold px-3 py-2 rounded-xl hover:border-[#FF2D94] hover:text-[#FF2D94] transition-colors whitespace-nowrap shadow-sm">
                {cardCopied ? "Copied!" : "Share"}
              </button>
            )}
          </div>

          {commentary ? (
            <div className="space-y-3">
              {/* Pre-event: intro overview only */}
              {!windowEnded && (
                <div className="bg-[#13151C] rounded-2xl shadow-sm border border-white/10 p-4">
                  <p className="text-[10px] font-black text-[#FF2D94] uppercase tracking-wider mb-2">🎩 Pre-Race Overview</p>
                  <p className="text-white/70 text-sm leading-relaxed italic">{commentary.intro}</p>
                  <ReactionBar
                    reactions={reactions[event.id] ?? {}}
                    onReact={(emoji) => handleReact("tipster", event.id, emoji)}
                  />
                </div>
              )}

              {/* Post-event: closing memo only */}
              {windowEnded && (
                <div className="bg-[#0D0F14] rounded-2xl p-4">
                  <p className="text-[10px] font-black text-[#FF2D94] uppercase tracking-wider mb-2">🎩 Post-Race Verdict</p>
                  <p className="text-white/90 text-sm leading-relaxed italic">
                    {commentary.postRaceIntro ?? commentary.intro}
                  </p>
                  <ReactionBar
                    reactions={reactions[event.id] ?? {}}
                    onReact={(emoji) => handleReact("tipster", event.id, emoji)}
                  />
                </div>
              )}

              <p className="text-center text-xs text-white/50">
                Generated {new Date(raceCard!.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {windowEnded && !commentary.postRaceIntro && (
                  <span className="block text-[#FF2D94] mt-1">Regenerate for post-race verdicts ↑</span>
                )}
              </p>
            </div>
          ) : (
            <div className="bg-[#13151C] rounded-2xl shadow-sm border border-white/10 p-8 text-center">
              <p className="text-4xl mb-2">🎙️</p>
              <p className="text-white/65 text-sm font-semibold">{windowEnded ? "No post-race verdict yet." : "No pre-race tips yet."}</p>
              <p className="text-white/50 text-xs mt-1">Tips auto-generates when runners join. Check back shortly.</p>
            </div>
          )}
        </section>

        {/* ══ SECTION 4 — RACE BANTER ══ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[10px] font-black text-white/65 uppercase tracking-widest">Race Banter</p>
            <span className="text-[10px] text-white/50">· event chat</span>
          </div>
          <div className="bg-[#13151C] rounded-2xl shadow-sm border border-white/10 p-4">
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
          <p className="text-[10px] font-black text-white/65 uppercase tracking-widest">Race Options</p>

          <div className="bg-[#13151C] rounded-2xl shadow-sm border border-white/10 p-4">
            <p className="text-xs text-white/60 font-bold mb-2">Invite Friends</p>
            <div className="flex gap-2 items-center">
              <p className="text-xs text-white/65 flex-1 truncate font-mono">{inviteLink}</p>
              <button onClick={copyInvite} className="bg-[#FF2D94] text-white text-xs font-black px-3 py-1.5 rounded-lg whitespace-nowrap shadow-sm">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <button onClick={refreshEstimates} disabled={refreshingEstimates}
            className="w-full bg-[#13151C] border border-white/10 text-white/60 font-semibold py-2.5 rounded-xl text-xs disabled:opacity-40 hover:border-[#FF2D94] hover:text-[#FF2D94] transition-colors shadow-sm">
            {refreshingEstimates ? "Refreshing Strava estimates…" : "⚡ Refresh Strava Estimates"}
          </button>
        </section>

        {/* ══ BRANDED FOOTER ══ */}
        <div className="pt-4 pb-2 flex flex-col items-center gap-2 opacity-50">
          <img src="/raceparty-icon.png" alt="" className="w-8 h-8" />
          <img src="/raceparty-wordmarkx.png" alt="RaceParty" className="h-5 w-auto" />
          <p className="text-[10px] font-black tracking-widest uppercase">
            <span className="text-[#FF2D94]">Predict</span>
            <span className="text-white/30"> · </span>
            <span className="text-[#00B7FF]">Race</span>
            <span className="text-white/30"> · </span>
            <span className="text-[#39FF72]">Get Roasted</span>
          </p>
        </div>

      </div>
    </main>
  );
}
