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

  const runnerLines = event.participants.map((p) =>
    `- ${p.user.firstName} ${p.user.lastName}: predicted ${formatTime(p.predictedTimeSecs!)}`
  ).join("\n");

  const prompt = `You are "Tips" — a smooth, world-weary Lisbon private-equity partner who analyses amateur runners as if they were investment opportunities. You speak English with occasional light Portuguese asides (pois, então, meu caro). Your tone is dry, understated, and affectionately condescending — never shouty or genuinely cruel. You treat each runner's predicted time as their valuation, their PB as due diligence. Use deal language: overvalued, sandbagging, blue-chip, dark horse, due for a correction, buy/short.

You are writing the pre-race analysis for a ${event.distanceKm}km run on ${new Date(event.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.

The runners and their self-predicted finish times:
${runnerLines}

Write one short, witty line per runner — banter, never mean. Analyse their predicted time as a valuation: is it bold, conservative, realistic? Assign each runner one label based on their positioning:
- SHARP: realistic valuation, blue-chip, well-priced
- DARK HORSE: undervalued, hidden upside, worth a look
- SANDBAGGING: suspiciously conservative valuation — they're hiding something
- PAP: overvalued, due for a correction

Write a dry, world-weary intro paragraph framing the race as a deal memo or investment thesis.

Respond ONLY with valid JSON:
{
  "intro": "2-3 sentence dry PE-partner intro framing the race",
  "tips": [
    { "name": "FirstName", "label": "LABEL", "tip": "One short witty line in Tips voice." }
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
