import { prisma } from "./prisma";

const VALID_DISTANCES = [400, 805, 1000, 1609, 3219, 5000, 10000];

function vdotFromEffort(distanceMeters: number, timeMins: number): number {
  const v = distanceMeters / timeMins;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMins) + 0.2989558 * Math.exp(-0.1932605 * timeMins);
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  return vo2 / pct;
}

function predictTimeFromVdot(vdot: number, targetMeters: number): number {
  let lo = 1;
  let hi = 600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromEffort(targetMeters, mid) > vdot) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 0.001) break;
  }
  return (lo + hi) / 2;
}

function weightedMedian(values: number[], weights: number[]): number {
  const paired = values.map((v, i) => ({ v, w: weights[i] }));
  paired.sort((a, b) => a.v - b.v);
  const totalWeight = paired.reduce((s, p) => s + p.w, 0);
  let cumulative = 0;
  for (const p of paired) {
    cumulative += p.w;
    if (cumulative >= totalWeight / 2) return p.v;
  }
  return paired[paired.length - 1].v;
}

export type PredictionResult = {
  predictedTimeSecs: number;
  lowConfidence: boolean;
} | null;

export async function predictRaceTime(userId: string, distanceKm: number): Promise<PredictionResult> {
  const targetMeters = distanceKm * 1000;
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  // Fastest effort per distance in the last 90 days
  const efforts = await prisma.bestEffort.findMany({
    where: {
      distanceMeters: { in: VALID_DISTANCES },
      date: { gte: since },
      timeSecs: { gt: 0 },
      activity: { userId },
    },
    select: { distanceMeters: true, timeSecs: true },
    orderBy: { timeSecs: "asc" },
  });

  if (efforts.length === 0) return null;

  // Keep only the fastest effort per distance
  const fastestByDistance = new Map<number, number>();
  for (const e of efforts) {
    if (!fastestByDistance.has(e.distanceMeters)) {
      fastestByDistance.set(e.distanceMeters, e.timeSecs);
    }
  }

  const dataPoints: number[] = [];
  for (const [distanceMeters, timeSecs] of fastestByDistance) {
    const vdot = vdotFromEffort(distanceMeters, timeSecs / 60);
    if (vdot < 20 || vdot > 85) continue;
    dataPoints.push(vdot);
  }

  if (dataPoints.length === 0) return null;

  // Simple median across distances (equal weight — each distance equally valid)
  const sorted = [...dataPoints].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianVdot = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const predictedMins = predictTimeFromVdot(medianVdot, targetMeters);
  return {
    predictedTimeSecs: Math.round(predictedMins * 60),
    lowConfidence: dataPoints.length < 3,
  };
}

export async function recalculatePredictionsForEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { participants: true },
  });
  if (!event) return;

  const lockCutoff = new Date(event.date.getTime() - 48 * 60 * 60 * 1000);
  const isLocked = new Date() >= lockCutoff;

  for (const participant of event.participants) {
    if (participant.manualPrediction) continue;
    if (isLocked && participant.predictedTimeSecs) continue;

    const result = await predictRaceTime(participant.userId, event.distanceKm);
    if (result) {
      await prisma.eventParticipant.update({
        where: { id: participant.id },
        data: {
          predictedTimeSecs: result.predictedTimeSecs,
          lowConfidence: result.lowConfidence,
        },
      });
    }
  }
}
