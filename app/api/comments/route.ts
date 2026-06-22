import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

  const comments = await prisma.comment.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(comments);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, targetType, targetId, body } = await req.json();
  if (!eventId || !targetType || !targetId || !body?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (body.trim().length > 500) {
    return NextResponse.json({ error: "Too long" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { firstName: true, profilePic: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const comment = await prisma.comment.create({
    data: {
      eventId,
      targetType,
      targetId,
      body: body.trim(),
      authorId: session.userId,
      authorName: user.firstName,
      profilePic: user.profilePic,
    },
  });

  return NextResponse.json(comment);
}
