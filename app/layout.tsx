import type { Metadata, Viewport } from "next";
import { priceText, raffle } from "@/lib/config";
import "./globals.css";

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const description = `${raffle.subtitle[raffle.defaultLanguage]} ${raffle.prize[raffle.defaultLanguage]} · ${priceText}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: raffle.title,
  description,
  openGraph: { title: `🎟️ ${raffle.title}`, description, type: "website" },
  twitter: { card: "summary_large_image", title: raffle.title, description },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={raffle.defaultLanguage}>
      <body>{children}</body>
    </html>
  );
}
