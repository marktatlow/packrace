import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ inviteCode: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { inviteCode } = await params;
  const event = await prisma.event.findUnique({ where: { inviteCode } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId: event.id, userId: session.userId } },
    create: { eventId: event.id, userId: session.userId },
    update: {},
  });

  return NextResponse.json({ eventId: event.id });
}
