import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { RaceCardCommentary } from "@/lib/racecard";
import RaceCardView from "@/app/components/RaceCardView";

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

  return (
    <main className="min-h-screen bg-[#0B0D12] py-6 pb-16">
      <RaceCardView
        event={{ name: event.name, distanceKm: event.distanceKm, date: event.date, location: event.location }}
        participants={event.participants.map((p) => ({
          id: p.id,
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          profilePic: p.user.profilePic,
          predictedTimeSecs: p.predictedTimeSecs,
          personalBestSecs: p.personalBestSecs,
        }))}
        commentary={commentary}
        generatedAt={event.raceCard?.generatedAt}
      />
    </main>
  );
}
