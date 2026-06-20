import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStravaAuthUrl } from "@/lib/strava";

export default async function JoinPage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const session = await getSession();
  const { inviteCode } = await params;

  if (!session) {
    const authUrl = await getStravaAuthUrl();
    return (
      <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm w-full space-y-6">
          <div className="text-4xl">🏃</div>
          <h1 className="text-2xl font-black text-white">You're invited!</h1>
          <p className="text-gray-400">Connect with Strava to join this event.</p>
          <a
            href={`${authUrl}&state=join:${inviteCode}`}
            className="block w-full bg-[#FC4C02] text-white font-bold py-4 rounded-2xl"
          >
            Connect with Strava
          </a>
        </div>
      </main>
    );
  }

  // Logged in — auto-join then redirect
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/events/join/${inviteCode}`, {
    method: "POST",
    headers: { cookie: "" }, // will be handled by middleware
  });

  if (res.ok) {
    const data = await res.json();
    redirect(`/events/${data.eventId}`);
  }

  redirect("/events");
}
