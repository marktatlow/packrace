"use client";

import { ChevronDown, Crown } from "lucide-react";
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
  windowEnded: boolean;
  currentUserId: string;
  comments: CommentData[];
};

export default function RunnerCard({
  p, rank, isWinner, isMe, isFastest, isSandbagger, isPb,
  verdict, reactions, isExpanded, onToggle, onReact,
  eventId, windowEnded, currentUserId, comments,
}: Props) {
  const diffSecs = p.predictedTimeSecs && p.actualTimeSecs
    ? Math.abs(p.actualTimeSecs - p.predictedTimeSecs) : null;

  const diffColor = diffSecs === null ? "text-gray-300"
    : diffSecs <= 15 ? "text-green-500"
    : diffSecs <= 45 ? "text-amber-500"
    : "text-red-500";

  return (
    <div className={`bg-white rounded-2xl border transition-all ${isExpanded ? "border-[#F2591E] shadow-md" : "border-[#ECE7DF]"} overflow-hidden`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left" aria-expanded={isExpanded}>
        <div className="relative flex-shrink-0">
          {p.profilePic
            ? <img src={p.profilePic} className={`w-10 h-10 rounded-full object-cover ${isWinner ? "ring-2 ring-[#F2591E] ring-offset-1" : ""}`} alt="" />
            : <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white ${isMe ? "bg-[#F2591E]" : "bg-[#1A2233]"} ${isWinner ? "ring-2 ring-[#F2591E] ring-offset-1" : ""}`}>{p.firstName[0]}</div>
          }
          {isWinner && <Crown size={14} className="absolute -top-2 left-1/2 -translate-x-1/2 text-[#F2591E]" fill="#F4A623" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-black text-base ${isMe ? "text-[#F2591E]" : "text-[#1A2233]"}`}>{p.firstName}</span>
            {isWinner && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#FFF1EA] text-[#F2591E]">WINNER</span>}
            {isFastest && !isWinner && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-500">⚡ FASTEST</span>}
            {isSandbagger && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">🎭 SANDBAGGER</span>}
            {isPb && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-50 text-green-600">🏅 PB</span>}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {p.predictedTimeSecs ? <>Predicted <span className="font-bold text-[#1A2233]">{formatTime(p.predictedTimeSecs)}</span></> : <span className="italic">No prediction yet</span>}
            {p.actualTimeSecs && <> · ran <span className="font-bold text-[#1A2233]">{formatTime(p.actualTimeSecs)}</span></>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-base font-black tabular-nums ${diffColor}`}>
            {diffSecs !== null ? `${diffSecs}s` : rank < 3 ? RANK_EMOJI[rank] : `${rank + 1}`}
          </span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-dashed border-[#ECE7DF]">
          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { label: "My Prediction", value: p.predictedTimeSecs ? formatTime(p.predictedTimeSecs) : "—", accent: false },
              { label: "Tips' Read", value: p.vdotPredictedSecs ? formatTime(p.vdotPredictedSecs) : "—", accent: true },
              { label: "Result", value: p.actualTimeSecs ? formatTime(p.actualTimeSecs) : "—", accent: false },
            ].map(({ label, value, accent }) => (
              <div key={label} className="bg-[#FBF8F3] rounded-xl p-2.5 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-sm font-black tabular-nums ${accent ? "text-[#F2591E]" : "text-[#1A2233]"}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Tips verdict */}
          {verdict && (windowEnded && verdict.postRaceVerdict ? (
            <div className="mt-3 space-y-2">
              <div className="bg-[#FFF8F5] border border-[#FFF1EA] rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <img src="/tips-avatar.jpeg" alt="Tips" className="w-5 h-5 rounded-full object-cover border border-[#F2591E]" />
                  <p className="text-[10px] font-black text-[#F2591E] uppercase tracking-wider">Tips' Post-Race Verdict</p>
                </div>
                <p className="text-sm text-[#1A2233] italic leading-relaxed">{verdict.postRaceVerdict}</p>
              </div>
              {verdict.tip && (
                <div className="bg-[#FBF8F3] border border-[#ECE7DF] rounded-xl p-3">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Pre-race call</p>
                  <p className="text-xs text-gray-500 italic leading-relaxed">{verdict.tip}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 bg-[#FFF8F5] border border-[#FFF1EA] rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <img src="/tips-avatar.jpeg" alt="Tips" className="w-5 h-5 rounded-full object-cover border border-[#F2591E]" />
                <p className="text-[10px] font-black text-[#F2591E] uppercase tracking-wider">Tips' Verdict</p>
              </div>
              <p className="text-sm text-[#1A2233] italic leading-relaxed">{verdict.tip}</p>
            </div>
          ))}

          {/* Reactions */}
          <ReactionBar reactions={reactions} onReact={onReact} />

          {/* Per-runner comments */}
          <div className="mt-4 pt-3 border-t border-dashed border-[#ECE7DF]">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">
              💬 Banter{comments.length > 0 && <span className="text-[#F2591E] ml-1">· {comments.length}</span>}
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all active:scale-95 ${mine ? "border-[#F2591E] bg-[#FFF1EA]" : "border-[#ECE7DF] bg-white hover:border-[#F2591E]"}`}>
            <span>{emoji}</span>
            {count > 0 && <span className={`text-xs font-black ${mine ? "text-[#F2591E]" : "text-gray-500"}`}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
