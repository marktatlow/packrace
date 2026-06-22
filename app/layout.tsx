import type { Metadata } from "next";
import "./globals.css";
import ReconnectBanner from "./components/ReconnectBanner";

export const metadata: Metadata = {
  title: "RaceParty — Let's Party",
  description: "Predict your finish time, race with friends, and get roasted by AI. Predict. Race. Get Roasted.",
  openGraph: {
    title: "RaceParty — Let's Party",
    description: "Predict your finish time, race with friends, and get roasted by AI.",
    url: "https://raceparty.run",
    siteName: "RaceParty",
    images: [
      {
        url: "https://raceparty.run/og-image.png",
        width: 512,
        height: 512,
        alt: "RaceParty",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "RaceParty — Let's Party",
    description: "Predict your finish time, race with friends, and get roasted by AI.",
    images: ["https://raceparty.run/og-image.png"],
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
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
