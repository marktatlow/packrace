import { NextRequest, NextResponse } from "next/server";
import { processActivityForUser } from "@/lib/results";

const VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN ?? "packrace_verify_token";

/**
 * GET — Strava sends this once when you first subscribe.
 * We echo back the hub.challenge to confirm ownership of the URL.
 */
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get("hub.mode");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const token     = req.nextUrl.searchParams.get("hub.verify_token");

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    console.log("Strava webhook verified ✓");
    return NextResponse.json({ "hub.challenge": challenge });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * POST — Strava calls this every time an athlete creates, updates or deletes an activity.
 * We must respond with 200 within 2 seconds, so processing happens asynchronously.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  const { aspect_type, object_type, object_id, owner_id } = body;

  // Only care about new run activities
  if (object_type === "activity" && aspect_type === "create" && owner_id && object_id) {
    // Await directly — processActivityForUser takes ~600ms, well within Strava's 2s limit
    // and Vercel's function timeout. fire-and-forget with after() was being killed on Vercel.
    await processActivityForUser(String(owner_id), Number(object_id)).catch((err) =>
      console.error("Webhook processing error:", err)
    );
  }

  return NextResponse.json({ ok: true });
}
