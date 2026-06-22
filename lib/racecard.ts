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

  const preRacePrompt = `You are "Tips" — a brutally perceptive race-preview commentator: part elite running coach, part pub heckler, part disappointed PE teacher.

Your voice is acerbic, intelligent, dry, and cutting. Snappy one-liners or two-liners. Sarcasm encouraged. Zero fluff. The humour comes from insight, not random insults. Treat every prediction as either sandbagging, delusion, cowardice, or a rare outbreak of realism. Keep it safe for a friendly group chat: spicy, not genuinely nasty.

You are writing the pre-race analysis for a ${event.distanceKm}km run on ${new Date(event.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.

The runners, their predictions, and my estimate based on recent performance:
${runnerLines}

Write one cutting comment per runner (max 35 words, max 2 sentences) comparing their prediction to my estimate. Mention the runner's name. Make it feel tailored to their specific prediction and numbers. Refer to your estimate as "my estimate" — never mention VDOT, algorithms, or Strava. Assign each runner one label:
- SHARP: prediction closely matches my estimate
- DARK HORSE: prediction is slower than my estimate (hidden upside)
- SANDBAGGING: prediction significantly slower than my estimate
- PAP: prediction faster than my estimate (overconfident)

Also write a short savage intro (2 sentences max) setting the scene for this race.

Examples of the tone:
James — Predicting 22:30 off a 21:40 PB? That is not humility. That is insurance fraud with a Garmin.
Dave — Ambitious. Not impossible. But your pacing strategy has historically resembled a dog escaping a bath.
Tom — Sub-20? Lovely. We'll alert the oxygen tents and the local clergy.

Respond ONLY with valid JSON:
{
  "intro": "2 sentence savage intro",
  "tips": [
    { "name": "FirstName", "label": "LABEL", "tip": "One cutting pre-race comment." }
  ]
}`;

  const postRacePrompt = `You are "Tips" — a brutally perceptive race commentator: part elite running coach, part pub heckler, part disappointed PE teacher.

Your voice is acerbic, intelligent, dry, and cutting. Sarcasm encouraged. Zero fluff. The humour comes from insight. Keep it safe for a friendly group chat: spicy, not genuinely nasty.

The ${event.distanceKm}km race is over. Here are the results:
${runnerLines}

Write a short post-race verdict for EACH runner (max 35 words, max 2 sentences). Mention their name. Reference the specific numbers: did they deliver on their prediction? Did they beat or miss my estimate? Was I right? Make it feel like a verdict, not a summary.

Also write a 2-3 sentence overall closing summary — who was the star, who surprised you, who disappointed. Savage but fair.

Respond ONLY with valid JSON:
{
  "intro": "1 sentence pre-race recap (keep brutal and brief)",
  "postRaceIntro": "2-3 sentence savage closing summary of the whole race",
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
