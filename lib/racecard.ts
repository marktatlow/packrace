import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { formatTime } from "./format";
import { refreshTokenIfNeeded } from "./strava";
import { getAthleteLocation, getForecast, type ConditionsForecast } from "./weather";

const client = new Anthropic();

export type TipsterEntry = {
  name: string;
  label: "SHARP" | "DARK HORSE" | "SANDBAGGING" | "PAP" | null;
  tip: string;
  odds?: string;             // beat-estimate odds e.g. "4/1 against", "Evens", "2/1 on"
  oddsNote?: string;
  fastestOdds?: string;      // odds of being fastest runner
  fastestOddsNote?: string;
  postRaceVerdict?: string;
};

export type TierGroup = {
  tierName: string;
  accent: string;          // hex colour for UI
  runnerNames: string[];
  story: string;           // 2-sentence scene-setter for this group
  tipsLine: string;        // short savage one-liner verdict
};

export type RaceCardCommentary = {
  intro: string;
  tips: TipsterEntry[];
  postRaceIntro?: string;
  tiers?: TierGroup[];
  conditions?: ConditionsForecast[];
};

const VOICE = `You are "Tips" — a brutally perceptive race commentator: part elite running coach, part pub heckler, part disappointed PE teacher. Acerbic, intelligent, dry, cutting. Sarcasm encouraged. Zero fluff. Humour from insight. Safe for a group chat: spicy, not genuinely nasty. Max 35 words per runner, max 2 sentences. Always mention the runner's name.

IMPORTANT RULES — never break these:
- Never quote your estimate as an exact time (never "20:01", "3:46" etc). Say "my analysis", "based on recent form", "my read on his fitness", "the data tells a different story" etc.
- Never reference specific time gaps or margins (never "two minutes faster", "45 seconds off", "30s slower"). Use qualitative language only: "significantly faster than expected", "slightly ahead of the field", "well off the pace", "comfortably within range", "nowhere near", "miles off" etc.`;

// ─── Load or initialise a race card from DB ──────────────────────────────────
async function loadCard(eventId: string): Promise<RaceCardCommentary | null> {
  const rc = await prisma.raceCard.findUnique({ where: { eventId } });
  if (!rc) return null;
  return JSON.parse(rc.commentary) as RaceCardCommentary;
}

async function saveCard(eventId: string, commentary: RaceCardCommentary): Promise<void> {
  await prisma.raceCard.upsert({
    where: { eventId },
    create: { eventId, commentary: JSON.stringify(commentary) },
    update: { commentary: JSON.stringify(commentary), generatedAt: new Date() },
  });
}

export type PredictionChange = {
  oldSecs: number;
  newSecs: number;
};

// ─── UPDATE A SINGLE RUNNER'S TIP ────────────────────────────────────────────
// Called: on join (after prediction + VDOT), on prediction save, on run completion
export async function updateRunnerTip(eventId: string, userId: string, change?: PredictionChange): Promise<void> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return;

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
    include: { user: true },
  });
  if (!participant || !participant.predictedTimeSecs) return;

  const p = participant;
  const name = p.user.firstName;
  const hasResult = !!p.actualTimeSecs;

  const predTime = formatTime(p.predictedTimeSecs!);
  const estTime = p.vdotPredictedSecs ? formatTime(p.vdotPredictedSecs) : null;
  const gap = p.vdotPredictedSecs ? p.predictedTimeSecs! - p.vdotPredictedSecs : null;
  const gapNote = gap !== null
    ? gap > 15 ? `sandbagging — predicted ${gap}s slower than my estimate`
      : gap < -15 ? `overconfident — predicted ${Math.abs(gap)}s faster than my estimate`
      : `well-calibrated against my estimate`
    : "no estimate yet";

  let prompt: string;

  if (hasResult) {
    // Post-race: generate verdict for this specific runner
    const actualTime = formatTime(p.actualTimeSecs!);
    const vsBeatNote = p.vdotPredictedSecs
      ? p.actualTimeSecs! < p.vdotPredictedSecs
        ? `beat my estimate by ${p.vdotPredictedSecs - p.actualTimeSecs!}s`
        : `missed my estimate by ${p.actualTimeSecs! - p.vdotPredictedSecs}s`
      : "";
    const vsPredNote = p.actualTimeSecs! < p.predictedTimeSecs!
      ? `${p.predictedTimeSecs! - p.actualTimeSecs!}s faster than predicted`
      : `${p.actualTimeSecs! - p.predictedTimeSecs!}s slower than predicted`;

    prompt = `${VOICE}

${name} has just finished the ${event.distanceKm}km event.
- Predicted: ${predTime}
- My estimate: ${estTime ?? "unknown"} (${gapNote})
- Actual result: ${actualTime} (${vsPredNote}${vsBeatNote ? `, ${vsBeatNote}` : ""})

Write ONE post-race verdict for ${name} only. Reference the specific numbers. Was my estimate right? Did they deliver on their prediction? Max 35 words, max 2 sentences.

Respond ONLY with valid JSON:
{ "postRaceVerdict": "verdict here" }`;
  } else {
    // Pre-race: generate or update tip for this runner
    const changeNote = change
      ? change.newSecs < change.oldSecs
        ? `\n⚠️ PREDICTION CHANGE: ${name} just changed their prediction from ${formatTime(change.oldSecs)} to ${formatTime(change.newSecs)} — they are now predicting FASTER. Call this out in your comment with suspicion or intrigue. "What has changed?" "Suddenly confident?" etc.`
        : `\n⚠️ PREDICTION CHANGE: ${name} just changed their prediction from ${formatTime(change.oldSecs)} to ${formatTime(change.newSecs)} — they are now predicting SLOWER. Call this out with scepticism. "Getting cold feet?" "Adjusting expectations?" "Afraid?" etc.`
      : "";

    prompt = `${VOICE}

${name} has entered the ${event.distanceKm}km event.
- Their prediction: ${predTime}
- My estimate: ${estTime ?? "unknown"}${estTime ? ` (${gapNote})` : ""}${changeNote}

Write ONE pre-race comment for ${name}. Compare their prediction to my estimate. Refer to your estimate as "my estimate" — never mention VDOT, algorithms, or Strava.${change ? " You MUST reference the prediction change in your comment." : ""}

Assign a label:
- SHARP: prediction closely matches my estimate
- DARK HORSE: prediction slower than my estimate (hidden upside)
- SANDBAGGING: prediction significantly slower than my estimate
- PAP: prediction faster than my estimate (overconfident)
- null: no estimate yet

Also give Tips Odds — UK betting-style odds on whether ${name} will beat my estimate. Express as e.g. "4/1 against", "Evens", "2/1 on". Consider the gap between prediction and estimate. Add a savage one-liner rationale (max 15 words).

Respond ONLY with valid JSON:
{ "label": "LABEL_OR_NULL", "tip": "pre-race comment", "odds": "X/Y against|on|Evens", "oddsNote": "one-liner rationale" }`;
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;
  const result = JSON.parse(jsonMatch[0]);

  // Merge into existing card
  const card = await loadCard(eventId) ?? { intro: "", tips: [] };
  const existingIdx = card.tips.findIndex((t) => t.name === name);

  if (hasResult) {
    if (existingIdx >= 0) {
      card.tips[existingIdx].postRaceVerdict = result.postRaceVerdict;
    } else {
      card.tips.push({ name, label: null, tip: "", postRaceVerdict: result.postRaceVerdict });
    }
  } else {
    if (existingIdx >= 0) {
      card.tips[existingIdx].label = result.label ?? null;
      card.tips[existingIdx].tip = result.tip;
      if (result.odds) card.tips[existingIdx].odds = result.odds;
      if (result.oddsNote) card.tips[existingIdx].oddsNote = result.oddsNote;
    } else {
      card.tips.push({
        name,
        label: result.label ?? null,
        tip: result.tip,
        odds: result.odds,
        oddsNote: result.oddsNote,
      });
    }
  }

  await saveCard(eventId, card);
}

// ─── UPDATE THE RACE INTRO / SUMMARY ─────────────────────────────────────────
// Called: on new join, daily cron, race-day at 1am BST, post-event
export async function updateRaceIntro(
  eventId: string,
  mode: "pre-race" | "race-day" | "post-race",
  change?: { name: string } & PredictionChange
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: {
        include: { user: true },
        where: { predictedTimeSecs: { not: null } },
        orderBy: { predictedTimeSecs: "asc" },
      },
    },
  });
  if (!event || event.participants.length < 1) return;

  const runnerLines = event.participants.map((p) => {
    const predTime = formatTime(p.predictedTimeSecs!);
    const estTime = p.vdotPredictedSecs ? formatTime(p.vdotPredictedSecs) : "unknown";
    const actualLine = p.actualTimeSecs
      ? ` | FINISHED: ${formatTime(p.actualTimeSecs)}`
      : "";
    return `- ${p.user.firstName}: predicted ${predTime} | my estimate ${estTime}${actualLine}`;
  }).join("\n");

  // Coarse per-runner location + race-day conditions, if already resolved
  // (via updateRaceTiers / updateRaceConditions). Best-effort — older cards
  // without this data just skip the conditions framing entirely.
  const existingCard = await loadCard(eventId);
  const cityByName = new Map<string, string>();
  for (const p of event.participants) {
    try {
      const accessToken = await refreshTokenIfNeeded(p.userId);
      const loc = await getAthleteLocation(accessToken, p.user.city);
      if (loc) cityByName.set(p.user.firstName, loc.city);
    } catch { /* no city context for this runner */ }
  }
  const locationLines = event.participants
    .map((p) => cityByName.get(p.user.firstName) ? `${p.user.firstName} (${cityByName.get(p.user.firstName)})` : null)
    .filter(Boolean)
    .join(", ");

  const conditionDescriptor = (icon: string) => ({
    "🥵": "sweltering heat", "🥶": "bitter cold", "☔": "rain", "💨": "strong wind", "🙂": "mild, easy conditions",
  } as Record<string, string>)[icon] ?? "mixed conditions";
  const conditionsLines = (existingCard?.conditions ?? [])
    .map((c) => `${c.city}: ${conditionDescriptor(c.icon)}`)
    .join("; ");

  const conditionsContext = (locationLines || conditionsLines)
    ? `\n\nLocations: ${locationLines || "unknown"}${conditionsLines ? `\nConditions on the day: ${conditionsLines}` : ""}\nYou MUST explicitly reference the geography and conditions, and say something about how the conditions could realistically affect THIS race (e.g. heat sapping the front-runners, cold making for a brutal start, easy conditions removing any excuse). Coarse city-level only, no exact temperatures or numbers.`
    : "";

  const numAthletes = event.participants.length;
  const numLocations = new Set(cityByName.values()).size;
  const showbizOpen = numLocations > 1
    ? `Open like a hyped-up sports announcer setting the scene — something in the spirit of "We've got ${numAthletes} athletes lining up for a ${event.distanceKm}km race, and this one looks like an absolute humdinger" — mention the global spread (athletes competing from ${numLocations} different cities/regions) as part of the spectacle. Showbiz energy for this opening line, THEN drop into your usual dry, savage voice for the rest.`
    : `Open like a hyped-up sports announcer setting the scene — something in the spirit of "We've got ${numAthletes} athletes lining up for a ${event.distanceKm}km race, and this one looks like an absolute humdinger." Showbiz energy for this opening line, THEN drop into your usual dry, savage voice for the rest.`;

  const comparisonInstruction = `You MUST reference specific runners by comparing BOTH their predicted time AND my estimate (VDOT) — e.g. who's predicted something wildly different from what the data says they're capable of, and who's bang on. Don't just list times; use the gap between prediction and estimate as the story.`;

  let prompt: string;

  if (mode === "post-race") {
    prompt = `${VOICE}

The ${event.distanceKm}km race is over. Final results:
${runnerLines}${conditionsContext}

Write a 2-3 sentence overall closing race summary — who was the star, the biggest surprise, the biggest disappointment. Savage but fair. ${comparisonInstruction} If conditions were notably tough or easy somewhere, you can use that as part of the story (e.g. an excuse that doesn't hold up, or a genuine advantage).

Respond ONLY with valid JSON:
{ "postRaceIntro": "closing summary here" }`;
  } else if (mode === "race-day") {
    prompt = `${VOICE}

Race day is HERE. ${event.distanceKm}km. The window opens soon.

The field:
${runnerLines}${conditionsContext}

Write a 3-sentence race-day intro full of anticipation and tension. ${showbizOpen} ${comparisonInstruction}

Respond ONLY with valid JSON:
{ "intro": "race day intro here" }`;
  } else {
    // pre-race
    const changeCallout = change
      ? change.newSecs < change.oldSecs
        ? `\n⚠️ LATE BREAKING: ${change.name} has just changed their prediction from ${formatTime(change.oldSecs)} to ${formatTime(change.newSecs)} — going FASTER. You MUST mention this in your intro. React with suspicion, intrigue, or mockery. "What does ${change.name} know that we don't?" etc.`
        : `\n⚠️ LATE BREAKING: ${change.name} has just changed their prediction from ${formatTime(change.oldSecs)} to ${formatTime(change.newSecs)} — going SLOWER. You MUST mention this in your intro. Call it out. "${change.name} is getting cold feet." "The nerves are showing." etc.`
      : "";

    prompt = `${VOICE}

Pre-race briefing for the ${event.distanceKm}km event on ${new Date(event.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.

The field so far:
${runnerLines}${changeCallout}${conditionsContext}

Write a 3-sentence intro that sets the scene for this race. ${showbizOpen} ${comparisonInstruction}${change ? ` One sentence MUST reference ${change.name}'s prediction change.` : ""}

Respond ONLY with valid JSON:
{ "intro": "pre-race intro here" }`;
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;
  const result = JSON.parse(jsonMatch[0]);

  // Merge into existing card
  const card = await loadCard(eventId) ?? { intro: "", tips: [] };
  if (result.intro) card.intro = result.intro;
  if (result.postRaceIntro) card.postRaceIntro = result.postRaceIntro;

  await saveCard(eventId, card);
}

// ─── TIERS — group the field by predicted-pace clusters ─────────────────────
export const TIER_NAMES = ["Champions League", "Europa League", "Championship", "League One", "League Two", "National League"];
export const TIER_COLORS = ["#FF2D94", "#00B7FF", "#FFC700", "#39FF72", "#FF6A3D", "#8A93A6"];

const TARGET_DIVISION_SIZE = 3;

// Split a pace-sorted field into divisions of ~TARGET_DIVISION_SIZE runners each,
// scaling the number of divisions to the field size. Division count is chosen to
// land closest to the target average size, then the field is split into
// contiguous pace-ordered groups (fastest division first) with any remainder
// spread across the slowest divisions so the competitive top groups stay tight.
function splitIntoDivisions<T>(sorted: T[]): T[][] {
  const n = sorted.length;
  if (n === 0) return [];

  const divisionCount = Math.max(1, Math.round(n / TARGET_DIVISION_SIZE));
  const base = Math.floor(n / divisionCount);
  const remainder = n % divisionCount;

  const groups: T[][] = [];
  let idx = 0;
  for (let i = 0; i < divisionCount; i++) {
    // Extra runner goes to the LAST divisions, so the top (fastest) groups
    // stay closest to the target size for tighter head-to-head drama.
    const size = base + (i >= divisionCount - remainder ? 1 : 0);
    groups.push(sorted.slice(idx, idx + size));
    idx += size;
  }
  return groups;
}

// ─── UPDATE TIER STORIES ──────────────────────────────────────────────────────
// Groups the field into pace-based "divisions" and gets Tips to write a
// scene-setter + one-liner verdict for each. Pre-race only.
export async function updateRaceTiers(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: {
        include: { user: true },
        where: { predictedTimeSecs: { not: null } },
        orderBy: { predictedTimeSecs: "asc" },
      },
    },
  });
  if (!event || event.participants.length < 4) return; // not enough runners for tiers to mean anything
  if (new Date() >= event.windowStart) return; // lock at race start, same as odds

  // Coarse location per runner — same city-level resolution used for conditions.
  // Best-effort only: a failed lookup just means that runner has no city context.
  const cityByName = new Map<string, string>();
  for (const p of event.participants) {
    try {
      const accessToken = await refreshTokenIfNeeded(p.userId);
      const loc = await getAthleteLocation(accessToken, p.user.city);
      if (loc) cityByName.set(p.user.firstName, loc.city);
    } catch { /* no city context for this runner */ }
  }

  const sorted = event.participants.map((p) => ({
    name: p.user.firstName,
    secs: p.predictedTimeSecs!,
    estSecs: p.vdotPredictedSecs,
    city: cityByName.get(p.user.firstName) ?? null,
  }));

  const groups = splitIntoDivisions(sorted);

  const groupContext = groups.map((g, i) => {
    const lines = g.map((r) =>
      `${r.name}${r.city ? ` (${r.city})` : ""}: predicted ${formatTime(r.secs)}${r.estSecs ? ` (my estimate ${formatTime(r.estSecs)})` : ""}`
    ).join("; ");
    return `Tier ${i + 1} — ${TIER_NAMES[i] ?? `Division ${i + 1}`}: ${lines}`;
  }).join("\n");

  const prompt = `${VOICE}

The field has been split into tiers by predicted pace, fastest tier first. Each runner has a city in brackets where known — this is COARSE city-level info, fine to use directly for flavour since this is a small private friend group. For EACH tier below, write:
- "story": a scene-setter for that specific group, referencing their predictions/estimates qualitatively. Feel free to call out a runner's city/region directly where it adds fun colour — e.g. "while half the southern hemisphere crew enjoy winter sun, the Londoners are training through a heatwave." Max 2 sentences, max 40 words.
- "tipsLine": ONE short savage one-line verdict on that tier — punchier and shorter than the story. Max 15 words.

Tiers:
${groupContext}

Respond ONLY with valid JSON:
{ "tiers": [ { "tierIndex": 0, "story": "...", "tipsLine": "..." }, ... ] }`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;
  const result = JSON.parse(jsonMatch[0]) as { tiers: { tierIndex: number; story: string; tipsLine: string }[] };

  const tierGroups: TierGroup[] = groups.map((g, i) => {
    const aiTier = result.tiers?.find((t) => t.tierIndex === i);
    return {
      tierName: TIER_NAMES[i] ?? `Division ${i + 1}`,
      accent: TIER_COLORS[i % TIER_COLORS.length],
      runnerNames: g.map((r) => r.name),
      story: aiTier?.story ?? "",
      tipsLine: aiTier?.tipsLine ?? "",
    };
  });

  const card = await loadCard(eventId) ?? { intro: "", tips: [] };
  card.tiers = tierGroups;
  await saveCard(eventId, card);
}

// ─── UPDATE RACE-DAY CONDITIONS ───────────────────────────────────────────────
// One forecast per distinct athlete location, derived from their most recent
// GPS-tagged run (falls back to their Strava profile city). Adjustment % is a
// rough, display-only heat/humidity estimate — NOT applied to predictions.
export async function updateRaceConditions(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { participants: { include: { user: true }, where: { predictedTimeSecs: { not: null } } } },
  });
  if (!event || event.participants.length === 0) return;

  // De-dupe by actual distance (~40km), not grid cell or city name — metro
  // areas like Greater London span more than one rounded grid cell, and
  // reverse geocoding can label two nearby points "London" vs "Greater London".
  const DEDUPE_RADIUS_KM = 40;
  function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const seen: { lat: number; lon: number; forecast: ConditionsForecast }[] = [];

  for (const p of event.participants) {
    const user = p.user;
    try {
      const accessToken = await refreshTokenIfNeeded(user.id);
      const loc = await getAthleteLocation(accessToken, user.city);
      if (!loc) continue;
      if (seen.some((s) => haversineKm(s.lat, s.lon, loc.lat, loc.lon) < DEDUPE_RADIUS_KM)) continue;

      const forecast = await getForecast(loc.lat, loc.lon, event.windowStart.toISOString());
      if (forecast) seen.push({ lat: loc.lat, lon: loc.lon, forecast: { ...forecast, city: loc.city } });
    } catch { /* skip athletes whose token/location can't be resolved */ }
  }

  if (seen.length === 0) return;

  const card = await loadCard(eventId) ?? { intro: "", tips: [] };
  card.conditions = seen.map((s) => s.forecast);
  await saveCard(eventId, card);
}

function decimalToFractional(dec: number): string {
  if (dec <= 1.05) return "1/20";
  if (dec <= 1.12) return "1/10";
  if (dec <= 1.2)  return "1/6";
  if (dec <= 1.28) return "2/9";
  if (dec <= 1.36) return "1/3";
  if (dec <= 1.44) return "4/11";
  if (dec <= 1.53) return "4/9";
  if (dec <= 1.62) return "8/13";
  if (dec <= 1.72) return "1/2";
  if (dec <= 1.83) return "8/11";
  if (dec <= 1.95) return "4/5";
  if (dec <= 2.1)  return "Evens";
  if (dec <= 2.4)  return "6/4";
  if (dec <= 2.75) return "7/4";
  if (dec <= 3.25) return "2/1";
  if (dec <= 3.75) return "11/4";
  if (dec <= 4.5)  return "3/1";
  if (dec <= 5.25) return "4/1";
  if (dec <= 6.0)  return "9/2";
  if (dec <= 6.75) return "5/1";
  if (dec <= 7.5)  return "11/2";
  if (dec <= 8.25) return "6/1";
  if (dec <= 8.75) return "13/2";
  if (dec <= 9.25) return "7/1";
  if (dec <= 9.75) return "15/2";
  if (dec <= 10.5) return "8/1";
  if (dec <= 11.5) return "9/1";
  if (dec <= 13.0) return "10/1";
  if (dec <= 15.0) return "12/1";
  if (dec <= 18.0) return "14/1";
  if (dec <= 22.0) return "16/1";
  if (dec <= 28.0) return "20/1";
  if (dec <= 36.0) return "25/1";
  return "33/1";
}

// ─── Beat estimate odds helper ───────────────────────────────────────────────
// Runners predicting slower than estimate are MOST likely to beat it (sandbagging).
// Runners predicting faster than estimate are LEAST likely to beat it (overconfident).
const BEAT_NOTES = [
  "Prediction a deliberate lowball.",
  "Should beat this easily.",
  "Likely to come good.",
  "Honest but beatable target.",
  "Coin toss. Could go either way.",
  "Prediction beyond current form.",
  "Ambitious. Very ambitious indeed.",
  "Data says no. Firmly.",
  "Not a chance. Move on.",
  "Fiction, not a prediction.",
];

function computeBeatEstimateOdds(
  participants: { firstName: string; vdotPredictedSecs: number | null; predictedTimeSecs: number | null }[]
): Map<string, { odds: string; note: string }> {
  const rawGaps = participants.map((p) => ({
    name: p.firstName,
    raw: p.vdotPredictedSecs && p.predictedTimeSecs
      ? p.predictedTimeSecs - p.vdotPredictedSecs
      : 0,
  })).sort((a, b) => b.raw - a.raw); // most sandbagging first = shortest odds first

  const minRaw = Math.min(...rawGaps.map((g) => g.raw));
  const gaps = rawGaps.map((g) => ({ ...g, weight: g.raw - minRaw }));
  const totalWeight = gaps.reduce((s, g) => s + g.weight, 0);
  const OVERROUND = 1.15;

  return new Map(gaps.map((g, rank) => {
    let dec: number;
    if (totalWeight === 0) {
      dec = 1 + (participants.length - 1) * OVERROUND;
    } else {
      const implied = (g.weight / totalWeight) / OVERROUND;
      dec = implied > 0 ? 1 / implied : 34;
    }
    const note = BEAT_NOTES[rank] ?? BEAT_NOTES[BEAT_NOTES.length - 1];
    return [g.name, { odds: decimalToFractional(dec), note }];
  }));
}

// ─── Fastest runner odds helper ──────────────────────────────────────────────
// Computed from VDOT estimates. Faster estimate = shorter odds.
// Implied probability proportional to 1/estimateSecs (speed, not time).
const FASTEST_NOTES = [
  "The benchmark. Clear favourite.",
  "Danger if favourite stumbles.",
  "Serious pace. Needs luck.",
  "Dark horse. Could sneak.",
  "Outsider with a point.",
  "Up against it here.",
  "Needs the stars to align.",
  "Miracle territory, frankly.",
  "Long shot. Very long.",
  "Not in this company.",
];

function computeFastestOdds(
  participants: { firstName: string; vdotPredictedSecs: number | null; predictedTimeSecs: number | null }[]
): Map<string, { odds: string; note: string }> {
  const speeds = participants.map((p) => ({
    name: p.firstName,
    secs: p.vdotPredictedSecs ?? p.predictedTimeSecs ?? 9999,
  })).sort((a, b) => a.secs - b.secs); // sort fastest first

  const totalInvSpeed = speeds.reduce((s, r) => s + 1 / r.secs, 0);
  const OVERROUND = 1.15;

  return new Map(speeds.map((r, rank) => {
    const implied = (1 / r.secs / totalInvSpeed) / OVERROUND;
    const dec = 1 / implied;
    const note = FASTEST_NOTES[rank] ?? FASTEST_NOTES[FASTEST_NOTES.length - 1];
    return [r.name, { odds: decimalToFractional(dec), note }];
  }));
}

// ─── UPDATE ALL THREE ODDS MARKETS ───────────────────────────────────────────
// All three markets now computed deterministically — no AI needed.
// Called on every join and prediction change. Locks at event start.
export async function updateAllOdds(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return;

  // Never update odds once the event window has started — they lock at that point
  if (new Date() >= event.windowStart) return;

  const participants = await prisma.eventParticipant.findMany({
    where: { eventId, predictedTimeSecs: { not: null } },
    include: { user: true },
    orderBy: { vdotPredictedSecs: "asc" },
  });
  if (participants.length < 2) return;

  // Only include runners with both a prediction AND a VDOT estimate
  const participantData = participants
    .filter((p) => p.predictedTimeSecs && p.vdotPredictedSecs)
    .map((p) => ({
      firstName: p.user.firstName,
      predictedTimeSecs: p.predictedTimeSecs,
      vdotPredictedSecs: p.vdotPredictedSecs,
    }));
  if (participantData.length < 2) return;

  // Odds: computed deterministically — accurate, instant, no AI
  const fastestMap = computeFastestOdds(participantData);
  const beatMap    = computeBeatEstimateOdds(participantData);

  // Notes: Tips AI writes savage one-liners per runner per market
  const runnerContext = participantData.map((p) => {
    const gapSecs = p.predictedTimeSecs! - p.vdotPredictedSecs!;
    return `- ${p.firstName}: prediction ${formatTime(p.predictedTimeSecs!)} | my estimate ${formatTime(p.vdotPredictedSecs!)} | gap ${gapSecs > 0 ? `+${gapSecs}s (sandbagging)` : `${gapSecs}s (overconfident)`}`;
  }).join("\n");

  const notesPrompt = `${VOICE}

Write a savage, UNIQUE sub-caption for each runner across two betting markets. STRICT rules:
- MAX 5 WORDS per note
- NO runner names (shown separately)
- Every note must be different — no repeated phrases
- Vary tone: wry, brutal, deadpan, backhanded

Runners and situations:
${runnerContext}

Respond ONLY with valid JSON:
{
  "fastest":  [{ "name": "FirstName", "note": "max 5 words" }],
  "beat":     [{ "name": "FirstName", "note": "max 5 words" }]
}`;

  let notes: {
    fastest: { name: string; note: string }[];
    beat:    { name: string; note: string }[];
  } = { fastest: [], beat: [] };

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: notesPrompt }],
    });
    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const m = text.match(/\{[\s\S]*\}/);
    if (m) notes = JSON.parse(m[0]);
  } catch { /* non-fatal — fall back to empty notes */ }

  // Case-insensitive lookup so "david" matches "David" etc.
  const noteMap = (list: { name: string; note: string }[]) =>
    new Map(list.map((r) => [r.name.toLowerCase(), r.note]));
  const getNoteAI = (map: Map<string, string>, name: string) =>
    map.get(name.toLowerCase());
  const fastestNotes = noteMap(notes.fastest);
  const beatNotes    = noteMap(notes.beat);

  const card = await loadCard(eventId) ?? { intro: "", tips: [] };

  const applyMap = (
    map: Map<string, { odds: string; note: string }>,
    aiNotes: Map<string, string>,
    oddsKey: "fastestOdds" | "odds",
    noteKey: "fastestOddsNote" | "oddsNote",
  ) => {
    for (const [name, val] of map) {
      const idx = card.tips.findIndex((t) => t.name === name);
      const note = getNoteAI(aiNotes, name) ?? val.note; // AI note preferred, fall back to computed
      if (idx >= 0) {
        (card.tips[idx] as Record<string, unknown>)[oddsKey] = val.odds;
        (card.tips[idx] as Record<string, unknown>)[noteKey] = note;
      } else {
        card.tips.push({ name, label: null, tip: "", [oddsKey]: val.odds, [noteKey]: note });
      }
    }
  };

  applyMap(fastestMap, fastestNotes, "fastestOdds", "fastestOddsNote");
  applyMap(beatMap,    beatNotes,    "odds",         "oddsNote");

  await saveCard(eventId, card);
}

// ─── ADMIN / LEGACY: full regenerate ─────────────────────────────────────────
// Used by admin endpoint and cron for bulk operations
export async function generateRaceCard(eventId: string): Promise<void> {
  const now = new Date();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return;

  const windowEnded = now > event.windowEnd;
  const participants = await prisma.eventParticipant.findMany({
    where: { eventId, predictedTimeSecs: { not: null } },
    include: { user: true },
  });
  if (participants.length < 1) return;

  const hasResults = participants.some((p) => p.actualTimeSecs);

  // Update each runner's individual tip
  for (const p of participants) {
    await updateRunnerTip(eventId, p.userId).catch(() => {});
  }

  // Update both odds markets across the whole field
  if (!windowEnded) {
    await updateAllOdds(eventId).catch(() => {});
    await updateRaceTiers(eventId).catch(() => {});
    await updateRaceConditions(eventId).catch(() => {});
  }

  // Update the race intro with appropriate mode
  const mode = windowEnded && hasResults ? "post-race" : "pre-race";
  await updateRaceIntro(eventId, mode).catch(() => {});
}
