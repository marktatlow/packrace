import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { fetchResultsForEvent } from "@/lib/results";
import { prisma } from "@/lib/prisma";
import { updateRaceIntro } from "@/lib/racecard";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await req.json();
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  // Allow fetching during or after the window, but not before it starts
  if (now < event.windowStart) {
    return NextResponse.json({ error: "Window hasn't started yet" }, { status: 400 });
  }

  const isLive = now >= event.windowStart && now <= event.windowEnd;
  const windowJustClosed = !isLive && now > event.windowEnd;

  await fetchResultsForEvent(eventId, isLive);

  // If the window just closed, generate the post-race closing summary
  if (windowJustClosed) {
    void updateRaceIntro(eventId, "post-race").catch((err) =>
      console.error("Post-race summary failed:", err)
    );
  }

  return NextResponse.json({ ok: true });
}
