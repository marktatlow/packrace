"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { formatTime } from "@/lib/format";

type Participant = {
  id: string;
  userId: string;
  name: string;
  firstName: string;
  profilePic: string | null;
  predictedTimeSecs: number | null;
  actualTimeSecs: number | null;
  resultFetchedAt: string | null;
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
  inviteLink: string;
  windowStarted: boolean;
  windowEnded: boolean;
};

function Avatar({ p }: { p: Participant }) {
  return p.profilePic
    ? <img src={p.profilePic} className="w-8 h-8 rounded-full object-cover" alt={p.firstName} />
    : <div className="w-8 h-8 rounded-full bg-[#2A2A4A] flex items-center justify-center text-xs font-bold text-white">{p.firstName[0]}</div>;
}

function pctDiff(predicted: number, actual: number): number {
  return Math.abs((actual - predicted) / predicted) * 100;
}

export default function EventDetailClient({
  event, participants, currentUserId, inviteLink, windowStarted, windowEnded
}: Props) {
  const [tab, setTab] = useState<"predict" | "leaderboard">(windowEnded ? "leaderboard" : "predict");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingResults, setFetchingResults] = useState(false);
  const [localParticipants, setLocalParticipants] = useState(participants);
  const predictInput = useRef<HTMLInputElement>(null);

  const me = localParticipants.find((p) => p.userId === currentUserId);

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  async function fetchResults() {
    setFetchingResults(true);
    await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id }),
    });
    window.location.reload();
  }

  // Leaderboard: only participants with both times, sorted by % diff
  const withResults = localParticipants
    .filter((p) => p.predictedTimeSecs && p.actualTimeSecs)
    .sort((a, b) => pctDiff(a.predictedTimeSecs!, a.actualTimeSecs!) - pctDiff(b.predictedTimeSecs!, b.actualTimeSecs!));

  const noResult = localParticipants.filter((p) => p.resultFetchedAt && !p.actualTimeSecs);
  const notFetched = localParticipants.filter((p) => !p.resultFetchedAt);

  const tabClass = (t: string) =>
    `flex-1 py-3 text-sm font-semibold transition-colors ${tab === t ? "text-[#FF6B35] border-b-2 border-[#FF6B35]" : "text-gray-500 border-b-2 border-transparent"}`;

  const eventDate = new Date(event.date);
  const windowEnd = new Date(event.windowEnd);
  const windowStart = new Date(event.windowStart);

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
          {!windowEnded && windowStarted && (
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-500/20 text-green-400 whitespace-nowrap">Live</span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2A2A4A]">
          <button className={tabClass("predict")} onClick={() => setTab("predict")}>Predict</button>
          <button className={tabClass("leaderboard")} onClick={() => setTab("leaderboard")}>Leaderboard</button>
        </div>
      </div>

      <div className="px-4 space-y-4">
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
            {me && (
              <div className="bg-[#1A1A2E] border-2 border-[#FF6B35] rounded-2xl p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">Your prediction</p>
                {me.predictedTimeSecs ? (
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-black text-white">{formatTime(me.predictedTimeSecs)}</span>
                    {!windowStarted && (
                      <button
                        onClick={() => { if (predictInput.current) predictInput.current.value = ""; predictInput.current?.focus(); }}
                        className="text-xs text-[#FF6B35] border border-[#FF6B35] px-3 py-1 rounded-lg"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No prediction yet</p>
                )}

                {!windowStarted && (
                  <div className="mt-3 flex gap-2">
                    <input
                      ref={predictInput}
                      placeholder="mm:ss or h:mm:ss"
                      className="flex-1 bg-[#0D0D0D] border border-[#2A2A4A] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FF6B35]"
                    />
                    <button
                      onClick={savePrediction}
                      disabled={saving}
                      className="bg-[#FF6B35] text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
                    >
                      {saving ? "..." : "Save"}
                    </button>
                  </div>
                )}

                {windowStarted && !windowEnded && (
                  <p className="text-xs text-amber-400 mt-2">🔒 Predictions locked — window is open</p>
                )}
                {windowEnded && (
                  <p className="text-xs text-gray-500 mt-2">🏁 Window closed · {windowEnd.toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                )}
              </div>
            )}

            {/* Participants */}
            <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                {localParticipants.length} {localParticipants.length === 1 ? "participant" : "participants"}
              </p>
              <div className="space-y-2">
                {localParticipants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Avatar p={p} />
                    <span className="flex-1 text-sm text-white">{p.name}</span>
                    <span className="text-sm text-gray-400">
                      {p.predictedTimeSecs ? formatTime(p.predictedTimeSecs) : <span className="text-gray-600 text-xs">No prediction</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Window info */}
            <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-gray-300">Activity window</p>
              <p>Opens: {windowStart.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              <p>Closes: {windowEnd.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-gray-500 pt-1">Predictions lock when the window opens. Results are pulled from Strava after the window closes.</p>
            </div>
          </>
        )}

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" && (
          <>
            {windowEnded && (
              <button
                onClick={fetchResults}
                disabled={fetchingResults}
                className="w-full bg-[#1A1A2E] border border-[#FF6B35] text-[#FF6B35] font-bold py-3 rounded-2xl text-sm disabled:opacity-50"
              >
                {fetchingResults ? "Fetching from Strava..." : "🔄 Fetch Results from Strava"}
              </button>
            )}

            {withResults.length > 0 && (
              <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[2rem_1fr_5rem_5rem_4rem] gap-2 px-4 py-2 border-b border-[#2A2A4A]">
                  <span className="text-xs text-gray-500">#</span>
                  <span className="text-xs text-gray-500">Name</span>
                  <span className="text-xs text-gray-500 text-right">Predicted</span>
                  <span className="text-xs text-gray-500 text-right">Actual</span>
                  <span className="text-xs text-gray-500 text-right">Diff</span>
                </div>
                {withResults.map((p, idx) => {
                  const diff = pctDiff(p.predictedTimeSecs!, p.actualTimeSecs!);
                  const isMe = p.userId === currentUserId;
                  const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
                  return (
                    <div
                      key={p.id}
                      className={`grid grid-cols-[2rem_1fr_5rem_5rem_4rem] gap-2 px-4 py-3 items-center border-b border-[#2A2A4A] last:border-0 ${isMe ? "bg-[#FF6B35]/5" : ""}`}
                    >
                      <span className="text-sm">{medal}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar p={p} />
                        <span className={`text-sm truncate ${isMe ? "text-[#FF6B35] font-semibold" : "text-white"}`}>{p.firstName}</span>
                      </div>
                      <span className="text-xs text-gray-400 text-right">{formatTime(p.predictedTimeSecs!)}</span>
                      <span className="text-xs text-white font-semibold text-right">{formatTime(p.actualTimeSecs!)}</span>
                      <span className={`text-xs font-bold text-right ${diff < 1 ? "text-green-400" : diff < 3 ? "text-amber-400" : "text-[#E63946]"}`}>
                        {diff.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {noResult.length > 0 && (
              <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">No qualifying run found</p>
                {noResult.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-1">
                    <Avatar p={p} />
                    <span className="text-sm text-gray-400">{p.name}</span>
                  </div>
                ))}
              </div>
            )}

            {!windowEnded && (
              <div className="text-center py-10 text-gray-500 text-sm">
                Results available after the window closes.
              </div>
            )}

            {windowEnded && withResults.length === 0 && noResult.length === 0 && !fetchingResults && (
              <div className="text-center py-10 text-gray-500 text-sm">
                Tap "Fetch Results" above to pull times from Strava.
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
