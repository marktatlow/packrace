import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { formatTime } from "./format";

const client = new Anthropic();

export type TipsterEntry = {
  name: string;
  label: "SHARP" | "DARK HORSE" | "SANDBAGGING" | "PAP" | null;
  tip: string;
};

export type RaceCardCommentary = {
  intro: string;
  tips: TipsterEntry[];
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
    },
  });

  if (!event || event.participants.length < 2) return;

  const runnerLines = event.participants.map((p) => {
    const userEst = formatTime(p.predictedTimeSecs!);
    const myEst = p.vdotPredictedSecs ? formatTime(p.vdotPredictedSecs) : "unknown";
    const gap = p.vdotPredictedSecs
      ? p.predictedTimeSecs! - p.vdotPredictedSecs
      : null;
    const gapNote = gap !== null
      ? gap > 15 ? ` (sandbagging — ${gap}s slower than my estimate)`
        : gap < -15 ? ` (overconfident — ${Math.abs(gap)}s faster than my estimate)`
        : ` (well-calibrated against my estimate)`
      : "";
    return `- ${p.user.firstName} ${p.user.lastName}: their prediction ${userEst} | my estimate based on recent performance ${myEst}${gapNote}`;
  }).join("\n");

  const prompt = `You are "Tips" — a smooth, world-weary Lisbon private-equity partner who analyses amateur runners as if they were investment opportunities. You speak English with occasional light Portuguese asides (pois, então, meu caro). Your tone is dry, understated, and affectionately condescending — never shouty or genuinely cruel. You treat each runner's predicted time as their valuation and the Strava/VDOT estimate as independent due diligence. Use deal language: overvalued, sandbagging, blue-chip, dark horse, due for a correction, buy/short.

You are writing the pre-race analysis for a ${event.distanceKm}km run on ${new Date(event.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.

The runners, their own predictions, and my estimate based on their recent performance:
${runnerLines}

Write one short, witty line per runner — banter, never mean. Compare their prediction against my estimate to assess whether they are being honest about their ability. Refer to your estimate as "my estimate" or "what I'm seeing from their recent runs" — never mention VDOT, algorithms, or Strava by name. Assign each runner one label:
- SHARP: prediction closely matches my estimate — well-calibrated, blue-chip
- DARK HORSE: prediction is slower than my estimate — hidden upside, undervalued
- SANDBAGGING: prediction is significantly slower than my estimate — suspiciously conservative
- PAP: prediction is faster than my estimate — overconfident, due for a correction

Write a dry, world-weary intro paragraph framing the race as a deal memo.

Respond ONLY with valid JSON:
{
  "intro": "2-3 sentence dry PE-partner intro framing the race",
  "tips": [
    { "name": "FirstName", "label": "LABEL", "tip": "One short witty line in Tips voice, referencing my estimate naturally." }
  ]
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Anthropic response");
  const commentary: RaceCardCommentary = JSON.parse(jsonMatch[0]);

  await prisma.raceCard.upsert({
    where: { eventId },
    create: { eventId, commentary: JSON.stringify(commentary) },
    update: { commentary: JSON.stringify(commentary), generatedAt: new Date() },
  });
}
