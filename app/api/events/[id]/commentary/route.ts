import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCommentary } from "@/lib/commentary";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: { participants: true },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isParticipant = event.participants.some((p) => p.userId === session.userId);
  if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await generateCommentary(id);
  return NextResponse.json({ ok: true });
}
