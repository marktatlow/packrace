import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PackRace — Run together. Win alone.",
  description: "Competitive running handicap app for friends",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#0D0D0D] text-white antialiased">{children}</body>
    </html>
  );
}
