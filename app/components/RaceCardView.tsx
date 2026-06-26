"use client";
import { formatTime } from "@/lib/format";
import type { RaceCardCommentary } from "@/lib/racecard";
import { Trophy, Medal, Star, Flag, Crown, Award, CloudSun } from "lucide-react";

const DIVISION_ICONS = [Crown, Trophy, Medal, Star, Award, Flag];
const TILTS = [-1.5, 1.5, -1, 1, -1.5, 1];

export type RaceCardParticipant = {
  id: string;
  firstName: string;
  lastName?: string | null;
  profilePic: string | null;
  predictedTimeSecs: number | null;
  personalBestSecs?: number | null;
};

type Props = {
  event: { name: string; distanceKm: number; date: string | Date; location: string | null };
  participants: RaceCardParticipant[];
  commentary: RaceCardCommentary | null;
  generatedAt?: string | Date | null;
  // When embedded in a narrow, width-constrained parent (e.g. the event page,
  // capped at max-w-[430px]), the 2-column lg: layout must be disabled —
  // lg: is a VIEWPORT breakpoint, so on a full-width desktop it still fires
  // even though the actual available width is only ~400px, squashing the
  // sidebar into the main column. Standalone /race-card/[id] has no such cap.
  embedded?: boolean;
};

export default function RaceCardView({ event, participants, commentary, generatedAt, embedded = false }: Props) {
  const eventDate = new Date(event.date);
  const byName = new Map(participants.map((p) => [p.firstName, p]));
  const tipByName = new Map((commentary?.tips ?? []).map((t) => [t.name, t]));
  const tiers = commentary?.tiers ?? [];
  const briefing = commentary?.postRaceIntro ?? commentary?.intro ?? null;

  return (
    <div className="bg-[#0B0D12] rounded-[28px] max-w-5xl mx-auto px-5 py-6 overflow-hidden relative">
      {/* Neon glow accents */}
      <div className="absolute top-0 left-0 w-56 h-56 bg-[#FF2D94]/15 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute top-20 right-0 w-40 h-40 bg-[#00B7FF]/12 rounded-full blur-3xl pointer-events-none translate-x-1/2" />

      {/* ── HEADER ── */}
      <div className="relative mb-6">
        <div className="flex items-center justify-between mb-4">
          <span
            className="inline-block bg-[#FF2D94] text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-[0_4px_0_rgba(0,0,0,0.25)]"
            style={{ transform: "rotate(-2deg)" }}
          >
            🎉 RaceParty Presents
          </span>
          <div className="flex items-center gap-1.5">
            <img src="/raceparty-icon.png" alt="" className="w-7 h-7" />
            <img src="/raceparty-wordmarkx.png" alt="RaceParty" className="h-5 w-auto" />
          </div>
        </div>

        <h1 className="text-[#F4F4F7] text-3xl font-black leading-tight">{event.name}</h1>

        <p
          className="text-4xl font-black uppercase tracking-tight mt-1"
          style={{
            color: "#00B7FF",
            textShadow: "0 0 14px rgba(0,183,255,0.8), 0 0 32px rgba(0,183,255,0.4)",
            WebkitTextStroke: "1px rgba(0,183,255,0.5)",
            transform: "rotate(-1deg)",
            display: "inline-block",
          }}
        >
          Race Card ✨
        </p>

        <p className="text-white/60 text-sm mt-2">
          {eventDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          {" · "}{event.distanceKm}km{event.location && ` · ${event.location}`}
        </p>
      </div>

      {/* ── CONDITIONS ── */}
      {commentary?.conditions && commentary.conditions.length > 0 && (
        <div className="bg-[#12151D] rounded-[28px] p-4 mb-6 relative shadow-[0_6px_0_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-2 mb-3">
            <CloudSun size={16} className="text-[#00B7FF]" />
            <p className="text-[11px] font-black uppercase tracking-widest text-[#00B7FF]">Conditions on the Day</p>
          </div>
          <div className={`grid grid-cols-2 gap-2.5 ${embedded ? "" : "sm:grid-cols-4"}`}>
            {commentary.conditions.map((c) => (
              <div key={c.city} className="bg-white/5 rounded-2xl px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">{c.icon}</span>
                  <p className="text-white/80 font-bold text-sm truncate">{c.city}</p>
                </div>
                <p className="text-white/40 text-[10px] mt-0.5">{c.tempC.toFixed(0)}°C · {c.humidityPct.toFixed(0)}% hum</p>
                <p className={`font-black text-sm tabular-nums mt-0.5 ${c.adjustmentPct > 3 ? "text-[#FF6A3D]" : "text-[#39FF72]"}`}>
                  +{c.adjustmentPct.toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-white/30 mt-3 leading-relaxed">
            Rough heat/humidity estimate only — not applied to predictions.
          </p>
        </div>
      )}

      {/* ── BODY: divisions (left) + sidebar (right) ── */}
      <div className={`flex flex-col gap-6 ${embedded ? "" : "lg:flex-row"}`}>
        <div className="flex-1 min-w-0">
          {/* ── DIVISIONS ── */}
          {tiers.length > 0 ? (
            <div className="space-y-5 mb-10 relative">
              {tiers.map((tier, i) => {
                const Icon = DIVISION_ICONS[i % DIVISION_ICONS.length];
                return (
                  <div
                    key={tier.tierName}
                    className="rounded-[28px] overflow-hidden bg-[#12151D]"
                    style={{
                      boxShadow: `0 6px 0 rgba(0,0,0,0.25), 0 0 0 2px ${tier.accent}40`,
                      transform: `rotate(${TILTS[i % TILTS.length]}deg)`,
                    }}
                  >
                    {/* Division header */}
                    <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: `${tier.accent}18` }}>
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `${tier.accent}28`, boxShadow: `0 3px 0 ${tier.accent}55` }}
                      >
                        <Icon size={18} style={{ color: tier.accent }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: tier.accent }}>
                          Div {String(i + 1).padStart(2, "0")}
                        </p>
                        <p className="text-base font-black text-[#F4F4F7] leading-tight">{tier.tierName}</p>
                      </div>
                    </div>

                    {/* Runners — grid of compact chips */}
                    <div className={`grid grid-cols-2 gap-3 px-4 py-4 ${embedded ? "" : "sm:grid-cols-3"}`}>
                      {tier.runnerNames.map((name) => {
                        const p = byName.get(name);
                        if (!p) return null;
                        const tip = tipByName.get(name);
                        return (
                          <div key={name} className="bg-white/5 rounded-2xl p-3 flex flex-col items-center text-center">
                            {p.profilePic
                              ? <img src={p.profilePic} className="w-12 h-12 rounded-full object-cover border-2 mb-1.5" style={{ borderColor: tier.accent }} alt={name} />
                              : <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-sm mb-1.5" style={{ background: `${tier.accent}28`, color: tier.accent, border: `2px solid ${tier.accent}` }}>{name[0]}</div>
                            }
                            <p className="text-xs font-bold text-[#F4F4F7] truncate w-full">{name}</p>
                            <span className="text-[10px] font-black tabular-nums px-2 py-0.5 rounded-full bg-black/30 text-white/60 mt-1.5">
                              PRED {formatTime(p.predictedTimeSecs!)}
                            </span>
                            {(tip?.fastestOdds || tip?.odds) && (
                              <div className="flex gap-1 mt-1.5 flex-wrap justify-center">
                                {tip?.fastestOdds && (
                                  <span className="text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-full bg-[#39FF72]/15 text-[#39FF72]">
                                    🏆 {tip.fastestOdds}
                                  </span>
                                )}
                                {tip?.odds && (
                                  <span className="text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-full bg-[#00B7FF]/15 text-[#00B7FF]">
                                    🎯 {tip.odds}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* The story */}
                    {tier.story && (
                      <div className="px-4 py-3.5 bg-black/15">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">📖 The Story</p>
                        <p className="text-white/70 text-xs leading-relaxed italic">{tier.story}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback flat list — small fields without divisions */
            <div className="bg-[#12151D] rounded-[28px] overflow-hidden mb-10 shadow-[0_6px_0_rgba(0,0,0,0.25)]">
              <div className="px-4 py-3">
                <p className="text-[10px] font-black text-white/50 uppercase tracking-widest">Starting Order (by predicted time)</p>
              </div>
              {participants.map((p, idx) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-t border-white/8">
                  <span className="text-lg w-6 text-center">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : <span className="text-white/40 text-sm">{idx + 1}</span>}
                  </span>
                  {p.profilePic
                    ? <img src={p.profilePic} className="w-10 h-10 rounded-full object-cover" alt={p.firstName} />
                    : <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-white">{p.firstName[0]}</div>
                  }
                  <div className="flex-1">
                    <p className="text-[#F4F4F7] font-semibold">{p.firstName} {p.lastName ?? ""}</p>
                    {p.personalBestSecs && (
                      <p className="text-xs text-white/40">PB {formatTime(p.personalBestSecs)}</p>
                    )}
                  </div>
                  <span className="text-[#FF2D94] font-black text-lg">{formatTime(p.predictedTimeSecs!)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* ── SIDEBAR: Tips' briefing ── */}
        <div className={embedded ? "" : "lg:w-[300px] lg:shrink-0"}>
          {/* ── TIPS' BRIEFING — comic-style speech bubble ── */}
          {briefing && (
            <div className="relative mt-4 mb-2">
              {/* Comic bubble */}
              <div
                className="bg-white rounded-[32px] p-5 pr-6 relative"
                style={{
                  border: "3px solid #0B0D12",
                  boxShadow: "5px 5px 0 #0B0D12",
                  transform: "rotate(-0.5deg)",
                }}
              >
                <span
                  className="inline-block bg-[#FFC700] text-[#0B0D12] text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-2"
                  style={{ border: "2px solid #0B0D12", transform: "rotate(-3deg)" }}
                >
                  💬 Tips Says…
                </span>
                <p className="text-[#0B0D12] text-[15px] leading-relaxed font-semibold">{briefing}</p>

                {/* Comic tail — chunky, double-bubble style */}
                <div
                  className="absolute bottom-[-16px] right-16 w-7 h-7 bg-white rounded-full"
                  style={{ border: "3px solid #0B0D12" }}
                />
                <div
                  className="absolute bottom-[-28px] right-10 w-4 h-4 bg-white rounded-full"
                  style={{ border: "3px solid #0B0D12" }}
                />
              </div>

              {/* Big Tips character */}
              <div className="flex justify-end -mt-2 -mr-2">
                <img
                  src="/tips_commentator.png"
                  alt="Tips"
                  className="w-[230px] h-auto drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
                  style={{ transform: "rotate(1deg)" }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {commentary && generatedAt && (
        <p className="text-center text-xs text-white/30 pt-2">
          Generated {new Date(generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      {!commentary && (
        <div className="text-center py-8 text-white/40 text-sm">
          <p className="text-3xl mb-3">🎙️</p>
          <p>Race card commentary hasn&apos;t been generated yet.</p>
        </div>
      )}
    </div>
  );
}
