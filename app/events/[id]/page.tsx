import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EventDetailClient from "./EventDetailClient";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");

  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      participants: {
        include: {
          user: {
            include: {
              activities: {
                where: { startDate: { gte: new Date(Date.now() - 56 * 24 * 60 * 60 * 1000) } },
                orderBy: { startDate: "desc" },
              },
            },
          },
        },
      },
      groupCommentary: { orderBy: { generatedAt: "desc" }, take: 1 },
    },
  });

  if (!event) notFound();

  const isParticipant = event.participants.some((p) => p.userId === session.userId);
  if (!isParticipant) redirect("/events");

  // Compute leaderboard stats
  const participants = event.participants.map((p) => {
    const acts = p.user.activities;
    const totalKm = acts.reduce((s, a) => s + a.distanceMeters / 1000, 0);
    const runCount = acts.length;
    const longestRun = acts.reduce((max, a) => Math.max(max, a.distanceMeters / 1000), 0);
    const totalElevation = acts.reduce((s, a) => s + a.totalElevation, 0);
    const fastestPace = acts.length > 0
      ? Math.min(...acts.filter(a => a.distanceMeters >= 1000).map(a => a.movingTimeSecs / (a.distanceMeters / 1000)))
      : Infinity;

    // Weekly trend: last 4 vs previous 4 weeks
    const now = Date.now();
    const last4WeeksKm = acts
      .filter(a => a.startDate.getTime() > now - 28 * 24 * 60 * 60 * 1000)
      .reduce((s, a) => s + a.distanceMeters / 1000, 0) / 4;
    const prev4WeeksKm = acts
      .filter(a => {
        const age = now - a.startDate.getTime();
        return age > 28 * 24 * 60 * 60 * 1000 && age <= 56 * 24 * 60 * 60 * 1000;
      })
      .reduce((s, a) => s + a.distanceMeters / 1000, 0) / 4;

    return {
      id: p.id,
      userId: p.userId,
      user: { id: p.user.id, firstName: p.user.firstName, lastName: p.user.lastName, profilePic: p.user.profilePic },
      predictedTimeSecs: p.predictedTimeSecs,
      lowConfidence: p.lowConfidence,
      manualPrediction: p.manualPrediction,
      actualTimeSecs: p.actualTimeSecs,
      stravaActivityId: p.stravaActivityId ? String(p.stravaActivityId) : null,
      stats: { totalKm, runCount, longestRun, totalElevation, fastestPace: fastestPace === Infinity ? null : fastestPace, last4WeeksKm, prev4WeeksKm },
    };
  });

  const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL}/join/${event.inviteCode}`;
  const lockCutoff = new Date(event.date.getTime() - 48 * 60 * 60 * 1000);
  const isLocked = new Date() >= lockCutoff;
  const isPast = event.date < new Date();
  const daysUntil = Math.ceil((event.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const commentary = event.groupCommentary[0] ? {
    content: event.groupCommentary[0].content,
    generatedAt: event.groupCommentary[0].generatedAt.toISOString(),
  } : null;

  return (
    <EventDetailClient
      event={{
        id: event.id,
        name: event.name,
        distanceKm: event.distanceKm,
        date: event.date.toISOString(),
        location: event.location,
        description: event.description,
      }}
      participants={participants}
      currentUserId={session.userId}
      inviteLink={inviteLink}
      isLocked={isLocked}
      isPast={isPast}
      daysUntil={daysUntil}
      commentary={commentary}
    />
  );
}
