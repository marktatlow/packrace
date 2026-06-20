import { prisma } from "./prisma";

const STRAVA_API = "https://www.strava.com/api/v3";
const RUN_TYPES = ["Run", "VirtualRun", "TrailRun"];

const BEST_EFFORT_DISTANCES: Record<string, number> = {
  "400m": 400,
  "1/2 mile": 805,
  "1k": 1000,
  "1 mile": 1609,
  "2 mile": 3219,
  "5k": 5000,
  "10k": 10000,
  "15k": 15000,
  "10 mile": 16093,
  "20k": 20000,
  "1/2 marathon": 21097,
  marathon: 42195,
};

export async function refreshTokenIfNeeded(userId: string) {
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
  await prisma.user.update({
    where: { id: userId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiry: new Date(data.expires_at * 1000),
    },
  });
  return data.access_token as string;
}

export async function syncUserActivities(userId: string) {
  const accessToken = await refreshTokenIfNeeded(userId);
  const since = Math.floor((Date.now() - 180 * 24 * 60 * 60 * 1000) / 1000);

  let page = 1;
  while (true) {
    const res = await fetch(
      `${STRAVA_API}/athlete/activities?after=${since}&per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const activities = await res.json();
    if (!Array.isArray(activities) || activities.length === 0) break;

    for (const act of activities) {
      if (!RUN_TYPES.includes(act.type)) continue;
      await syncActivity(userId, act.id, accessToken);
    }
    if (activities.length < 100) break;
    page++;
  }
}

export async function syncActivity(userId: string, stravaActivityId: number | bigint, accessToken: string) {
  const res = await fetch(
    `${STRAVA_API}/activities/${stravaActivityId}?include_all_efforts=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const act = await res.json();
  if (!act || !act.id) return null;
  if (!RUN_TYPES.includes(act.type)) return null;

  const activity = await prisma.activity.upsert({
    where: { stravaId: BigInt(act.id) },
    create: {
      stravaId: BigInt(act.id),
      userId,
      name: act.name,
      type: act.type,
      distanceMeters: act.distance,
      movingTimeSecs: act.moving_time,
      elapsedTimeSecs: act.elapsed_time,
      totalElevation: act.total_elevation_gain ?? 0,
      averageSpeed: act.average_speed,
      maxSpeed: act.max_speed ?? 0,
      startDate: new Date(act.start_date),
    },
    update: {
      name: act.name,
      distanceMeters: act.distance,
      movingTimeSecs: act.moving_time,
      elapsedTimeSecs: act.elapsed_time,
      totalElevation: act.total_elevation_gain ?? 0,
      averageSpeed: act.average_speed,
      maxSpeed: act.max_speed ?? 0,
    },
  });

  if (act.best_efforts && Array.isArray(act.best_efforts)) {
    await prisma.bestEffort.deleteMany({ where: { activityId: activity.id } });
    const efforts = act.best_efforts
      .filter((e: { name: string }) => BEST_EFFORT_DISTANCES[e.name])
      .map((e: { name: string; distance: number; elapsed_time: number; start_date: string }) => ({
        activityId: activity.id,
        distanceMeters: BEST_EFFORT_DISTANCES[e.name],
        timeSecs: e.elapsed_time,
        date: new Date(e.start_date),
      }));
    if (efforts.length > 0) {
      await prisma.bestEffort.createMany({ data: efforts });
    }
  }
  return activity;
}
