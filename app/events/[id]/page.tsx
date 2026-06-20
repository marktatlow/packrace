import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EventDetailClient from "./EventDetailClient";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");

  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: { participants: { include: { user: true } } },
  });

  if (!event) notFound();

  const isParticipant = event.participants.some((p) => p.userId === session.userId);
  if (!isParticipant) redirect("/events");

  const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL}/join/${event.inviteCode}`;
  const now = new Date();
  const windowStarted = now >= event.windowStart;
  const windowEnded = now > event.windowEnd;

  const participants = event.participants.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: `${p.user.firstName} ${p.user.lastName}`,
    firstName: p.user.firstName,
    profilePic: p.user.profilePic,
    predictedTimeSecs: p.predictedTimeSecs,
    actualTimeSecs: p.actualTimeSecs,
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
      inviteLink={inviteLink}
      windowStarted={windowStarted}
      windowEnded={windowEnded}
    />
  );
}
