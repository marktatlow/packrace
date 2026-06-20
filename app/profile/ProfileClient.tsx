"use client";
import { useState } from "react";
import Link from "next/link";

type Props = {
  user: {
    name: string;
    firstName: string;
    profilePic: string | null;
    city: string | null;
    country: string | null;
    activityCount: number;
    totalKm: number;
  };
};

export default function ProfileClient({ user }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState("");

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) {
        setSynced(true);
        setTimeout(() => setSynced(false), 3000);
      } else {
        setError("Sync failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSyncing(false);
  }

  return (
    <main className="min-h-screen bg-[#0D0D0D] px-4 py-6 max-w-[430px] mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/events" className="text-gray-400 text-xl">←</Link>
        <h1 className="text-xl font-black">Profile</h1>
      </div>

      <div className="text-center mb-8">
        {user.profilePic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.profilePic} alt={user.name} className="w-24 h-24 rounded-full mx-auto mb-3 object-cover border-2 border-[#FF6B35]" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-[#1A1A2E] flex items-center justify-center text-3xl font-black mx-auto mb-3 border-2 border-[#FF6B35]">
            {user.firstName[0]}
          </div>
        )}
        <h2 className="text-2xl font-black text-white">{user.name}</h2>
        {(user.city || user.country) && (
          <p className="text-gray-400 text-sm mt-1">
            📍 {[user.city, user.country].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-[#FF6B35]">{user.activityCount}</p>
          <p className="text-xs text-gray-400 mt-1">Runs Synced</p>
        </div>
        <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-[#FF6B35]">{user.totalKm.toFixed(0)}</p>
          <p className="text-xs text-gray-400 mt-1">Total KM</p>
        </div>
      </div>

      <div className="space-y-3">
        {error && <p className="text-[#E63946] text-sm text-center">{error}</p>}
        {synced && <p className="text-green-400 text-sm text-center">✓ Sync complete!</p>}

        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full bg-[#1A1A2E] border border-[#2A2A4A] hover:border-[#FF6B35] disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors"
        >
          {syncing ? "Syncing..." : "🔄 Re-sync Strava Activities"}
        </button>

        <a
          href="/auth/logout"
          className="block w-full text-center bg-[#E63946]/10 border border-[#E63946]/30 hover:bg-[#E63946]/20 text-[#E63946] font-bold py-4 rounded-2xl transition-colors"
        >
          Log Out
        </a>
      </div>
    </main>
  );
}
