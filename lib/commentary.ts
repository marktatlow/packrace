import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { formatTime, formatPace } from "./format";

const anthropic = new Anthropic();

export async function generateCommentary(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: {
        include: {
          user: {
            include: {
              activities: {
                where: { startDate: { gte: new Date(Date.now() - 56 * 24 * 60 * 60 * 1000) } },
                orderBy: { startDate: "desc" },
              },
            },
          },
        },
      },
    },
  });

  if (!event || event.participants.length < 2) return;

  const daysUntil = Math.ceil((event.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const athleteData = event.participants.map((p) => {
    const acts = p.user.activities;
    const totalKm = acts.reduce((s, a) => s + a.distanceMeters / 1000, 0);
    const runCount = acts.length;
    const lastRun = acts[0]?.startDate;
    const daysSinceLastRun = lastRun
      ? Math.floor((Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const avgPace = acts.length > 0
      ? acts.reduce((s, a) => s + a.movingTimeSecs / (a.distanceMeters / 1000), 0) / acts.length
      : null;

    return {
      name: p.user.firstName,
      predictedTime: p.predictedTimeSecs ? formatTime(p.predictedTimeSecs) : "unknown",
      totalKm: totalKm.toFixed(1),
      runCount,
      daysSinceLastRun,
      avgPace: avgPace ? formatPace(avgPace) : "unknown",
      manualPrediction: p.manualPrediction,
    };
  });

  const prompt = `You are a savage sports pundit covering a group running race called "${event.name}".
Race details: ${event.distanceKm}km, ${daysUntil} days away${event.location ? `, at ${event.location}` : ""}.

Athletes and their last 8 weeks of training data:
${athleteData
  .map(
    (a) =>
      `- ${a.name}: ${a.runCount} runs, ${a.totalKm}km total, avg pace ${a.avgPace}/km, last ran ${
        a.daysSinceLastRun !== null ? `${a.daysSinceLastRun} days ago` : "never"
      }, predicted finish ${a.predictedTime}${a.manualPrediction ? " (self-reported 🚩)" : ""}`
  )
  .join("\n")}

Be specific about the data. Destroy people who haven't run. Predict who will embarrass themselves. ${
    daysUntil <= 7 ? "The race is almost here — MAXIMUM INTENSITY." : daysUntil <= 14 ? "Getting close — ramp up the heat." : "It's early but the lazy ones are already showing their cards."
  } No bullet points. 3–5 punchy paragraphs. Call athletes by name. Be savage, specific, and entertaining.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";

  await prisma.groupCommentary.create({
    data: { eventId, content },
  });
}
