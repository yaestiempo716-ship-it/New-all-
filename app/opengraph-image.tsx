import { ImageResponse } from "next/og";
import { priceText, raffle } from "@/lib/config";

export const alt = raffle.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview picture shown when the link is shared on WhatsApp, Instagram, etc. */
export default function OgImage() {
  const lang = raffle.defaultLanguage;
  const sample = [7, 12, 21, 33, 42, 56, 64, 77, 88];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(900px 500px at 50% 0%, #3a2580 0%, #0b0b14 70%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 30, color: "#ffc83d", letterSpacing: 6, fontWeight: 800 }}>{lang === "es" ? "RIFA" : "RAFFLE"}</div>
        <div style={{ fontSize: 110, fontWeight: 900, marginTop: 10, color: "#ffd66b" }}>{raffle.title}</div>
        <div style={{ fontSize: 40, marginTop: 6, color: "#d8d6f5" }}>{`${raffle.prize[lang]} · ${priceText}`}</div>
        <div style={{ display: "flex", gap: 16, marginTop: 44 }}>
          {sample.map((n, i) => (
            <div
              key={n}
              style={{
                width: 92,
                height: 92,
                borderRadius: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 38,
                fontWeight: 800,
                background: i % 3 === 1 ? "#2ee59d33" : "#1a1a35",
                border: i % 3 === 1 ? "2px solid #2ee59d" : "2px solid #ffc83d",
                color: i % 3 === 1 ? "#2ee59d" : "#fff",
              }}
            >
              {String(n).padStart(2, "0")}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 30, marginTop: 40, color: "#a4a2c8" }}>{raffle.drawDate[lang]}</div>
      </div>
    ),
    size,
  );
}
