// VDOT prediction using Jack Daniels formula
// Fetches best efforts directly from Strava API

const STRAVA_API = "https://www.strava.com/api/v3";
const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"];
const VALID_DISTANCES = [400, 805, 1000, 1609, 3219, 5000, 10000];

function vdotFromEffort(distanceMeters: number, timeMins: number): number {
  const v = distanceMeters / timeMins;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMins) + 0.2989558 * Math.exp(-0.1932605 * timeMins);
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  return vo2 / pct;
}

function predictTimeFromVdot(vdot: number, targetMeters: number): number {
  let lo = 1, hi = 600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromEffort(targetMeters, mid) > vdot) lo = mid;
    else hi = mid;
    if (hi - lo < 0.001) break;
  }
  return (lo + hi) / 2;
}

// Sliding window: fastest segment of targetMeters within a stream
function fastestSegment(distStream: number[], timeStream: number[], targetMeters: number): number | null {
  let left = 0;
  let best: number | null = null;
  for (let right = 0; right < distStream.length; right++) {
    while (distStream[right] - distStream[left] > targetMeters) left++;
    const windowDist = distStream[right] - distStream[left];
    if (windowDist >= targetMeters * 0.96) {
      const t = timeStream[right] - timeStream[left];
      if (best === null || t < best) best = t;
    }
  }
  return best;
}

export type BestEffortsByDistance = Map<number, number>; // distanceMeters → fastest timeSecs

async function fetchWithRetry(url: string, accessToken: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) {
      // Respect rate limit — wait 15s before retry
      await new Promise((r) => setTimeout(r, 15000));
      continue;
    }
    return res;
  }
  throw new Error("Strava rate limit — try again in a few minutes");
}

export async function fetchBestEfforts(accessToken: string): Promise<BestEffortsByDistance> {
  const since = Math.floor((Date.now() - 180 * 24 * 60 * 60 * 1000) / 1000);
  const fastest = new Map<number, number>();

  let page = 1;
  while (true) {
    const res = await fetchWithRetry(
      `${STRAVA_API}/athlete/activities?after=${since}&per_page=100&page=${page}`,
      accessToken
    );
    const activities = await res.json();
    if (!Array.isArray(activities) || activities.length === 0) break;

    for (const act of activities) {
      if (!RUN_TYPES.includes(act.type)) continue;

      const detailRes = await fetchWithRetry(
        `${STRAVA_API}/activities/${act.id}?include_all_efforts=true`,
        accessToken
      );
      const detail = await detailRes.json();
      if (!detail?.best_efforts) continue;

      for (const effort of detail.best_efforts) {
        const d = Math.round(effort.distance);
        const t = effort.moving_time as number;
        if (!VALID_DISTANCES.includes(d) || t <= 0) continue;
        if (!fastest.has(d) || t < fastest.get(d)!) fastest.set(d, t);
      }
    }

    if (activities.length < 100) break;
    page++;
  }

  return fastest;
}

export function computeVdotPrediction(efforts: BestEffortsByDistance, targetMeters: number): number | null {
  const vdots: number[] = [];
  for (const [dist, timeSecs] of efforts) {
    const vdot = vdotFromEffort(dist, timeSecs / 60);
    if (vdot >= 20 && vdot <= 85) vdots.push(vdot);
  }
  if (vdots.length === 0) return null;

  const sorted = [...vdots].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianVdot = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(predictTimeFromVdot(medianVdot, targetMeters) * 60);
}

// PB: best effort at matching standard distance, or fastest activity/stream segment as fallback
export function computePersonalBest(efforts: BestEffortsByDistance, targetMeters: number): number | null {
  let bestTime: number | null = null;
  let bestDiff = Infinity;

  for (const [dist, timeSecs] of efforts) {
    const diff = Math.abs(dist - targetMeters) / targetMeters;
    if (diff <= 0.1 && diff < bestDiff) {
      bestDiff = diff;
      bestTime = timeSecs;
    }
  }
  return bestTime;
}

// Fallback PB for non-standard distances: scan recent activities for fastest segment
export async function computePersonalBestFromStreams(
  accessToken: string,
  targetMeters: number
): Promise<number | null> {
  const since = Math.floor((Date.now() - 180 * 24 * 60 * 60 * 1000) / 1000);
  let best: number | null = null;

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
      if (act.distance < targetMeters * 0.96) continue;

      // Close match — use moving time directly
      if (act.distance >= targetMeters * 0.96 && act.distance <= targetMeters * 1.04) {
        if (best === null || act.moving_time < best) best = act.moving_time;
        continue;
      }

      // Longer run — fetch streams for fastest split
      const streamRes = await fetch(
        `${STRAVA_API}/activities/${act.id}/streams?keys=distance,time&key_by_type=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const streams = await streamRes.json();
      if (!streams?.distance?.data || !streams?.time?.data) continue;

      const seg = fastestSegment(streams.distance.data, streams.time.data, targetMeters);
      if (seg !== null && (best === null || seg < best)) best = seg;
    }

    if (activities.length < 100) break;
    page++;
  }

  return best;
}
