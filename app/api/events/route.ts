import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.event.findMany({
    where: { participants: { some: { userId: session.userId } } },
    include: { participants: { include: { user: true } } },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, distanceKm, date, windowStart, windowEnd, location } = body;

  if (!name || !distanceKm || !date || !windowStart || !windowEnd) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const event = await prisma.event.create({
    data: {
      name,
      distanceKm: parseFloat(distanceKm),
      date: new Date(date),
      windowStart: new Date(windowStart),
      windowEnd: new Date(windowEnd),
      location: location || null,
      createdBy: session.userId,
      participants: { create: { userId: session.userId } },
    },
  });

  return NextResponse.json(event);
}
