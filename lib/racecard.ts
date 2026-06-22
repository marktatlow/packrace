import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { formatTime } from "./format";

const client = new Anthropic();

export type TipsterEntry = {
  name: string;
  label: "SHARP" | "DARK HORSE" | "SANDBAGGING" | "PAP" | null;
  tip: string;
  postRaceVerdict?: string; // populated after results are in
};

export type RaceCardCommentary = {
  intro: string;
  tips: TipsterEntry[];
  postRaceIntro?: string; // overall race summary after results
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

  const now = new Date();
  const windowEnded = now > event.windowEnd;
  const hasResults = event.participants.some((p) => p.actualTimeSecs);
  const isPostRace = windowEnded && hasResults;

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
    const actualLine = p.actualTimeSecs
      ? ` | actual result: ${formatTime(p.actualTimeSecs)} (${
          p.actualTimeSecs < p.predictedTimeSecs!
            ? `${p.predictedTimeSecs! - p.actualTimeSecs}s faster than predicted`
            : `${p.actualTimeSecs - p.predictedTimeSecs!}s slower than predicted`
        }${p.vdotPredictedSecs
          ? p.actualTimeSecs < p.vdotPredictedSecs
            ? `, beat my estimate by ${p.vdotPredictedSecs - p.actualTimeSecs}s`
            : `, missed my estimate by ${p.actualTimeSecs - p.vdotPredictedSecs}s`
          : ""})`
      : " | did not complete / result pending";
    return `- ${p.user.firstName}: prediction ${userEst} | my estimate ${myEst}${gapNote}${isPostRace ? actualLine : ""}`;
  }).join("\n");

  const preRacePrompt = `You are "Tips" — a smooth, world-weary Lisbon private-equity partner who analyses amateur runners as if they were investment opportunities. You speak English with occasional light Portuguese asides (pois, então, meu caro). Your tone is dry, understated, and affectionately condescending — never shouty or genuinely cruel. Use deal language: overvalued, sandbagging, blue-chip, dark horse, due for a correction, buy/short.

You are writing the pre-race analysis for a ${event.distanceKm}km run on ${new Date(event.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.

The runners, their predictions, and my estimate based on recent performance:
${runnerLines}

Write one short witty line per runner comparing their prediction to my estimate. Refer to your estimate as "my estimate" — never mention VDOT, algorithms, or Strava. Assign each runner one label:
- SHARP: prediction closely matches my estimate
- DARK HORSE: prediction is slower than my estimate (hidden upside)
- SANDBAGGING: prediction significantly slower than my estimate
- PAP: prediction faster than my estimate (overconfident)

Write a dry intro paragraph framing the race as a deal memo.

Respond ONLY with valid JSON:
{
  "intro": "2-3 sentence dry PE-partner intro",
  "tips": [
    { "name": "FirstName", "label": "LABEL", "tip": "One witty pre-race line." }
  ]
}`;

  const postRacePrompt = `You are "Tips" — a smooth, world-weary Lisbon private-equity partner who analyses amateur runners as if they were investment opportunities. You speak English with occasional light Portuguese asides (pois, então, meu caro). Your tone is dry, understated, and affectionately condescending. Use deal language: the market has spoken, price discovery, the thesis played out, etc.

The ${event.distanceKm}km race is over. Here are the results:
${runnerLines}

Write a short post-race verdict for EACH runner — did they deliver on their prediction? Did they beat or miss my estimate? Was I right about them? Reference the specific numbers naturally. One witty sentence each.

Also write a 2-3 sentence overall race summary — who was the star, who surprised you, who disappointed. This is the closing memo to investors.

Respond ONLY with valid JSON:
{
  "intro": "Original pre-race intro (keep short, 1 sentence recap)",
  "postRaceIntro": "2-3 sentence overall race summary / closing investment memo",
  "tips": [
    { "name": "FirstName", "label": "LABEL", "tip": "Original pre-race line (keep brief)", "postRaceVerdict": "Post-race verdict referencing their actual result vs prediction vs my estimate." }
  ]
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: isPostRace ? postRacePrompt : preRacePrompt }],
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
