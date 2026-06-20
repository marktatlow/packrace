import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getStravaAuthUrl } from "@/lib/strava";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/events");

  const authUrl = await getStravaAuthUrl();

  return (
    <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm w-full space-y-8">
        <div>
          <div className="text-5xl mb-4">🏃</div>
          <h1 className="text-3xl font-black text-white mb-2">Prediction Challenge</h1>
          <p className="text-gray-400 text-base leading-relaxed">
            Create a running event, predict your finish time, and see who knows themselves best.
          </p>
        </div>
        <a
          href={authUrl}
          className="block w-full bg-[#FC4C02] text-white font-bold py-4 rounded-2xl text-base hover:bg-[#e04400] transition-colors"
        >
          Connect with Strava
        </a>
        <p className="text-gray-600 text-xs">
          We only read your activity data — we never post anything.
        </p>
      </div>
    </main>
  );
}
