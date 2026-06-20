import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const invite = req.nextUrl.searchParams.get("invite");
  const state = invite || "none";

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/auth/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state,
  });

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`);
}
