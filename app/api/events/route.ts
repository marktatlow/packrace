import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.event.findMany({
    where: { participants: { some: { userId: session.userId } } },
    include: {
      participants: { include: { user: true } },
      _count: { select: { participants: true } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, distanceKm, date, location, description } = body;

  if (!name || !distanceKm || !date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const event = await prisma.event.create({
    data: {
      name,
      distanceKm: parseFloat(distanceKm),
      date: new Date(date),
      location,
      description,
      participants: { create: { userId: session.userId } },
    },
  });

  return NextResponse.json(event, { status: 201 });
}
