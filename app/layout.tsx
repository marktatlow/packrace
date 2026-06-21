import type { Metadata } from "next";
import "./globals.css";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ReconnectBanner from "./components/ReconnectBanner";

export const metadata: Metadata = {
  title: "PackRace — Run together. Win alone.",
  description: "Competitive running handicap app for friends",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  let needsReconnect = false;

  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { needsReconnect: true },
    });
    needsReconnect = user?.needsReconnect ?? false;
  }

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#0D0D0D] text-white antialiased">
        {needsReconnect && <ReconnectBanner />}
        {children}
      </body>
    </html>
  );
}
