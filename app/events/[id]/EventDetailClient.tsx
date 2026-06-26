"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatWindow } from "@/lib/format";
import type { RaceCardCommentary } from "@/lib/racecard";
import WaiverModal from "@/app/components/WaiverModal";
import type { ReactionsMap, CommentsMap } from "./page";
import CommentThread from "./CommentThread";
import BettingBoard from "./BettingBoard";
import RaceReplay from "./RaceReplay";
import PredictionCard from "./PredictionCard";
import ResultsSection from "./ResultsSection";
import TipsSection from "./TipsSection";
import RaceCardView from "@/app/components/RaceCardView";
import { Share2, ChevronDown } from "lucide-react";

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
  streamDistance: number[] | null;
  streamTime: number[] | null;
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
  const [showRaceCard, setShowRaceCard] = useState(false);
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
    const savedAt = Date.now();
    await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predictedTimeSecs: secs }),
    });
    setLocalParticipants((prev) =>
      prev.map((p) => p.userId === currentUserId ? { ...p, predictedTimeSecs: secs } : p)
    );
    setSaving(false);

    // Poll for updated race card (Tips + odds regenerate in background via after())
    // Check every 5s for up to 90s until the card is newer than our save time
    let attempts = 0;
    const poll = async () => {
      attempts++;
      if (attempts > 18) return; // give up after 90s
      try {
        const res = await fetch(`/api/events/${event.id}/racecard`);
        if (res.ok) {
          const data = await res.json();
          if (data?.generatedAt && new Date(data.generatedAt).getTime() > savedAt) {
            setRaceCard({ commentary: data.commentary, generatedAt: data.generatedAt });
            return; // updated — stop polling
          }
        }
      } catch { /* silent */ }
      setTimeout(poll, 5000);
    };
    setTimeout(poll, 8000); // first check after 8s (VDOT + Tips takes time)
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

  return (
    <main className="min-h-screen bg-[#0B0D12] max-w-[430px] mx-auto pb-16">

      {/* ── HERO BANNER ── */}
      <div className="relative bg-[#0B0D12] overflow-hidden border-b border-white/8">
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
                {event.distanceKm}km
                {event.location && ` · ${event.location}`}
              </p>
              <p className="text-[#00B7FF] text-xs font-bold mt-1.5">
                🕐 {formatWindow(windowStart, windowEnd)}
              </p>
            </div>
            {/* Status badge */}
            <div className="shrink-0 mt-1">
              {windowEnded ? (
                <span className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-white/10 text-white/60 border border-white/10">🏁 Finished</span>
              ) : windowStarted ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-[#39FF72]/15 text-[#39FF72] neon-green border border-[#39FF72]/30">
                  <span className="led-dot"/>Live
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
        <div className="mx-4 mt-4 bg-[#12151D] border border-[#FF2D94]/60 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-[0_0_20px_rgba(255,45,148,0.1)]">
          <p className="text-sm text-white/70 font-semibold">You&apos;re not in this race yet.</p>
          <button onClick={() => setShowWaiver(true)} disabled={joining}
            className="bg-[#FF2D94] text-white font-black px-4 py-2 rounded-xl text-sm whitespace-nowrap disabled:opacity-50 shadow-sm">
            {joining ? "Joining…" : "Join Race"}
          </button>
        </div>
      )}

      <div className="px-4 py-5 space-y-6">

        {/* ══ VALUE PROP ══ */}
        <p className="text-center text-xs text-white/50 italic -mt-2">
          Predict your time, beat your mates, get roasted by Tips.
        </p>

        {/* ══ SECTION 1 — YOUR PREDICTION ══ */}
        <PredictionCard
          joined={joined}
          predictedTimeSecs={me?.predictedTimeSecs ?? null}
          windowStarted={windowStarted}
          windowStart={windowStart}
          saving={saving}
          predictInput={predictInput}
          onSave={savePrediction}
        />

        {/* ══ SECTION 1b — RACE CARD (visible once predictions are locked) ══ */}
        {windowStarted && commentary && (
          <section>
            <button
              onClick={() => setShowRaceCard((s) => !s)}
              className="w-full flex items-center justify-between bg-[#12151D] border border-white/10 rounded-2xl px-4 py-3.5"
            >
              <div className="flex items-center gap-2.5">
                <img src="/tips_commentator.png" alt="Tips" className="w-20 h-20 object-contain object-bottom shrink-0" />
                <p
                  className="text-2xl font-black uppercase tracking-tight"
                  style={{
                    color: "#00B7FF",
                    textShadow: "0 0 10px rgba(0,183,255,0.85), 0 0 24px rgba(0,183,255,0.5)",
                    WebkitTextStroke: "0.5px rgba(0,183,255,0.5)",
                  }}
                >
                  Race Card
                </p>
              </div>
              <ChevronDown
                size={18}
                className={`text-white/50 transition-transform shrink-0 ${showRaceCard ? "rotate-180" : ""}`}
              />
            </button>

            {showRaceCard && (
              <div className="mt-3">
                <div className="flex justify-end mb-3">
                  <button onClick={(e) => { e.stopPropagation(); copyRaceCard(); }}
                    className="flex items-center gap-1.5 bg-[#FF2D94] text-white text-xs font-black px-3 py-1.5 rounded-full shadow-sm">
                    <Share2 size={12} /> {cardCopied ? "Copied!" : "Share Race Card"}
                  </button>
                </div>
                <RaceCardView
                  event={{ name: event.name, distanceKm: event.distanceKm, date: event.date, location: event.location }}
                  participants={localParticipants}
                  commentary={commentary}
                  generatedAt={raceCard?.generatedAt}
                  embedded
                />
              </div>
            )}
          </section>
        )}

        {/* ══ SECTION 2 — RESULTS ══ */}
        <ResultsSection
          participants={localParticipants}
          commentary={commentary}
          currentUserId={currentUserId}
          windowStarted={windowStarted}
          windowEnded={windowEnded}
          eventId={event.id}
          reactions={reactions}
          comments={initialComments}
          expandedCard={expandedCard}
          onToggleExpand={setExpandedCard}
          onReact={handleReact}
          fetchResults={fetchResults}
          fetchingResults={fetchingResults}
        />

        {/* ══ SECTION 2b — BETTING BOARD ══ */}
        {commentary && commentary.tips.length > 0 && (
          <section>
            <p className="text-[10px] font-black text-white/65 uppercase tracking-widest mb-3">RaceParty Picks</p>
            <BettingBoard
              eventName={event.name}
              distanceKm={event.distanceKm}
              windowStart={event.windowStart}
              participants={localParticipants}
              tips={commentary.tips}
              windowStarted={windowStarted}
              windowEnded={windowEnded}
            />
          </section>
        )}

        {/* ══ SECTION 3 — TIPS ══ */}
        <TipsSection
          commentary={commentary}
          generatedAt={raceCard?.generatedAt}
          windowEnded={windowEnded}
          eventId={event.id}
          reactions={reactions}
          onReact={handleReact}
          cardCopied={cardCopied}
          onCopyRaceCard={copyRaceCard}
        />

        {/* ══ SECTION 4 — RACE BANTER ══ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[10px] font-black text-white/65 uppercase tracking-widest">Race Banter</p>
            <span className="text-[10px] text-white/50">· event chat</span>
          </div>
          <div className="bg-[#12151D] rounded-2xl card-depth border border-white/10 p-4">
            <CommentThread
              eventId={event.id}
              targetType="event"
              targetId={event.id}
              currentUserId={currentUserId}
              initialComments={initialComments[event.id] ?? []}
            />
          </div>
        </section>

        {/* ══ SECTION 4b — RACE REPLAY ══ */}
        {windowEnded && (() => {
          const replayRunners = localParticipants
            .filter((p) => p.actualTimeSecs && p.streamDistance && p.streamTime)
            .map((p) => ({
              name: p.firstName,
              actualTimeSecs: p.actualTimeSecs!,
              distData: p.streamDistance as number[],
              timeData: p.streamTime as number[],
            }));
          return replayRunners.length >= 2 ? (
            <section>
              <RaceReplay runners={replayRunners} distanceKm={event.distanceKm} />
            </section>
          ) : null;
        })()}

        {/* ══ SECTION 5 — ACTIONS ══ */}
        <section className="space-y-3">
          <p className="text-[10px] font-black text-white/65 uppercase tracking-widest">Race Options</p>

          <div className="bg-[#12151D] rounded-2xl card-depth border border-white/10 p-4">
            <p className="text-xs text-white/60 font-bold mb-2">Invite Friends</p>
            <div className="flex gap-2 items-center">
              <p className="text-xs text-white/65 flex-1 truncate font-mono">{inviteLink}</p>
              <button onClick={copyInvite} className="bg-[#FF2D94] text-white text-xs font-black px-3 py-1.5 rounded-lg whitespace-nowrap shadow-sm">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

        </section>

        {/* ══ BRANDED FOOTER ══ */}
        <div className="pt-4 pb-2 flex flex-col items-center gap-2 opacity-50">
          <img src="/raceparty-icon.png" alt="" className="w-8 h-8" />
          <img src="/raceparty-wordmarkx.png" alt="RaceParty" className="h-5 w-auto" />
          <p className="text-[10px] font-black tracking-widest uppercase">
            <span className="text-[#FF2D94] neon-pink">Predict</span>
            <span className="text-white/30"> · </span>
            <span className="text-[#00B7FF] neon-blue">Race</span>
            <span className="text-white/30"> · </span>
            <span className="text-[#39FF72] neon-green">Get Roasted</span>
          </p>
        </div>

      </div>
    </main>
  );
}
