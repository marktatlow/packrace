import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatTime } from "@/lib/format";
import type { RaceCardCommentary } from "@/lib/racecard";

const labelStyles: Record<string, { bg: string; text: string; emoji: string }> = {
  SHARP:       { bg: "bg-green-500/20",  text: "text-green-400",  emoji: "⚡" },
  "DARK HORSE": { bg: "bg-purple-500/20", text: "text-purple-400", emoji: "🐴" },
  SANDBAGGING: { bg: "bg-amber-500/20",  text: "text-amber-400",  emoji: "🎭" },
  PAP:         { bg: "bg-red-500/20",    text: "text-red-400",    emoji: "💩" },
};

export default async function RaceCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      raceCard: true,
      participants: {
        include: { user: true },
        where: { predictedTimeSecs: { not: null } },
        orderBy: { predictedTimeSecs: "asc" },
      },
    },
  });

  if (!event) notFound();

  const commentary: RaceCardCommentary | null = event.raceCard
    ? JSON.parse(event.raceCard.commentary)
    : null;

  const eventDate = new Date(event.date);

  return (
    <main className="min-h-screen bg-[#0D0D0D] max-w-[430px] mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-[#FF6B35] text-xs font-bold uppercase tracking-widest mb-2">Race Card</p>
        <h1 className="text-2xl font-black text-white mb-1">{event.name}</h1>
        <p className="text-gray-400 text-sm">
          {event.distanceKm}km · {eventDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          {event.location && ` · ${event.location}`}
        </p>
      </div>

      {/* Runners ordered by predicted time */}
      <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-[#2A2A4A]">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Starting Order (by predicted time)</p>
        </div>
        {event.participants.map((p, idx) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#2A2A4A] last:border-0">
            <span className="text-lg w-6 text-center">
              {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : <span className="text-gray-600 text-sm">{idx + 1}</span>}
            </span>
            {p.user.profilePic
              ? <img src={p.user.profilePic} className="w-10 h-10 rounded-full object-cover" alt={p.user.firstName} />
              : <div className="w-10 h-10 rounded-full bg-[#2A2A4A] flex items-center justify-center font-bold text-white">{p.user.firstName[0]}</div>
            }
            <div className="flex-1">
              <p className="text-white font-semibold">{p.user.firstName} {p.user.lastName}</p>
              {p.personalBestSecs && (
                <p className="text-xs text-gray-500">PB {formatTime(p.personalBestSecs)}</p>
              )}
            </div>
            <span className="text-[#FF6B35] font-black text-lg">{formatTime(p.predictedTimeSecs!)}</span>
          </div>
        ))}
      </div>

      {/* Tip's Tips */}
      {commentary ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎙️</span>
            <h2 className="text-lg font-black text-white">Tip's Tips</h2>
          </div>

          <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
            <p className="text-gray-300 text-sm leading-relaxed italic">{commentary.intro}</p>
          </div>

          <div className="space-y-3">
            {commentary.tips.map((tip, idx) => {
              const style = tip.label ? labelStyles[tip.label] : null;
              return (
                <div key={idx} className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-white">{tip.name}</span>
                    {style && tip.label && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                        {style.emoji} {tip.label}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{tip.tip}</p>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-gray-600 pt-2">
            Generated {new Date(event.raceCard!.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 text-sm">
          <p className="text-3xl mb-3">🎙️</p>
          <p>Race card commentary hasn't been generated yet.</p>
        </div>
      )}
    </main>
  );
}
