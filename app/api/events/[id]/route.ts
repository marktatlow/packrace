import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
              },
            },
          },
        },
      },
      groupCommentary: { orderBy: { generatedAt: "desc" }, take: 1 },
    },
  });

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isParticipant = event.participants.some((p) => p.userId === session.userId);
  if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(event);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lockCutoff = new Date(event.date.getTime() - 48 * 60 * 60 * 1000);
  const isLocked = new Date() >= lockCutoff;

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId: id, userId: session.userId } },
  });
  if (!participant) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

  if ("predictedTimeSecs" in body) {
    if (isLocked) {
      return NextResponse.json({ error: "Predictions locked 48h before race" }, { status: 403 });
    }
    await prisma.eventParticipant.update({
      where: { id: participant.id },
      data: {
        predictedTimeSecs: parseInt(body.predictedTimeSecs),
        manualPrediction: true,
      },
    });
  }

  if ("actualTimeSecs" in body) {
    await prisma.eventParticipant.update({
      where: { id: participant.id },
      data: { actualTimeSecs: parseInt(body.actualTimeSecs) },
    });
  }

  return NextResponse.json({ ok: true });
}
