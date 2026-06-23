import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { formatTime } from "./format";

const client = new Anthropic();

export type TipsterEntry = {
  name: string;
  label: "SHARP" | "DARK HORSE" | "SANDBAGGING" | "PAP" | null;
  tip: string;
  postRaceVerdict?: string;
};

export type RaceCardCommentary = {
  intro: string;
  tips: TipsterEntry[];
  postRaceIntro?: string;
};

export async function generateRaceCard(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: {
        include: { user: true },
        where: { predictedTimeSecs: { not: null } },
        orderBy: { predictedTimeSecs: "asc" },
      },
      raceCard: true,
    },
  });

  if (!event || event.participants.length < 1) return;

  const now = new Date();
  const windowEnded = now > event.windowEnd;
  const hasResults = event.participants.some((p) => p.actualTimeSecs);
  const isPostRace = windowEnded && hasResults;
  const isMidRace = !windowEnded && hasResults;

  // Build runner lines — include actual results for mid-race and post-race
  const includeActuals = isPostRace || isMidRace;
  const runnerLines = event.participants.map((p) => {
    const userEst = formatTime(p.predictedTimeSecs!);
    const myEst = p.vdotPredictedSecs ? formatTime(p.vdotPredictedSecs) : "unknown";
    const gap = p.vdotPredictedSecs ? p.predictedTimeSecs! - p.vdotPredictedSecs : null;
    const gapNote = gap !== null
      ? gap > 15 ? ` (sandbagging — ${gap}s slower than my estimate)`
        : gap < -15 ? ` (overconfident — ${Math.abs(gap)}s faster than my estimate)`
        : ` (well-calibrated against my estimate)`
      : "";
    const actualLine = p.actualTimeSecs
      ? ` | FINISHED: ${formatTime(p.actualTimeSecs)} (${
          p.actualTimeSecs < p.predictedTimeSecs!
            ? `${p.predictedTimeSecs! - p.actualTimeSecs}s faster than predicted`
            : `${p.actualTimeSecs - p.predictedTimeSecs!}s slower than predicted`
        }${p.vdotPredictedSecs
          ? p.actualTimeSecs < p.vdotPredictedSecs
            ? `, beat my estimate by ${p.vdotPredictedSecs - p.actualTimeSecs}s`
            : `, missed my estimate by ${p.actualTimeSecs - p.vdotPredictedSecs}s`
          : ""})`
      : " | STILL RUNNING";
    return `- ${p.user.firstName}: prediction ${userEst} | my estimate ${myEst}${gapNote}${includeActuals ? actualLine : ""}`;
  }).join("\n");

  const VOICE = `You are "Tips" — a brutally perceptive race commentator: part elite running coach, part pub heckler, part disappointed PE teacher. Acerbic, intelligent, dry, cutting. Sarcasm encouraged. Zero fluff. Humour from insight. Safe for a group chat: spicy, not genuinely nasty. Max 35 words per runner, max 2 sentences. Always mention the runner's name.`;

  // ── PRE-RACE ─────────────────────────────────────────────────────────────
  const preRacePrompt = `${VOICE}

Pre-race analysis for a ${event.distanceKm}km run on ${new Date(event.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.

Runners, predictions, and my estimate:
${runnerLines}

Write one cutting pre-race comment per runner. Refer to your estimate as "my estimate" — never mention VDOT, algorithms, or Strava.
Assign each runner a label:
- SHARP: prediction closely matches my estimate
- DARK HORSE: prediction slower than my estimate (hidden upside)
- SANDBAGGING: prediction significantly slower than my estimate
- PAP: prediction faster than my estimate (overconfident)

Also write a 2-sentence savage intro setting the scene.

Examples:
James — Predicting 22:30 off a 21:40 PB? That is not humility. That is insurance fraud with a Garmin.
Dave — Ambitious. Not impossible. But your pacing strategy has historically resembled a dog escaping a bath.

Respond ONLY with valid JSON:
{
  "intro": "2 sentence savage intro",
  "tips": [
    { "name": "FirstName", "label": "LABEL", "tip": "One cutting pre-race comment." }
  ]
}`;

  // ── MID-RACE (some runners finished, window still open) ──────────────────
  const finishedNames = event.participants
    .filter((p) => p.actualTimeSecs)
    .map((p) => p.user.firstName)
    .join(", ");

  const midRacePrompt = `${VOICE}

The ${event.distanceKm}km event is still live — some runners have finished, others haven't yet.

Current standings:
${runnerLines}

For runners marked FINISHED: write a short post-race verdict (max 35 words). Reference their actual time vs prediction vs my estimate. Was I right?
For runners marked STILL RUNNING: keep their original pre-race tip — just include it unchanged.

Only generate postRaceVerdict for: ${finishedNames}

Respond ONLY with valid JSON — include ALL runners in the tips array:
{
  "intro": "1 sentence scene-setter (race still live)",
  "tips": [
    { "name": "FirstName", "label": "LABEL", "tip": "Pre-race comment (unchanged for those still running)", "postRaceVerdict": "Post-race verdict (only for finishers)" }
  ]
}`;

  // ── POST-RACE (window closed, generate full summary) ──────────────────────
  const postRacePrompt = `${VOICE}

The ${event.distanceKm}km race is over. Final results:
${runnerLines}

Write a post-race verdict for EACH runner. Reference specific numbers: actual time vs prediction vs my estimate. Was I right?

Also write a 2-3 sentence overall closing summary — star of the show, biggest surprise, biggest disappointment. Savage but fair.

Respond ONLY with valid JSON:
{
  "intro": "1 sentence brutal pre-race recap",
  "postRaceIntro": "2-3 sentence savage closing summary of the whole race",
  "tips": [
    { "name": "FirstName", "label": "LABEL", "tip": "Original pre-race line (keep brief)", "postRaceVerdict": "Post-race verdict." }
  ]
}`;

  const prompt = isPostRace ? postRacePrompt : isMidRace ? midRacePrompt : preRacePrompt;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Anthropic response");

  let commentary: RaceCardCommentary = JSON.parse(jsonMatch[0]);

  // For mid-race: preserve the existing postRaceIntro if there was one
  if (isMidRace && event.raceCard) {
    const existing: RaceCardCommentary = JSON.parse(event.raceCard.commentary);
    if (existing.postRaceIntro) commentary.postRaceIntro = existing.postRaceIntro;
  }

  await prisma.raceCard.upsert({
    where: { eventId },
    create: { eventId, commentary: JSON.stringify(commentary) },
    update: { commentary: JSON.stringify(commentary), generatedAt: new Date() },
  });
}
