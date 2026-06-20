import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function EventsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const events = await prisma.event.findMany({
    where: { participants: { some: { userId: session.userId } } },
    include: { _count: { select: { participants: true } } },
    orderBy: { date: "asc" },
  });

  return (
    <main className="min-h-screen bg-[#0D0D0D] px-4 py-6 max-w-[430px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black">
          Pack<span className="text-[#FF6B35]">Race</span>
        </h1>
        <Link href="/profile" className="text-gray-400 text-sm">Profile</Link>
      </div>

      <h2 className="text-lg font-bold text-gray-300 mb-4">Your Races</h2>

      {events.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <div className="text-5xl">🏁</div>
          <p className="text-gray-400">No races yet.</p>
          <p className="text-gray-500 text-sm">Create one or share an invite link with your group.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const daysUntil = Math.ceil((event.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const isPast = daysUntil < 0;
            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block bg-[#1A1A2E] border border-[#2A2A4A] rounded-2xl p-4 hover:border-[#FF6B35] transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-white">{event.name}</h3>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${isPast ? "bg-gray-700 text-gray-400" : "bg-[#FF6B35]/20 text-[#FF6B35]"}`}>
                    {isPast ? "Finished" : `${daysUntil}d`}
                  </span>
                </div>
                <div className="flex gap-4 text-sm text-gray-400">
                  <span>📍 {event.distanceKm}km</span>
                  <span>👥 {event._count.participants}</span>
                  <span>📅 {event.date.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                </div>
                {event.location && (
                  <p className="text-xs text-gray-500 mt-1">{event.location}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <Link
        href="/events/new"
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#FF6B35] rounded-full flex items-center justify-center text-2xl font-bold shadow-lg hover:bg-[#e5602f] transition-colors"
      >
        +
      </Link>
    </main>
  );
}
