import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStravaAuthUrl } from "@/lib/strava";

export default async function JoinPage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const session = await getSession();
  const { inviteCode } = await params;

  if (!session) {
    const authUrl = await getStravaAuthUrl();
    return (
      <main className="min-h-screen bg-[#0D0F14] flex flex-col items-center justify-center px-6 text-center">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#FF2D94]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-sm w-full space-y-6">
          <img src="/raceparty-icon.png" alt="RaceParty" className="w-20 h-20 mx-auto" />
          <div>
            <h1 className="text-2xl font-black text-[#F4F4F7]">You&apos;re invited!</h1>
            <p className="text-white/60 mt-2">Connect with Strava to join this race.</p>
          </div>
          <a
            href={`${authUrl}&state=join:${inviteCode}`}
            className="flex items-center justify-center gap-3 w-full bg-[#FF2D94] text-white font-black py-4 rounded-2xl shadow-[0_0_24px_rgba(255,45,148,0.4)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
            Connect with Strava
          </a>
        </div>
      </main>
    );
  }

  // Logged in — auto-join then redirect
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/events/join/${inviteCode}`, {
    method: "POST",
    headers: { cookie: "" },
  });

  if (res.ok) {
    const data = await res.json();
    redirect(`/events/${data.eventId}`);
  }

  redirect("/events");
}
