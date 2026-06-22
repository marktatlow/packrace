import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_EMOJIS = ["🔥", "🐍", "🤥", "😂", "💀"];
const VALID_TARGET_TYPES = ["runner", "tipster"];

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, targetType, targetId, emoji } = await req.json();

  if (!VALID_EMOJIS.includes(emoji)) return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  if (!VALID_TARGET_TYPES.includes(targetType)) return NextResponse.json({ error: "Invalid targetType" }, { status: 400 });
  if (!eventId || !targetId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { firstName: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Toggle: delete if exists, create if not
  const existing = await prisma.reaction.findUnique({
    where: { targetType_targetId_authorId_emoji: { targetType, targetId, authorId: session.userId, emoji } },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ action: "removed" });
  } else {
    await prisma.reaction.create({
      data: { eventId, targetType, targetId, emoji, authorId: session.userId, authorName: user.firstName },
    });
    return NextResponse.json({ action: "added" });
  }
}
