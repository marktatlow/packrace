import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { fetchResultsForEvent } from "@/lib/results";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await req.json();
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (new Date() < event.windowEnd) {
    return NextResponse.json({ error: "Event window hasn't ended yet" }, { status: 400 });
  }

  await fetchResultsForEvent(eventId);
  return NextResponse.json({ ok: true });
}
