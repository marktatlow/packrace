import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = await params;
  const event = await prisma.event.findUnique({ where: { inviteCode } });
  if (!event) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });

  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/auth/strava?invite=${inviteCode}`
    );
  }

  await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId: event.id, userId: session.userId } },
    create: { eventId: event.id, userId: session.userId },
    update: {},
  });

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/events/${event.id}`);
}
