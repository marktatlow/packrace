import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/events");

  return (
    <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-6 max-w-[430px] mx-auto">
      <div className="text-center space-y-6">
        <div className="text-6xl">🏃</div>
        <h1 className="text-4xl font-black tracking-tight">
          Pack<span className="text-[#FF6B35]">Race</span>
        </h1>
        <p className="text-xl text-gray-400 font-medium">Run together. Win alone.</p>
        <p className="text-sm text-gray-500 leading-relaxed">
          Connect your Strava, get your handicap, and trash-talk your way to the finish line.
        </p>
        <a
          href="/auth/strava"
          className="block w-full bg-[#FF6B35] hover:bg-[#e5602f] text-white font-bold py-4 px-8 rounded-2xl text-lg transition-colors mt-8"
        >
          🚀 Connect with Strava
        </a>
      </div>
    </main>
  );
}
