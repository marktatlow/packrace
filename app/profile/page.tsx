import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { firstName: true, lastName: true, profilePic: true, city: true, country: true },
  });

  if (!user) redirect("/auth/logout");

  return (
    <main className="min-h-screen bg-[#0D0F14] max-w-[430px] mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/events" className="text-white/50 text-xl hover:text-white transition-colors">←</Link>
        <h1 className="text-xl font-black text-[#F4F4F7]">Profile</h1>
      </div>

      {/* Profile card */}
      <div className="bg-[#13151C] border border-white/8 rounded-2xl p-6 flex flex-col items-center gap-4 mb-6">
        {user.profilePic
          ? <img src={user.profilePic} className="w-20 h-20 rounded-full object-cover ring-2 ring-[#FF2D94]/40" alt={user.firstName} />
          : <div className="w-20 h-20 rounded-full bg-[#FF2D94]/20 border border-[#FF2D94]/40 flex items-center justify-center text-2xl font-black text-[#FF2D94]">{user.firstName[0]}</div>
        }
        <div className="text-center">
          <p className="text-xl font-black text-[#F4F4F7]">{user.firstName} {user.lastName}</p>
          {(user.city || user.country) && (
            <p className="text-sm text-white/60 mt-1">{[user.city, user.country].filter(Boolean).join(", ")}</p>
          )}
          <p className="text-xs text-white/30 mt-1">Connected via Strava</p>
        </div>
      </div>

      <div className="space-y-3">
        <a
          href="/auth/strava"
          className="flex items-center justify-center gap-3 w-full bg-[#FF6A3D] text-white font-bold py-4 rounded-2xl text-base shadow-[0_0_16px_rgba(255,106,61,0.3)] hover:shadow-[0_0_24px_rgba(255,106,61,0.4)] transition-shadow"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
          Reconnect Strava
        </a>

        <a
          href="/auth/logout"
          className="flex items-center justify-center gap-2 w-full bg-white/5 border border-white/10 text-white/70 font-bold py-4 rounded-2xl text-base hover:bg-white/10 transition-colors"
        >
          Sign Out
        </a>
      </div>
    </main>
  );
}
