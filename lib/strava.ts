import { prisma } from "./prisma";

const STRAVA_API = "https://www.strava.com/api/v3";

export async function refreshTokenIfNeeded(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const expiresInMs = user.tokenExpiry.getTime() - Date.now();
  if (expiresInMs > 60_000) return user.accessToken;

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: user.refreshToken,
    }),
  });
  const data = await res.json();

  // If Strava returned an error, don't corrupt the DB — mark user as needing
  // reconnect and throw so the caller can handle gracefully
  if (!data.access_token || !data.refresh_token || !data.expires_at) {
    console.error(`Strava token refresh failed for user ${userId}:`, data);
    await prisma.user.update({
      where: { id: userId },
      data: { needsReconnect: true },
    });
    throw new Error(`Strava token refresh failed: ${data.message ?? "unknown error"}`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiry: new Date(data.expires_at * 1000),
      needsReconnect: false,
    },
  });

  return data.access_token;
}

export async function getStravaAuthUrl(): Promise<string> {
  const base = "https://www.strava.com/oauth/authorize";
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/auth/callback`,
    response_type: "code",
    scope: "read,activity:read_all",
  });
  return `${base}?${params}`;
}

export async function exchangeStravaCode(code: string) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  return res.json();
}
