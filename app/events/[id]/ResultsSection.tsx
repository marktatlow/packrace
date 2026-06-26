"use client";
import { formatTime } from "@/lib/format";
import type { RaceCardCommentary } from "@/lib/racecard";
import RunnerCard from "./RunnerCard";
import type { ReactionsMap, CommentsMap } from "./page";

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
  participants: Participant[];
  commentary: RaceCardCommentary | null;
  currentUserId: string;
  windowStarted: boolean;
  windowEnded: boolean;
  eventId: string;
  reactions: ReactionsMap;
  comments: CommentsMap;
  expandedCard: string | null;
  onToggleExpand: (id: string | null) => void;
  onReact: (targetType: "runner" | "tipster", targetId: string, emoji: string) => void;
  fetchResults: () => void;
  fetchingResults: boolean;
};

export default function ResultsSection({
  participants, commentary, currentUserId, windowStarted, windowEnded, eventId,
  reactions, comments, expandedCard, onToggleExpand, onReact, fetchResults, fetchingResults,
}: Props) {
  // Sort participants
  const sorted = [...participants].sort((a, b) => {
    if (!windowStarted) {
      if (!a.predictedTimeSecs) return 1;
      if (!b.predictedTimeSecs) return -1;
      return a.predictedTimeSecs - b.predictedTimeSecs;
    }

    const aMargin = a.vdotPredictedSecs && a.actualTimeSecs
      ? a.vdotPredictedSecs - a.actualTimeSecs
      : a.actualTimeSecs ? -Infinity
      : null;
    const bMargin = b.vdotPredictedSecs && b.actualTimeSecs
      ? b.vdotPredictedSecs - b.actualTimeSecs
      : b.actualTimeSecs ? -Infinity
      : null;

    if (aMargin !== null && bMargin !== null) return bMargin - aMargin;
    if (aMargin !== null) return -1;
    if (bMargin !== null) return 1;

    const aEst = a.vdotPredictedSecs ?? a.predictedTimeSecs ?? Infinity;
    const bEst = b.vdotPredictedSecs ?? b.predictedTimeSecs ?? Infinity;
    return aEst - bEst;
  });

  const hasAnyActual = participants.some((p) => p.actualTimeSecs);
  const withResults = sorted.filter((p) => p.predictedTimeSecs && p.actualTimeSecs);
  const winner = withResults.length > 0
    ? withResults
        .filter((p) => p.vdotPredictedSecs != null && p.actualTimeSecs! < p.vdotPredictedSecs)
        .sort((a, b) => (b.vdotPredictedSecs! - b.actualTimeSecs!) - (a.vdotPredictedSecs! - a.actualTimeSecs!))[0]
        ?? null
    : null;
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

  return (
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
        {/* Strava attribution — required by Strava API Brand Guidelines */}
        <a href="https://www.strava.com" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 opacity-50 hover:opacity-80 transition-opacity flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#FC4C02"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
          <span className="text-[9px] font-bold text-white/50">Powered by Strava</span>
        </a>
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
          <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-2">👑 Winner — Beat the Estimate</p>
          <div className="flex items-center gap-3">
            {winner.profilePic
              ? <img src={winner.profilePic} className="w-14 h-14 rounded-full object-cover border-2 border-white/20 flex-shrink-0" alt="" />
              : <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/20 flex items-center justify-center text-xl font-black text-white flex-shrink-0">{winner.firstName[0]}</div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-lg font-black text-white">{winner.firstName}</p>
              <p className="text-white/70 text-xs">
                {winner.vdotPredictedSecs
                  ? <>Est. {formatTime(winner.vdotPredictedSecs)} · beat by <span className="text-white font-black">{winner.vdotPredictedSecs - winner.actualTimeSecs!}s</span></>
                  : <>Ran <span className="text-white font-black">{formatTime(winner.actualTimeSecs!)}</span></>
                }
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
              hasAnyResults={hasAnyActual}
              verdict={verdict}
              reactions={reactions[p.id] ?? {}}
              isExpanded={expandedCard === p.id}
              onToggle={() => onToggleExpand(expandedCard === p.id ? null : p.id)}
              onReact={(emoji) => onReact("runner", p.id, emoji)}
              eventId={eventId}
              windowStarted={windowStarted}
              windowEnded={windowEnded}
              currentUserId={currentUserId}
              comments={comments[p.id] ?? []}
            />
          );
        })}
      </div>

      {/* Refresh button */}
      {(windowStarted || windowEnded) && (
        <button onClick={fetchResults} disabled={fetchingResults}
          className="w-full text-xs text-white/60 font-semibold py-2 rounded-xl border border-white/10 hover:border-[#FF2D94] hover:text-[#FF2D94] transition-colors disabled:opacity-40 bg-[#12151D]">
          {fetchingResults ? "Fetching results…" : "🔄 Refresh Results"}
        </button>
      )}

      {/* ── TROPHY PRESENTATION (post-race only) ── */}
      {windowEnded && withResults.length >= 2 && (() => {
        const worstPerformer = withResults.reduce((worst, p) => {
          const gap = p.actualTimeSecs! - p.predictedTimeSecs!;
          const worstGap = worst.actualTimeSecs! - worst.predictedTimeSecs!;
          return gap > worstGap ? p : worst;
        }, withResults[0]);
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
            person: withResults.length > 0 ? withResults.reduce((best, p) => {
              const bDiff = Math.abs(best.actualTimeSecs! - best.predictedTimeSecs!);
              const pDiff = Math.abs(p.actualTimeSecs! - p.predictedTimeSecs!);
              return pDiff < bDiff ? p : best;
            }, withResults[0]) : null,
            stat: (() => { const p = withResults.length > 0 ? withResults.reduce((best, p) => Math.abs(p.actualTimeSecs! - p.predictedTimeSecs!) < Math.abs(best.actualTimeSecs! - best.predictedTimeSecs!) ? p : best, withResults[0]) : null; return p ? `Off by ${Math.abs(p.actualTimeSecs! - p.predictedTimeSecs!)}s` : null; })(),
            bg: "bg-[#171B25]",
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
            <div className="bg-[#12151D] rounded-2xl card-depth border border-white/10 p-4">
              <p className="text-[10px] font-black text-[#00B7FF] uppercase tracking-wider mb-1">⚡ Fastest so far</p>
              <p className="text-[#F4F4F7] font-bold">{fastest.firstName}</p>
              <p className="text-[#00B7FF] font-black text-xl tabular-nums">{formatTime(fastest.actualTimeSecs!)}</p>
            </div>
          )}
          {winner && (
            <div className="bg-[#12151D] rounded-2xl card-depth border border-white/10 p-4">
              <p className="text-[10px] font-black text-[#FF2D94] uppercase tracking-wider mb-1">🎯 Leading</p>
              <p className="text-[#F4F4F7] font-bold">{winner.firstName}</p>
              <p className="text-[#FF2D94] font-black text-xl tabular-nums">{winner.vdotPredictedSecs ? `Beat est. by ${winner.vdotPredictedSecs - winner.actualTimeSecs!}s` : formatTime(winner.actualTimeSecs!)}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
