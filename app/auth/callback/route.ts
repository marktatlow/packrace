import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?error=auth_failed`);
  }

  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.athlete) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?error=token_failed`);
  }

  const athlete = tokenData.athlete;
  const user = await prisma.user.upsert({
    where: { stravaId: String(athlete.id) },
    create: {
      stravaId: String(athlete.id),
      name: `${athlete.firstname} ${athlete.lastname}`,
      firstName: athlete.firstname,
      lastName: athlete.lastname,
      profilePic: athlete.profile,
      city: athlete.city,
      country: athlete.country,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry: new Date(tokenData.expires_at * 1000),
    },
    update: {
      name: `${athlete.firstname} ${athlete.lastname}`,
      firstName: athlete.firstname,
      lastName: athlete.lastname,
      profilePic: athlete.profile,
      city: athlete.city,
      country: athlete.country,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry: new Date(tokenData.expires_at * 1000),
    },
  });

  // Handle invite code (state = "join:inviteCode")
  let redirectTo = "/events";
  const inviteCode = state?.startsWith("join:") ? state.slice(5) : state;
  if (inviteCode && inviteCode !== "none") {
    const event = await prisma.event.findUnique({ where: { inviteCode } });
    if (event) {
      await prisma.eventParticipant.upsert({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        create: { eventId: event.id, userId: user.id },
        update: {},
      });
      redirectTo = `/events/${event.id}`;
    }
  }

  const token = await createSession(user.id);
  const cookieConfig = setSessionCookie(token);

  const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}${redirectTo}`);
  response.cookies.set(cookieConfig);
  return response;
}
