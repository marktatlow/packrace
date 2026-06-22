import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStravaAuthUrl } from "@/lib/strava";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/events");

  const authUrl = await getStravaAuthUrl();

  return (
    <main className="min-h-screen bg-[#0D0F14] flex flex-col items-center justify-center px-6 text-center">
      {/* Neon glow blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#FF2D94]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-48 h-48 bg-[#00B7FF]/8 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-sm w-full space-y-8">
        {/* Logo / Brand */}
        <div className="space-y-3">
          <img src="/raceparty-icon.png" alt="RaceParty" className="w-32 h-32 mx-auto drop-shadow-[0_0_24px_rgba(255,45,148,0.5)]" />
          <img src="/raceparty-wordmarkx.png" alt="RaceParty" className="h-16 w-auto mx-auto" />
          <p className="text-[#F4F4F7]/60 text-base leading-relaxed">
            Predict your finish time, race with friends,<br />see who knows themselves best.
          </p>
          <p className="text-xs font-black uppercase tracking-widest">
            <span className="text-[#FF2D94]">Predict</span>
            <span className="text-white/30"> · </span>
            <span className="text-[#00B7FF]">Race</span>
            <span className="text-white/30"> · </span>
            <span className="text-[#39FF72]">Get Roasted</span>
          </p>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <a
            href={authUrl}
            className="flex items-center justify-center gap-3 w-full bg-[#FF2D94] text-white font-black py-4 rounded-2xl text-base shadow-[0_0_24px_rgba(255,45,148,0.4)] hover:shadow-[0_0_32px_rgba(255,45,148,0.6)] transition-shadow"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
            Connect with Strava
          </a>
          <p className="text-white/30 text-xs">
            We only read your activity data — we never post anything.
          </p>
        </div>
      </div>
    </main>
  );
}
