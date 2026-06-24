import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/strava";
import { cookies } from "next/headers";

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Revoke Strava token before deleting
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user) {
      try {
        const accessToken = await refreshTokenIfNeeded(session.userId);
        await fetch("https://www.strava.com/oauth/deauthorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken }),
        });
      } catch { /* non-fatal — still delete the account */ }
    }

    // Delete all user data (cascade handles participants, best efforts etc.)
    await prisma.user.delete({ where: { id: session.userId } });

    // Clear session cookie
    const cookieStore = await cookies();
    cookieStore.delete("packrace_session");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Account deletion failed:", err);
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}
