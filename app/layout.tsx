import type { Metadata } from "next";
import "./globals.css";
import ReconnectBanner from "./components/ReconnectBanner";

export const metadata: Metadata = {
  title: "RaceParty — Run together. Win alone.",
  description: "Predict your finish time, race with friends, see who nailed it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#0D0F14] text-[#F4F4F7] antialiased">
        <ReconnectBanner />
        {children}
      </body>
    </html>
  );
}
