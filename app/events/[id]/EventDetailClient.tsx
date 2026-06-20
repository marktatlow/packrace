"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { formatTime, formatPace, formatHandicap, timeAgo } from "@/lib/format";

type Participant = {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string; profilePic: string | null };
  predictedTimeSecs: number | null;
  lowConfidence: boolean;
  manualPrediction: boolean;
  actualTimeSecs: number | null;
  stravaActivityId: string | null;
  stats: {
    totalKm: number;
    runCount: number;
    longestRun: number;
    totalElevation: number;
    fastestPace: number | null;
    last4WeeksKm: number;
    prev4WeeksKm: number;
  };
};

type Props = {
  event: { id: string; name: string; distanceKm: number; date: string; location: string | null; description: string | null };
  participants: Participant[];
  currentUserId: string;
  inviteLink: string;
  isLocked: boolean;
  isPast: boolean;
  daysUntil: number;
  commentary: { content: string; generatedAt: string } | null;
};

export default function EventDetailClient({ event, participants, currentUserId, inviteLink, isLocked, isPast, daysUntil, commentary: initialCommentary }: Props) {
  const [tab, setTab] = useState<"overview" | "handicaps" | "leaderboard" | "commentary">("overview");
  const [copied, setCopied] = useState(false);
  const [commentary, setCommentary] = useState(initialCommentary);
  const [generatingCommentary, setGeneratingCommentary] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [editingActual, setEditingActual] = useState(false);
  const [leaderboardCat, setLeaderboardCat] = useState(0);
  const predictInput = useRef<HTMLInputElement>(null);
  const actualInput = useRef<HTMLInputElement>(null);

  const me = participants.find((p) => p.userId === currentUserId);

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function savePrediction() {
    const val = predictInput.current?.value;
    if (!val) return;
    const [m, s] = val.split(":").map(Number);
    const secs = m * 60 + (s || 0);
    await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predictedTimeSecs: secs }),
    });
    setEditingTime(false);
    window.location.reload();
  }

  async function saveActual() {
    const val = actualInput.current?.value;
    if (!val) return;
    const [m, s] = val.split(":").map(Number);
    const secs = m * 60 + (s || 0);
    await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actualTimeSecs: secs }),
    });
    setEditingActual(false);
    window.location.reload();
  }

  async function refreshCommentary() {
    setGeneratingCommentary(true);
    await fetch(`/api/events/${event.id}/commentary`, { method: "POST" });
    // Re-fetch commentary
    const res = await fetch(`/api/events/${event.id}`);
    const data = await res.json();
    if (data.groupCommentary?.[0]) {
      setCommentary({ content: data.groupCommentary[0].content, generatedAt: data.groupCommentary[0].generatedAt });
    }
    setGeneratingCommentary(false);
  }

  // Handicap: max predicted time among all participants
  const maxPredicted = Math.max(...participants.filter(p => p.predictedTimeSecs).map(p => p.predictedTimeSecs!), 0);

  const leaderboardCategories = [
    {
      label: "Most KM",
      icon: "🏃",
      sorted: [...participants].sort((a, b) => b.stats.totalKm - a.stats.totalKm),
      value: (p: Participant) => `${p.stats.totalKm.toFixed(1)}km`,
    },
    {
      label: "Most Runs",
      icon: "📊",
      sorted: [...participants].sort((a, b) => b.stats.runCount - a.stats.runCount),
      value: (p: Participant) => `${p.stats.runCount} runs`,
    },
    {
      label: "Fastest KM",
      icon: "⚡",
      sorted: [...participants].sort((a, b) => {
        if (!a.stats.fastestPace) return 1;
        if (!b.stats.fastestPace) return -1;
        return a.stats.fastestPace - b.stats.fastestPace;
      }),
      value: (p: Participant) => p.stats.fastestPace ? `${formatPace(p.stats.fastestPace)}/km` : "—",
    },
    {
      label: "Longest Run",
      icon: "📏",
      sorted: [...participants].sort((a, b) => b.stats.longestRun - a.stats.longestRun),
      value: (p: Participant) => `${p.stats.longestRun.toFixed(1)}km`,
    },
    {
      label: "Elevation",
      icon: "⛰️",
      sorted: [...participants].sort((a, b) => b.stats.totalElevation - a.stats.totalElevation),
      value: (p: Participant) => `${Math.round(p.stats.totalElevation)}m`,
    },
    {
      label: "Trending",
      icon: "📈",
      sorted: [...participants].sort((a, b) => (b.stats.last4WeeksKm - b.stats.prev4WeeksKm) - (a.stats.last4WeeksKm - a.stats.prev4WeeksKm)),
      value: (p: Participant) => {
        const diff = p.stats.last4WeeksKm - p.stats.prev4WeeksKm;
        return `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)}km/wk`;
      },
    },
  ];

  const tabClass = (t: string) =>
    `flex-1 py-3 text-sm font-semibold transition-colors ${tab === t ? "text-[#FF6B35] border-b-2 border-[#FF6B35]" : "text-gray-500 border-b-2 border-transparent"}`;

  return (
    <main className="min-h-screen bg-[#0D0D0D] max-w-[430px] mx-auto pb-10">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/events" className="text-gray-400 text-xl">←</Link>
          <div className="flex-1">
            <h1 className="text-xl font-black text-white">{event.name}</h1>
            <p className="text-gray-400 text-sm">
              {event.distanceKm}km · {new Date(event.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              {event.location && ` · ${event.location}`}
            </p>
          </div>
          {!isPast && (
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${daysUntil <= 3 ? "bg-[#E63946]/20 text-[#E63946]" : "bg-[#FF6B35]/20 text-[#FF6B35]"}`}>
              {daysUntil}d
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2A2A4A]">
          <button className={tabClass("overview")} onClick={() => setTab("overview")}>Overview</button>
          <button className={tabClass("handicaps")} onClick={() => setTab("handicaps")}>Handicaps</button>
          <button className={tabClass("leaderboard")} onClick={() => setTab("leaderboard")}>Training</button>
          <button className={tabClass("commentary")} onClick={() => setTab("commentary")}>Banter</button>
        </div>
      </div>

      <div className="px-4">
        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="space-y-4">
            {/* Invite link */}
            <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
              <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">Invite Link</p>
              <div className="flex gap-2 items-center">
                <p className="text-xs text-gray-300 flex-1 truncate font-mono">{inviteLink}</p>
                <button
                  onClick={copyInvite}
                  className="bg-[#FF6B35] text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-[#e5602f] transition-colors whitespace-nowrap"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Participants */}
            <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
              <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">
                {participants.length} Racers
              </p>
              <div className="flex flex-wrap gap-3">
                {participants.map((p) => (
                  <div key={p.id} className="flex flex-col items-center gap-1">
                    {p.user.profilePic ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.user.profilePic} alt={p.user.firstName} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#2A2A4A] flex items-center justify-center text-sm font-bold">
                        {p.user.firstName[0]}
                      </div>
                    )}
                    <span className="text-xs text-gray-400">{p.user.firstName}</span>
                  </div>
                ))}
              </div>
            </div>

            {event.description && (
              <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
                <p className="text-gray-300 text-sm leading-relaxed">{event.description}</p>
              </div>
            )}
          </div>
        )}

        {/* HANDICAPS TAB */}
        {tab === "handicaps" && (
          <div className="space-y-3">
            {isLocked && !isPast && (
              <div className="bg-[#E63946]/10 border border-[#E63946]/30 rounded-xl p-3 text-center">
                <p className="text-[#E63946] text-sm font-semibold">🔒 Predictions locked — race in {daysUntil}h!</p>
              </div>
            )}

            {/* My prediction card */}
            {me && (
              <div className="bg-[#1A1A2E] border-2 border-[#FF6B35] rounded-2xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Your Prediction</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-2xl font-black text-white">
                        {me.predictedTimeSecs ? formatTime(me.predictedTimeSecs) : "Calculating..."}
                      </span>
                      {me.lowConfidence && !me.manualPrediction && <span title="Low confidence — fewer than 3 efforts in last 90 days">⚠️</span>}
                      {me.manualPrediction && <span title="Manual prediction">🚩</span>}
                    </div>
                    {me.predictedTimeSecs && maxPredicted > 0 && (
                      <p className="text-[#FF6B35] text-sm font-bold mt-1">
                        Handicap: {formatHandicap(maxPredicted - me.predictedTimeSecs)}
                      </p>
                    )}
                  </div>
                  {!isLocked ? (
                    <button
                      onClick={() => setEditingTime(!editingTime)}
                      className="text-xs text-[#FF6B35] font-semibold border border-[#FF6B35] px-3 py-1 rounded-lg"
                    >
                      Edit
                    </button>
                  ) : (
                    <span className="text-xs text-gray-500 flex items-center gap-1">🔒 Locked</span>
                  )}
                </div>

                {editingTime && (
                  <div className="flex gap-2 mt-2">
                    <input
                      ref={predictInput}
                      placeholder="m:ss (e.g. 52:30)"
                      className="flex-1 bg-[#0D0D0D] border border-[#2A2A4A] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FF6B35]"
                    />
                    <button onClick={savePrediction} className="bg-[#FF6B35] text-white text-sm font-bold px-4 py-2 rounded-xl">Save</button>
                  </div>
                )}

                {isPast && (
                  <div className="mt-3 pt-3 border-t border-[#2A2A4A]">
                    <p className="text-xs text-gray-500 mb-2">
                      {me.stravaActivityId ? "✓ Auto-detected from Strava" : "Enter your finish time"}
                    </p>
                    {me.actualTimeSecs ? (
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-white">Actual: {formatTime(me.actualTimeSecs)}</span>
                        <button onClick={() => setEditingActual(true)} className="text-xs text-gray-500">Edit</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingActual(true)} className="text-sm text-[#FF6B35] font-semibold">
                        + Enter finish time
                      </button>
                    )}
                    {editingActual && (
                      <div className="flex gap-2 mt-2">
                        <input
                          ref={actualInput}
                          placeholder="m:ss (e.g. 54:12)"
                          className="flex-1 bg-[#0D0D0D] border border-[#2A2A4A] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FF6B35]"
                        />
                        <button onClick={saveActual} className="bg-[#FF6B35] text-white text-sm font-bold px-4 py-2 rounded-xl">Save</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* All participants */}
            <div className="space-y-2">
              {[...participants]
                .sort((a, b) => (a.predictedTimeSecs || 99999) - (b.predictedTimeSecs || 99999))
                .map((p, idx) => {
                  const isMe = p.userId === currentUserId;
                  const score = isPast && p.actualTimeSecs && p.predictedTimeSecs
                    ? p.predictedTimeSecs - p.actualTimeSecs
                    : null;
                  return (
                    <div
                      key={p.id}
                      className={`bg-[#1A1A2E] border rounded-xl p-3 flex items-center gap-3 ${isMe ? "border-[#FF6B35]/50" : "border-[#2A2A4A]"}`}
                    >
                      <span className="text-sm font-bold text-gray-500 w-5 text-center">{idx + 1}</span>
                      {p.user.profilePic ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.user.profilePic} alt={p.user.firstName} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#2A2A4A] flex items-center justify-center text-xs font-bold">
                          {p.user.firstName[0]}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-semibold text-white">{p.user.firstName}</span>
                          {p.lowConfidence && !p.manualPrediction && <span className="text-xs" title="Low confidence — fewer than 3 efforts">⚠️</span>}
                          {p.manualPrediction && <span className="text-xs" title="Manual prediction">🚩</span>}
                        </div>
                        {p.predictedTimeSecs ? (
                          <p className="text-xs text-gray-400">
                            Pred: {formatTime(p.predictedTimeSecs)}
                            {maxPredicted > 0 && ` · Hdcp: ${formatHandicap(maxPredicted - p.predictedTimeSecs)}`}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-600">Calculating...</p>
                        )}
                      </div>
                      {isPast && (
                        <div className="text-right">
                          {p.actualTimeSecs ? (
                            <>
                              <p className="text-sm font-bold text-white">{formatTime(p.actualTimeSecs)}</p>
                              {score !== null && (
                                <p className={`text-xs font-bold ${score > 0 ? "text-green-400" : "text-[#E63946]"}`}>
                                  {score > 0 ? "+" : ""}{formatTime(Math.abs(score))}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-gray-600">TBC</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 text-center">Last 8 weeks of training</p>

            {/* Category tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {leaderboardCategories.map((cat, i) => (
                <button
                  key={cat.label}
                  onClick={() => setLeaderboardCat(i)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                    leaderboardCat === i ? "bg-[#FF6B35] text-white" : "bg-[#1A1A2E] text-gray-400 border border-[#2A2A4A]"
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {/* Ranked list */}
            <div className="space-y-2">
              {leaderboardCategories[leaderboardCat].sorted.map((p, idx) => {
                const isMe = p.userId === currentUserId;
                return (
                  <div
                    key={p.id}
                    className={`bg-[#1A1A2E] border rounded-xl p-3 flex items-center gap-3 ${isMe ? "border-[#FF6B35]/50" : "border-[#2A2A4A]"}`}
                  >
                    <span className={`text-lg font-black w-6 ${idx === 0 ? "text-yellow-400" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-amber-600" : "text-gray-600"}`}>
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                    </span>
                    {p.user.profilePic ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.user.profilePic} alt={p.user.firstName} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#2A2A4A] flex items-center justify-center text-xs font-bold">
                        {p.user.firstName[0]}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{p.user.firstName} {p.user.lastName[0]}.</p>
                    </div>
                    <span className="text-sm font-bold text-[#FF6B35]">
                      {leaderboardCategories[leaderboardCat].value(p)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* COMMENTARY TAB */}
        {tab === "commentary" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">🎤 The Pundit</h3>
              <button
                onClick={refreshCommentary}
                disabled={generatingCommentary}
                className="text-xs text-[#FF6B35] font-semibold border border-[#FF6B35]/50 px-3 py-1 rounded-lg disabled:opacity-50"
              >
                {generatingCommentary ? "Generating..." : "Refresh"}
              </button>
            </div>

            {commentary ? (
              <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 space-y-3">
                <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {commentary.content}
                </div>
                <p className="text-xs text-gray-600 border-t border-[#2A2A4A] pt-3">
                  Generated {timeAgo(new Date(commentary.generatedAt))}
                </p>
              </div>
            ) : (
              <div className="text-center py-10 space-y-3">
                <div className="text-4xl">🎙️</div>
                <p className="text-gray-400 text-sm">No commentary yet.</p>
                <button
                  onClick={refreshCommentary}
                  disabled={generatingCommentary}
                  className="bg-[#FF6B35] text-white font-bold px-6 py-3 rounded-xl disabled:opacity-50"
                >
                  {generatingCommentary ? "Generating..." : "Generate Commentary"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
