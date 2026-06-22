import { NextRequest, NextResponse } from "next/server";

/**
 * One-time endpoint to register our webhook URL with Strava.
 * Protect with CRON_SECRET so only you can trigger it.
 * Call once: GET /api/strava/webhook/register?secret=YOUR_CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://raceparty.run";

  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      callback_url:  `${baseUrl}/api/strava/webhook`,
      verify_token:  process.env.STRAVA_VERIFY_TOKEN ?? "packrace_verify_token",
    }),
  });

  const data = await res.json();
  return NextResponse.json({ status: res.status, data });
}
