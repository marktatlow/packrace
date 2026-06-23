import { NextRequest, NextResponse } from "next/server";
import { processActivityForUser } from "@/lib/results";

/**
 * Force-process a specific Strava activity for a user.
 * GET /api/admin/process-activity?secret=X&athleteId=Y&activityId=Z
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const athleteId = req.nextUrl.searchParams.get("athleteId");
  const activityId = req.nextUrl.searchParams.get("activityId");
  if (!athleteId || !activityId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  try {
    const result = await processActivityForUser(athleteId, Number(activityId));
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
