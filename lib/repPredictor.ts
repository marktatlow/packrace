// EXPERIMENTAL — not wired into any route yet.
// Ports race_predictor.py's power-law / critical-speed approach to TS,
// deriving "reps" from activity distance/time streams (already-fetched
// data) instead of a separate /laps API call.

const HALF_LIFE_DAYS = 21;
const REP_MIN_M = 380;
const REP_MAX_M = 3200;
const REP_MIN_TIME_S = 70;
const WORK_PACE_CUTOFF = 1.18;
const RACE_EFFORT_FACTOR = 0.97;
const TARGET_M = 5000;
const SMOOTH_WINDOW_S = 20; // pace-smoothing window for surge detection
const MIN_REPS_REQUIRED = 5;
const B_BOUNDS: [number, number] = [0.98, 1.25]; // sanity clamp on fitted exponent

export type Effort = { distM: number; timeS: number; ageDays: number };

function weight(e: Effort): number {
  return Math.pow(0.5, e.ageDays / HALF_LIFE_DAYS);
}

/**
 * Derive workout "reps" from a single activity's distance/time streams,
 * by finding contiguous fast segments rather than relying on Strava laps.
 */
export function extractRepsFromStream(distStream: number[], timeStream: number[], ageDays: number): Effort[] {
  const n = distStream.length;
  if (n < 2) return [];

  // Smoothed instantaneous pace (s/m) at each point using a ~20s trailing window
  const pace: number[] = new Array(n).fill(Infinity);
  let left = 0;
  for (let right = 0; right < n; right++) {
    while (timeStream[right] - timeStream[left] > SMOOTH_WINDOW_S && left < right) left++;
    const dt = timeStream[right] - timeStream[left];
    const dd = distStream[right] - distStream[left];
    if (dd > 0 && dt > 0) pace[right] = dt / dd;
  }

  const finitePaces = pace.filter((p) => Number.isFinite(p));
  if (finitePaces.length === 0) return [];
  const bestPace = Math.min(...finitePaces);
  const cutoff = bestPace * WORK_PACE_CUTOFF;

  // Merge contiguous "fast enough" points into candidate rep segments
  const reps: Effort[] = [];
  let segStart: number | null = null;
  for (let i = 0; i < n; i++) {
    const fast = pace[i] <= cutoff;
    if (fast && segStart === null) {
      segStart = i;
    } else if (!fast && segStart !== null) {
      const d = distStream[i - 1] - distStream[segStart];
      const t = timeStream[i - 1] - timeStream[segStart];
      if (d >= REP_MIN_M && d <= REP_MAX_M && t >= REP_MIN_TIME_S) {
        reps.push({ distM: d, timeS: t, ageDays });
      }
      segStart = null;
    }
  }
  if (segStart !== null) {
    const d = distStream[n - 1] - distStream[segStart];
    const t = timeStream[n - 1] - timeStream[segStart];
    if (d >= REP_MIN_M && d <= REP_MAX_M && t >= REP_MIN_TIME_S) {
      reps.push({ distM: d, timeS: t, ageDays });
    }
  }
  return reps;
}

/** Weighted least squares of ln(t) = ln(a) + b*ln(d). Returns null if degenerate. */
export function fitPowerLaw(efforts: Effort[]): { a: number; b: number; logSe: number } | null {
  const w = efforts.map(weight);
  const wSum = w.reduce((s, x) => s + x, 0);
  if (wSum <= 0) return null;
  const W = w.map((x) => x / wSum);
  const x = efforts.map((e) => Math.log(e.distM));
  const y = efforts.map((e) => Math.log(e.timeS));
  const xm = x.reduce((s, xi, i) => s + W[i] * xi, 0);
  const ym = y.reduce((s, yi, i) => s + W[i] * yi, 0);
  const num = x.reduce((s, xi, i) => s + W[i] * (xi - xm) * (y[i] - ym), 0);
  const den = x.reduce((s, xi, i) => s + W[i] * (xi - xm) ** 2, 0);
  if (den === 0) return null;
  let b = num / den;

  // Sanity clamp — narrow rep-distance spread can produce wild slopes
  const clamped = Math.max(B_BOUNDS[0], Math.min(B_BOUNDS[1], b));
  b = clamped;

  const lnA = ym - b * xm;
  const resid = y.map((yi, i) => yi - (lnA + b * x[i]));
  const dof = Math.max(wSum - 2, 1e-6);
  const logSe = Math.sqrt(efforts.reduce((s, e, i) => s + w[i] * resid[i] ** 2, 0) / dof);
  return { a: Math.exp(lnA), b, logSe };
}

/** work = CS*time + D' — informational fast-day anchor only, not blended into central estimate. */
export function fitCriticalSpeed(efforts: Effort[]): { cs: number; dPrime: number } | null {
  const w = efforts.map(weight);
  const wSum = w.reduce((s, x) => s + x, 0);
  if (wSum <= 0) return null;
  const W = w.map((x) => x / wSum);
  const t = efforts.map((e) => e.timeS);
  const d = efforts.map((e) => e.distM);
  const tm = t.reduce((s, ti, i) => s + W[i] * ti, 0);
  const dm = d.reduce((s, di, i) => s + W[i] * di, 0);
  const num = t.reduce((s, ti, i) => s + W[i] * (ti - tm) * (d[i] - dm), 0);
  const den = t.reduce((s, ti, i) => s + W[i] * (ti - tm) ** 2, 0);
  if (den === 0) return null;
  const cs = num / den;
  const dPrime = dm - cs * tm;
  return { cs, dPrime };
}

export type RepPrediction = {
  central5kSecs: number;
  bandLoSecs: number;
  bandHiSecs: number;
  csAnchor5kSecs: number | null;
  factorUsed: number;
  nReps: number;
  weightedN: number;
  slopeB: number;
};

/**
 * Returns null when there isn't enough rep data to trust the model —
 * caller should fall back to the existing VDOT best-efforts predictor.
 */
export function predictFromReps(efforts: Effort[], calibrationRace?: { distM: number; timeS: number }): RepPrediction | null {
  if (efforts.length < MIN_REPS_REQUIRED) return null;

  const fit = fitPowerLaw(efforts);
  if (!fit) return null;
  const { a, b, logSe } = fit;

  let factor = RACE_EFFORT_FACTOR;
  if (calibrationRace) {
    const curveAtCal = a * Math.pow(calibrationRace.distM, b);
    if (curveAtCal > 0) factor = calibrationRace.timeS / curveAtCal;
  }

  const curve5k = a * Math.pow(TARGET_M, b);
  const central = curve5k * factor;

  const cs = fitCriticalSpeed(efforts);
  const csAnchor = cs && cs.cs > 0 ? (TARGET_M - cs.dPrime) / cs.cs : null;

  const nEff = efforts.reduce((s, e) => s + weight(e), 0);
  const penalty = 1 + 0.6 / Math.sqrt(Math.max(nEff, 1));
  const s = logSe * penalty;

  return {
    central5kSecs: central,
    bandLoSecs: central * Math.exp(-s),
    bandHiSecs: central * Math.exp(s),
    csAnchor5kSecs: csAnchor,
    factorUsed: factor,
    nReps: efforts.length,
    weightedN: nEff,
    slopeB: b,
  };
}
