import { NextRequest, NextResponse } from "next/server";
import { generateRaceCard } from "@/lib/racecard";

/**
 * Force-regenerate Tips for a specific event.
 * GET /api/admin/racecard?secret=CRON_SECRET&eventId=EVENT_ID
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

  await generateRaceCard(eventId);
  return NextResponse.json({ ok: true, eventId });
}
