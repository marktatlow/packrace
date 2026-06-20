import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { _count: { select: { activities: true } } },
  });

  if (!user) redirect("/");

  const totalKm = await prisma.activity.aggregate({
    where: { userId: user.id },
    _sum: { distanceMeters: true },
  });

  return (
    <ProfileClient
      user={{
        name: user.name,
        firstName: user.firstName,
        profilePic: user.profilePic,
        city: user.city,
        country: user.country,
        activityCount: user._count.activities,
        totalKm: (totalKm._sum.distanceMeters || 0) / 1000,
      }}
    />
  );
}
