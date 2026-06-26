// One-off comparison script — NOT part of the app. Run with:
//   npx tsx --env-file=.env.local scripts/compareRepModel.ts
import { prisma } from "../lib/prisma";
import { refreshTokenIfNeeded } from "../lib/strava";
import { extractRepsFromStream, predictFromReps, type Effort } from "../lib/repPredictor";
import { fetchBestEfforts, computeVdotPrediction } from "../lib/vdot";

const STRAVA_API = "https://www.strava.com/api/v3";
const LOOKBACK_DAYS = 90;

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

async function main() {
  const targetName = process.argv[2] ?? "Mark";
  const me = await prisma.user.findFirst({
    where: { firstName: { contains: targetName, mode: "insensitive" } },
  });
  if (!me) throw new Error("User not found");
  console.log(`Testing for ${me.firstName} ${me.lastName} (${me.id})`);

  const accessToken = await refreshTokenIfNeeded(me.id);

  // 1) Pull last 90 days of activities
  const since = Math.floor((Date.now() - LOOKBACK_DAYS * 86400 * 1000) / 1000);
  const activities: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${STRAVA_API}/athlete/activities?after=${since}&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    activities.push(...batch.filter((a) => ["Run", "TrailRun", "VirtualRun"].includes(a.type) && !a.trainer && !a.manual));
    if (batch.length < 100) break;
    page++;
  }
  console.log(`Found ${activities.length} qualifying run activities in the last ${LOOKBACK_DAYS} days`);

  // 2) Pull streams per activity, extract reps
  const allEfforts: Effort[] = [];
  for (const act of activities) {
    // Skip obvious easy days to save calls — same heuristic as race_predictor.py
    if (act.moving_time && act.distance / act.moving_time < 3.0) continue;

    const res = await fetch(`${STRAVA_API}/activities/${act.id}/streams?keys=distance,time&key_by_type=true`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 429) {
      console.log("Rate limited — stopping early");
      break;
    }
    const streams = await res.json();
    if (!streams?.distance?.data || !streams?.time?.data) continue;

    const ageDays = (Date.now() - new Date(act.start_date).getTime()) / 86400000;
    const reps = extractRepsFromStream(streams.distance.data, streams.time.data, ageDays);
    if (reps.length) {
      console.log(`  ${act.name} (${(act.distance / 1000).toFixed(1)}km, ${new Date(act.start_date).toLocaleDateString()}): ${reps.length} reps — ${reps.map((r) => `${Math.round(r.distM)}m/${Math.round(r.timeS)}s`).join(", ")}`);
    }
    allEfforts.push(...reps);
  }

  console.log(`\nTotal reps extracted: ${allEfforts.length}`);

  // 3) New model
  const repResult = predictFromReps(allEfforts);
  if (repResult) {
    console.log("\n=== Rep-based power-law model ===");
    console.log(`5K estimate: ${fmt(repResult.central5kSecs)}  (band ${fmt(repResult.bandLoSecs)}–${fmt(repResult.bandHiSecs)})`);
    console.log(`Fast-day ceiling (CS anchor): ${repResult.csAnchor5kSecs ? fmt(repResult.csAnchor5kSecs) : "n/a"}`);
    console.log(`Reps: ${repResult.nReps} (weighted ${repResult.weightedN.toFixed(1)}), slope b=${repResult.slopeB.toFixed(4)}, factor=${repResult.factorUsed.toFixed(4)}`);
  } else {
    console.log(`\n=== Rep-based power-law model ===\nInsufficient reps (${allEfforts.length}) — would fall back to VDOT.`);
  }

  // 4) Existing VDOT best-efforts model, for comparison
  const efforts = await fetchBestEfforts(accessToken);
  console.log("\n=== Existing VDOT best-efforts model ===");
  console.log("Best efforts found:", [...efforts.entries()].map(([d, t]) => `${d}m in ${fmt(t)}`).join(", "));
  const vdot5k = computeVdotPrediction(efforts, 5000);
  console.log(`5K estimate: ${vdot5k ? fmt(vdot5k) : "n/a"}`);

  // 5) Real-world anchor: actual race results on file
  const parts = await prisma.eventParticipant.findMany({
    where: { userId: me.id, actualTimeSecs: { not: null } },
    include: { event: true },
  });
  console.log("\n=== Actual race results on file ===");
  for (const p of parts) {
    console.log(`${p.event.name} (${p.event.distanceKm}km): actual ${fmt(p.actualTimeSecs!)}, predicted ${p.predictedTimeSecs ? fmt(p.predictedTimeSecs) : "n/a"}, vdot-est ${p.vdotPredictedSecs ? fmt(p.vdotPredictedSecs) : "n/a"}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
