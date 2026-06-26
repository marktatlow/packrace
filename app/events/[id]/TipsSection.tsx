"use client";
import type { RaceCardCommentary } from "@/lib/racecard";
import { ReactionBar } from "./RunnerCard";
import type { ReactionsMap } from "./page";

type Props = {
  commentary: RaceCardCommentary | null;
  generatedAt: string | undefined;
  windowEnded: boolean;
  eventId: string;
  reactions: ReactionsMap;
  onReact: (targetType: "runner" | "tipster", targetId: string, emoji: string) => void;
  cardCopied: boolean;
  onCopyRaceCard: () => void;
};

export default function TipsSection({ commentary, generatedAt, windowEnded, eventId, reactions, onReact, cardCopied, onCopyRaceCard }: Props) {
  return (
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
          <button onClick={onCopyRaceCard}
            className="bg-[#12151D] border border-white/10 text-white/70 text-xs font-semibold px-3 py-2 rounded-xl hover:border-[#FF2D94] hover:text-[#FF2D94] transition-colors whitespace-nowrap shadow-sm">
            {cardCopied ? "Copied!" : "Share"}
          </button>
        )}
      </div>

      {commentary ? (
        <div className="space-y-3">
          {!windowEnded && (
            <div className="bg-[#12151D] rounded-2xl card-depth border border-white/10 p-4">
              <p className="text-[10px] font-black text-[#FF2D94] uppercase tracking-wider mb-2">🎩 Pre-Race Overview</p>
              <p className="text-white/70 text-sm leading-relaxed italic">{commentary.intro}</p>
              <ReactionBar
                reactions={reactions[eventId] ?? {}}
                onReact={(emoji) => onReact("tipster", eventId, emoji)}
              />
            </div>
          )}

          {windowEnded && (
            <div className="bg-[#0B0D12] rounded-2xl p-4">
              <p className="text-[10px] font-black text-[#FF2D94] uppercase tracking-wider mb-2">🎩 Post-Race Verdict</p>
              <p className="text-white/90 text-sm leading-relaxed italic">
                {commentary.postRaceIntro ?? commentary.intro}
              </p>
              <ReactionBar
                reactions={reactions[eventId] ?? {}}
                onReact={(emoji) => onReact("tipster", eventId, emoji)}
              />
            </div>
          )}

          <p className="text-center text-xs text-white/50">
            Generated {generatedAt ? new Date(generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
            {windowEnded && !commentary.postRaceIntro && (
              <span className="block text-[#FF2D94] mt-1">Regenerate for post-race verdicts ↑</span>
            )}
          </p>
        </div>
      ) : (
        <div className="bg-[#12151D] rounded-2xl card-depth border border-white/10 p-8 text-center">
          <p className="text-4xl mb-2">🎙️</p>
          <p className="text-white/65 text-sm font-semibold">{windowEnded ? "No post-race verdict yet." : "No pre-race tips yet."}</p>
          <p className="text-white/50 text-xs mt-1">Tips auto-generates when runners join. Check back shortly.</p>
        </div>
      )}
    </section>
  );
}
