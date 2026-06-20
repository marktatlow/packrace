import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const efforts = await prisma.bestEffort.findMany({
    where: { activity: { userId: session.userId }, date: { gte: since } },
    orderBy: [{ distanceMeters: "asc" }, { timeSecs: "asc" }],
    select: { distanceMeters: true, timeSecs: true, date: true },
  });

  const activities = await prisma.activity.findMany({
    where: { userId: session.userId, startDate: { gte: since } },
    orderBy: { startDate: "desc" },
    take: 10,
    select: { name: true, startDate: true, distanceMeters: true, movingTimeSecs: true, _count: { select: { bestEfforts: true } } },
  });

  return NextResponse.json({ efforts, recentActivities: activities });
}
