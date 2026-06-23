import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { formatTime } from "./format";

const client = new Anthropic();

export type TipsterEntry = {
  name: string;
  label: "SHARP" | "DARK HORSE" | "SANDBAGGING" | "PAP" | null;
  tip: string;
  odds?: string;             // beat-estimate odds e.g. "4/1 against", "Evens", "2/1 on"
  oddsNote?: string;
  fastestOdds?: string;      // odds of being fastest runner
  fastestOddsNote?: string;
  sandbagOdds?: string;      // odds of being biggest sandbagger
  sandbagOddsNote?: string;
  postRaceVerdict?: string;
};

export type RaceCardCommentary = {
  intro: string;
  tips: TipsterEntry[];
  postRaceIntro?: string;
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

  let prompt: string;

  if (mode === "post-race") {
    prompt = `${VOICE}

The ${event.distanceKm}km race is over. Final results:
${runnerLines}

Write a 2-3 sentence overall closing race summary — who was the star, the biggest surprise, the biggest disappointment. Savage but fair.

Respond ONLY with valid JSON:
{ "postRaceIntro": "closing summary here" }`;
  } else if (mode === "race-day") {
    prompt = `${VOICE}

Race day is HERE. ${event.distanceKm}km. The window opens soon.

The field:
${runnerLines}

Write a 2-sentence race-day intro — full of anticipation, tension, and dry sarcasm. Get them hyped.

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
${runnerLines}${changeCallout}

Write a 2-sentence intro that sets the scene for this race.${change ? ` One sentence MUST reference ${change.name}'s prediction change.` : ""}

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

// ─── Sandbagger odds helper ───────────────────────────────────────────────────
// Computed deterministically from gap data — no AI needed.
// gap = predictedTimeSecs - vdotPredictedSecs (positive = sandbagging)
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
  if (dec <= 5.5)  return "4/1";
  if (dec <= 6.5)  return "5/1";
  if (dec <= 7.5)  return "6/1";
  if (dec <= 9.0)  return "7/1";
  if (dec <= 11.0) return "9/1";
  if (dec <= 14.0) return "12/1";
  if (dec <= 18.0) return "16/1";
  if (dec <= 25.0) return "20/1";
  return "33/1";
}

function computeSandbagOdds(
  participants: { firstName: string; predictedTimeSecs: number | null; vdotPredictedSecs: number | null }[]
): Map<string, { odds: string; note: string }> {
  // Raw gap: positive = predicting slower than estimate (sandbagging)
  //          negative = predicting faster than estimate (overconfident)
  const rawGaps = participants.map((p) => ({
    name: p.firstName,
    raw: p.vdotPredictedSecs && p.predictedTimeSecs
      ? p.predictedTimeSecs - p.vdotPredictedSecs
      : 0,
  }));

  // Shift so the most overconfident becomes 0 weight, most conservative gets full weight
  // This works whether everyone is sandbagging, everyone is overconfident, or mixed
  const minRaw = Math.min(...rawGaps.map((g) => g.raw));
  const gaps = rawGaps.map((g) => ({ name: g.name, raw: g.raw, weight: g.raw - minRaw }));
  const totalWeight = gaps.reduce((s, g) => s + g.weight, 0);
  const OVERROUND = 1.15;

  return new Map(gaps.map((g) => {
    let dec: number;
    if (totalWeight === 0) {
      // All perfectly calibrated — equal market
      dec = 1 + (participants.length - 1) * OVERROUND;
    } else {
      const implied = (g.weight / totalWeight) / OVERROUND;
      dec = implied > 0 ? 1 / implied : 34;
    }

    const note = g.raw > 120  ? "Massive hidden reserves. Banker."
      : g.raw > 60   ? "Significant pace sandbagged."
      : g.raw > 20   ? "Modest padding."
      : g.raw > -20  ? "Suspiciously honest."
      : g.raw > -60  ? "Slightly ambitious."
      : g.raw > -120 ? "Optimistic. Very."
      :                "Living in a fantasy.";

    return [g.name, { odds: decimalToFractional(dec), note }];
  }));
}

// ─── Beat estimate odds helper ───────────────────────────────────────────────
// Runners predicting slower than estimate are MOST likely to beat it (sandbagging).
// Runners predicting faster than estimate are LEAST likely to beat it (overconfident).
function computeBeatEstimateOdds(
  participants: { firstName: string; vdotPredictedSecs: number | null; predictedTimeSecs: number | null }[]
): Map<string, { odds: string; note: string }> {
  // gap = predicted - estimate: positive = sandbagging (likely to beat estimate)
  // Shift by min so all weights are non-negative, same approach as sandbagger
  const rawGaps = participants.map((p) => ({
    name: p.firstName,
    raw: p.vdotPredictedSecs && p.predictedTimeSecs
      ? p.predictedTimeSecs - p.vdotPredictedSecs
      : 0,
  }));
  const minRaw = Math.min(...rawGaps.map((g) => g.raw));
  const gaps = rawGaps.map((g) => ({ name: g.name, raw: g.raw, weight: g.raw - minRaw }));
  const totalWeight = gaps.reduce((s, g) => s + g.weight, 0);
  const OVERROUND = 1.15;

  return new Map(gaps.map((g) => {
    let dec: number;
    if (totalWeight === 0) {
      dec = 1 + (participants.length - 1) * OVERROUND;
    } else {
      const implied = (g.weight / totalWeight) / OVERROUND;
      dec = implied > 0 ? 1 / implied : 34;
    }
    const note = g.raw > 60  ? "Hiding serious pace. Will beat it."
      : g.raw > 20  ? "Should comfortably beat the estimate."
      : g.raw > -20 ? "Roughly matched. Could go either way."
      : g.raw > -60 ? "Ambitious prediction. Unlikely."
      :               "Very optimistic. Long shot.";
    return [g.name, { odds: decimalToFractional(dec), note }];
  }));
}

// ─── Fastest runner odds helper ──────────────────────────────────────────────
// Computed from VDOT estimates. Faster estimate = shorter odds.
// Implied probability proportional to 1/estimateSecs (speed, not time).
function computeFastestOdds(
  participants: { firstName: string; vdotPredictedSecs: number | null; predictedTimeSecs: number | null }[]
): Map<string, { odds: string; note: string }> {
  // Use VDOT estimate; fall back to user prediction if no estimate
  const speeds = participants.map((p) => ({
    name: p.firstName,
    secs: p.vdotPredictedSecs ?? p.predictedTimeSecs ?? 9999,
  }));

  const totalInvSpeed = speeds.reduce((s, r) => s + 1 / r.secs, 0);
  const OVERROUND = 1.15;

  return new Map(speeds.map((r) => {
    const implied = (1 / r.secs / totalInvSpeed) / OVERROUND;
    const dec = 1 / implied;

    // Rank among field for note
    const rank = speeds.slice().sort((a, b) => a.secs - b.secs).findIndex((s) => s.name === r.name) + 1;
    const note = rank === 1 ? "Fastest on paper. Favourite."
      : rank === 2 ? "Strong second string."
      : rank === 3 ? "Dark horse in contention."
      : "Needs everything to go right.";

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

  const participantData = participants.map((p) => ({
    firstName: p.user.firstName,
    predictedTimeSecs: p.predictedTimeSecs,
    vdotPredictedSecs: p.vdotPredictedSecs,
  }));

  // All three markets computed deterministically — accurate, instant, no AI
  const fastestMap  = computeFastestOdds(participantData);
  const sandbagMap  = computeSandbagOdds(participantData);
  // Beat estimate: proportional to sandbagging gap (same direction as sandbagger)
  // but specifically about beating the VDOT estimate
  const beatMap = computeBeatEstimateOdds(participantData);

  const card = await loadCard(eventId) ?? { intro: "", tips: [] };

  const applyMap = (
    map: Map<string, { odds: string; note: string }>,
    oddsKey: "fastestOdds" | "odds" | "sandbagOdds",
    noteKey: "fastestOddsNote" | "oddsNote" | "sandbagOddsNote",
  ) => {
    for (const [name, val] of map) {
      const idx = card.tips.findIndex((t) => t.name === name);
      if (idx >= 0) {
        (card.tips[idx] as Record<string, unknown>)[oddsKey] = val.odds;
        (card.tips[idx] as Record<string, unknown>)[noteKey] = val.note;
      } else {
        card.tips.push({ name, label: null, tip: "", [oddsKey]: val.odds, [noteKey]: val.note });
      }
    }
  };

  applyMap(fastestMap, "fastestOdds", "fastestOddsNote");
  applyMap(beatMap,    "odds",        "oddsNote");
  applyMap(sandbagMap, "sandbagOdds", "sandbagOddsNote");

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

  // Update all three odds markets across the whole field
  if (!windowEnded) {
    await updateAllOdds(eventId).catch(() => {});
  }

  // Update the race intro with appropriate mode
  const mode = windowEnded && hasResults ? "post-race" : "pre-race";
  await updateRaceIntro(eventId, mode).catch(() => {});
}
