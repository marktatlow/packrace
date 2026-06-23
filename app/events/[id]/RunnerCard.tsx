"use client";

import { ChevronDown, Crown, Lock } from "lucide-react";
import { formatTime } from "@/lib/format";
import type { ReactionsMap } from "./page";
import CommentThread, { type CommentData } from "./CommentThread";

const EMOJIS = ["🔥", "🐍", "🤥", "😂", "💀"];
const RANK_EMOJI = ["🥇", "🥈", "🥉"];

type Participant = {
  id: string;
  userId: string;
  firstName: string;
  profilePic: string | null;
  predictedTimeSecs: number | null;
  actualTimeSecs: number | null;
  vdotPredictedSecs: number | null;
};

type Verdict = {
  name: string;
  label: string | null;
  tip: string;
  odds?: string;
  oddsNote?: string;
  postRaceVerdict?: string;
} | undefined;

type Props = {
  p: Participant;
  rank: number;
  isWinner: boolean;
  isMe: boolean;
  isFastest: boolean;
  isSandbagger: boolean;
  isPb: boolean;
  verdict: Verdict;
  reactions: ReactionsMap[string];
  isExpanded: boolean;
  onToggle: () => void;
  onReact: (emoji: string) => void;
  eventId: string;
  windowStarted: boolean;
  windowEnded: boolean;
  currentUserId: string;
  comments: CommentData[];
};

export default function RunnerCard({
  p, rank, isWinner, isMe, isFastest, isSandbagger, isPb,
  verdict, reactions, isExpanded, onToggle, onReact,
  eventId, windowStarted, windowEnded, currentUserId, comments,
}: Props) {
  const diffSecs = p.predictedTimeSecs && p.actualTimeSecs
    ? Math.abs(p.actualTimeSecs - p.predictedTimeSecs) : null;

  const diffColor = diffSecs === null ? "text-white/30"
    : diffSecs <= 15 ? "text-[#39FF72]"
    : diffSecs <= 45 ? "text-[#FF6A3D]"
    : "text-red-500";

  const oddsLocked = windowStarted || windowEnded;

  return (
    <div className={`bg-[#13151C] rounded-2xl border transition-all ${isExpanded ? "border-[#FF2D94] shadow-[0_0_20px_rgba(255,45,148,0.15)]" : "border-white/8"} overflow-hidden`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={isExpanded}>
        <div className="relative flex-shrink-0">
          {p.profilePic
            ? <img src={p.profilePic} className={`w-10 h-10 rounded-full object-cover ${isWinner ? "ring-2 ring-[#FF2D94] ring-offset-1" : ""}`} alt="" />
            : <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white ${isMe ? "bg-[#FF2D94]" : "bg-[#0D0F14]"} ${isWinner ? "ring-2 ring-[#FF2D94] ring-offset-1" : ""}`}>{p.firstName[0]}</div>
          }
          {isWinner && <Crown size={14} className="absolute -top-2 left-1/2 -translate-x-1/2 text-[#FF2D94]" fill="#F4A623" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-black text-base ${isMe ? "text-[#FF2D94]" : "text-[#F4F4F7]"}`}>{p.firstName}</span>
            {isWinner && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#FF2D94]/10 text-[#FF2D94]">WINNER</span>}
            {isFastest && !isWinner && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#00B7FF]/10 text-[#00B7FF]">⚡ FASTEST</span>}
            {isSandbagger && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#FF6A3D]/10 text-[#FF6A3D]">🎭 SANDBAGGER</span>}
            {isPb && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#39FF72]/10 text-[#39FF72]">🏅 PB</span>}
          </div>
          <div className="text-xs text-white/70 mt-0.5">
            {p.predictedTimeSecs ? <>Predicted <span className="font-bold text-[#F4F4F7]">{formatTime(p.predictedTimeSecs)}</span></> : <span className="italic">No prediction yet</span>}
            {p.actualTimeSecs && <> · ran <span className="font-bold text-[#F4F4F7]">{formatTime(p.actualTimeSecs)}</span></>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-base font-black tabular-nums ${diffColor}`}>
            {diffSecs !== null ? `${diffSecs}s` : rank < 3 ? RANK_EMOJI[rank] : `${rank + 1}`}
          </span>
          <ChevronDown size={16} className={`text-white/65 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-dashed border-white/10">

          {/* Stat tiles — My Prediction + Result only */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-[#1A1D26] rounded-xl p-2.5 text-center">
              <p className="text-[9px] font-black text-white/65 uppercase tracking-wider mb-1">My Prediction</p>
              <p className="text-sm font-black tabular-nums text-[#F4F4F7]">
                {p.predictedTimeSecs ? formatTime(p.predictedTimeSecs) : "—"}
              </p>
            </div>
            <div className="bg-[#1A1D26] rounded-xl p-2.5 text-center">
              <p className="text-[9px] font-black text-white/65 uppercase tracking-wider mb-1">Result</p>
              <p className="text-sm font-black tabular-nums text-[#F4F4F7]">
                {p.actualTimeSecs ? formatTime(p.actualTimeSecs) : "—"}
              </p>
            </div>
          </div>

          {/* Tips Verdict */}
          {verdict && (windowEnded && verdict.postRaceVerdict ? (
            <div className="mt-3 space-y-2">
              <div className="bg-[#1A1D26] border border-[#FF2D94]/20 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <img src="/tips-avatar.jpeg" alt="Tips" className="w-5 h-5 rounded-full object-cover border border-[#FF2D94]" />
                  <p className="text-[10px] font-black text-[#FF2D94] uppercase tracking-wider">Tips' Post-Race Verdict</p>
                </div>
                <p className="text-sm text-[#F4F4F7] italic leading-relaxed">{verdict.postRaceVerdict}</p>
              </div>
              {verdict.tip && (
                <div className="bg-[#1A1D26] border border-white/10 rounded-xl p-3">
                  <p className="text-[10px] font-black text-white/65 uppercase tracking-wider mb-1">Pre-race call</p>
                  <p className="text-xs text-white/70 italic leading-relaxed">{verdict.tip}</p>
                </div>
              )}
            </div>
          ) : (
            verdict.tip ? (
              <div className="mt-3 bg-[#1A1D26] border border-[#FF2D94]/20 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <img src="/tips-avatar.jpeg" alt="Tips" className="w-5 h-5 rounded-full object-cover border border-[#FF2D94]" />
                  <p className="text-[10px] font-black text-[#FF2D94] uppercase tracking-wider">Tips' Verdict</p>
                </div>
                <p className="text-sm text-[#F4F4F7] italic leading-relaxed">{verdict.tip}</p>
              </div>
            ) : null
          ))}

          {/* Tips Odds — pre-race only, locks when event starts */}
          {verdict && verdict.odds && !windowEnded && (
            <div className={`mt-2 rounded-xl p-3 border ${oddsLocked ? "bg-[#0D0F14] border-white/10" : "bg-[#1A1D26] border-[#39FF72]/20"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <img src="/tips-avatar.jpeg" alt="Tips" className="w-5 h-5 rounded-full object-cover border border-[#39FF72]" />
                  <p className="text-[10px] font-black text-[#39FF72] uppercase tracking-wider">Tips Odds</p>
                </div>
                {oddsLocked && (
                  <span className="flex items-center gap-1 text-[10px] text-white/40 font-bold">
                    <Lock size={10} /> Locked
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-white/65 italic leading-snug flex-1">{verdict.oddsNote}</p>
                <span className={`text-lg font-black tabular-nums whitespace-nowrap ${oddsLocked ? "text-white/40" : "text-[#39FF72]"}`}>
                  {verdict.odds}
                </span>
              </div>
              {!oddsLocked && (
                <p className="text-[10px] text-white/30 mt-1.5">Updates as runners join · locks at race start</p>
              )}
            </div>
          )}

          {/* Reactions */}
          <ReactionBar reactions={reactions} onReact={onReact} />

          {/* Per-runner comments */}
          <div className="mt-4 pt-3 border-t border-dashed border-white/10">
            <p className="text-[10px] font-black text-white/65 uppercase tracking-wider mb-2">
              💬 Banter{comments.length > 0 && <span className="text-[#FF2D94] ml-1">· {comments.length}</span>}
            </p>
            <CommentThread eventId={eventId} targetType="runner" targetId={p.id} currentUserId={currentUserId} initialComments={comments} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ReactionBar({ reactions, onReact }: { reactions: ReactionsMap[string] | undefined; onReact: (emoji: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {EMOJIS.map((emoji) => {
        const data = reactions?.[emoji];
        const count = data?.count ?? 0;
        const mine = data?.mine ?? false;
        return (
          <button key={emoji} onClick={() => onReact(emoji)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all active:scale-95 ${mine ? "border-[#FF2D94] bg-[#FF2D94]/15 shadow-[0_0_8px_rgba(255,45,148,0.3)]" : "border-white/15 bg-white/5 hover:border-[#FF2D94]/50 hover:bg-[#FF2D94]/5"}`}>
            <span>{emoji}</span>
            {count > 0 && <span className={`text-xs font-black ${mine ? "text-[#FF2D94]" : "text-white/70"}`}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
