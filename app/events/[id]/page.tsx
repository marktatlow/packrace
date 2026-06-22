import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EventDetailClient from "./EventDetailClient";

export type ReactionsMap = {
  [targetId: string]: {
    [emoji: string]: { count: number; mine: boolean };
  };
};

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");

  const { id } = await params;

  const [event, rawReactions] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: { participants: { include: { user: true } }, raceCard: true },
    }),
    prisma.reaction.findMany({ where: { eventId: id } }),
  ]);

  if (!event) notFound();

  const isParticipant = event.participants.some((p) => p.userId === session.userId);
  const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL}/join/${event.inviteCode}`;
  const now = new Date();
  const windowStarted = now >= event.windowStart;
  const windowEnded = now > event.windowEnd;

  // Build reactions map: targetId → emoji → { count, mine }
  const reactionsMap: ReactionsMap = {};
  for (const r of rawReactions) {
    if (!reactionsMap[r.targetId]) reactionsMap[r.targetId] = {};
    if (!reactionsMap[r.targetId][r.emoji]) reactionsMap[r.targetId][r.emoji] = { count: 0, mine: false };
    reactionsMap[r.targetId][r.emoji].count++;
    if (r.authorId === session.userId) reactionsMap[r.targetId][r.emoji].mine = true;
  }

  const participants = event.participants.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: `${p.user.firstName} ${p.user.lastName}`,
    firstName: p.user.firstName,
    profilePic: p.user.profilePic,
    predictedTimeSecs: p.predictedTimeSecs,
    actualTimeSecs: p.actualTimeSecs,
    vdotPredictedSecs: p.vdotPredictedSecs,
    personalBestSecs: p.personalBestSecs,
    resultFetchedAt: p.resultFetchedAt?.toISOString() ?? null,
  }));

  return (
    <EventDetailClient
      event={{
        id: event.id,
        name: event.name,
        distanceKm: event.distanceKm,
        date: event.date.toISOString(),
        windowStart: event.windowStart.toISOString(),
        windowEnd: event.windowEnd.toISOString(),
        location: event.location,
      }}
      participants={participants}
      currentUserId={session.userId}
      isParticipant={isParticipant}
      inviteLink={inviteLink}
      windowStarted={windowStarted}
      windowEnded={windowEnded}
      raceCard={event.raceCard ? { commentary: event.raceCard.commentary, generatedAt: event.raceCard.generatedAt.toISOString() } : null}
      initialReactions={reactionsMap}
    />
  );
}
