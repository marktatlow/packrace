"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function deleteAccount() {
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      router.push("/");
    } else {
      setDeleting(false);
      setShowConfirm(false);
      alert("Deletion failed — please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0D12] max-w-[430px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <a href="/events" className="text-white/50 text-xl hover:text-white transition-colors">←</a>
        <img src="/raceparty-wordmarkx.png" alt="RaceParty" className="h-7 w-auto" />
        <div className="w-7" />
      </div>

      {/* Profile card — data loaded server-side via separate API */}
      <ProfileCard />

      <div className="space-y-3 mt-6">
        <a
          href="/auth/strava"
          className="flex items-center justify-center gap-3 w-full bg-[#FC4C02] text-white font-bold py-4 rounded-2xl text-base shadow-[0_0_16px_rgba(252,76,2,0.3)] hover:shadow-[0_0_24px_rgba(252,76,2,0.4)] transition-shadow"
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

        {/* Delete account */}
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full text-red-400 text-xs font-semibold py-3 hover:text-red-300 transition-colors"
          >
            Delete my account & data
          </button>
        ) : (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 space-y-3">
            <p className="text-sm text-white/80 font-semibold text-center">This will permanently delete your account, all your predictions, results and disconnect Strava.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-sm disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// Separate component to load profile data client-side
function ProfileCard() {
  const [user, setUser] = useState<{ firstName: string; lastName: string; profilePic: string | null; city: string | null; country: string | null } | null>(null);

  if (typeof window !== "undefined" && !user) {
    fetch("/api/me").then(r => r.json()).then(d => {
      if (d.firstName) setUser(d);
    }).catch(() => {});
  }

  if (!user) return (
    <div className="bg-[#12151D] border border-white/8 rounded-2xl p-6 flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-white/5 animate-pulse" />
      <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
    </div>
  );

  return (
    <div className="bg-[#12151D] border border-white/8 rounded-2xl p-6 flex flex-col items-center gap-4">
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
  );
}
